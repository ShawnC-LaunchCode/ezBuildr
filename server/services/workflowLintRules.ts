/**
 * Pure workflow lint rules.
 *
 * These operate on an already-serialized workflow (the same shape
 * `VersionService.serializeWorkflow` produces) and perform no I/O. They live
 * in their own module, separate from `WorkflowLintService`, so that
 * `VersionService` can gate publishing on them without creating a module cycle
 * — `WorkflowLintService` imports `versionService` to do its own
 * serialization, so a direct `VersionService -> WorkflowLintService` import
 * would be circular (RUN2-7).
 *
 * `WorkflowLintService.lint()` (serialize-then-lint, used by the workflow
 * routes) and `VersionService.publishVersion()` (which already holds the
 * serialized graph) both call `lintWorkflowContent`, so there is exactly one
 * implementation of these rules.
 */

import {
  buildConditionDependencyGraphFromEdges,
  detectCycles,
  detectDanglingReferences,
  extractConditionReferences,
  type ConditionDependencyEdge,
  type ConditionDependencyGraph,
} from "@shared/conditionGraph";
import type {
  WorkflowLintCategory,
  WorkflowLintIssue,
  WorkflowLintTarget,
} from "@shared/types/workflowLint";

export type LintResult = WorkflowLintIssue;

interface ReferenceSets {
  stepAliases: Set<string>;
  stepRefs: Set<string>;
  sectionRefs: Set<string>;
}

/** Serialized workflow content, as produced by `VersionService.serializeWorkflow`. */
export interface LintableWorkflowContent {
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workflow definitions contain extensible dynamic configuration.
  sections?: Record<string, any>[];
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workflow definitions contain extensible dynamic configuration.
  logicRules?: Record<string, any>[];
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workflow definitions contain extensible dynamic configuration.
  transformBlocks?: Record<string, any>[];
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workflow definitions contain extensible dynamic configuration.
  lifecycleHooks?: Record<string, any>[];
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workflow definitions contain extensible dynamic configuration.
  documentHooks?: Record<string, any>[];
}

/**
 * Build the reference sets used to validate logic-rule targets/conditions and
 * visibleIf/input-key expressions.
 *
 * `VersionService.serializeWorkflow` never emits a `section.alias` field — a
 * section rule's `targetAlias` is the section **title**, and a step-condition's
 * `conditionStepAlias` falls back to the raw step **id** when the step has no
 * alias. So logic-rule references must be checked against ids-and-titles
 * (sections) or ids-and-aliases (steps), not against a step-alias-only set.
 * `stepAliases` is kept separate (alias-only) for visibleIf/input-key checks,
 * which only ever reference human-typed step aliases.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workflow definitions contain extensible dynamic configuration.
function collectReferenceSets(sections: Record<string, any>[]): ReferenceSets {
  const stepAliases = new Set<string>();
  const stepRefs = new Set<string>();
  const sectionRefs = new Set<string>();

  for (const section of sections) {
// eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- Workflow definitions contain extensible dynamic configuration.
    sectionRefs.add(section.id);
// eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- Workflow definitions contain extensible dynamic configuration.
    if (section.title) { sectionRefs.add(section.title); }

    for (const step of section.steps || []) {
// eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access -- Workflow definitions contain extensible dynamic configuration.
      stepRefs.add(step.id);
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- Workflow definitions contain extensible dynamic configuration.
      if (step.alias) {
// eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access -- Workflow definitions contain extensible dynamic configuration.
        stepAliases.add(step.alias);
// eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access -- Workflow definitions contain extensible dynamic configuration.
        stepRefs.add(step.alias);
      }
    }
  }

  return { stepAliases, stepRefs, sectionRefs };
}

function lintSections(
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workflow definitions contain extensible dynamic configuration.
  sections: Record<string, any>[],
  results: LintResult[]
): boolean {
  let hasSteps = false;
  for (const section of sections) {
    const rawSteps: unknown = section.steps;
    const steps = Array.isArray(rawSteps) ? rawSteps as Record<string, unknown>[] : [];
    if (steps.length > 0) {hasSteps = true;}

    for (const step of steps) {
      const stepId = String(step.id);
      const stepLabel = String(step.title ?? step.id);
      const stepTarget: WorkflowLintTarget = {
        tab: "sections",
        sectionId: String(section.id),
        stepId,
      };
      if (!step.alias) {
        results.push({
          type: "warning",
          category: "questions",
          message: `Step "${stepLabel}" has no alias.`,
          target: stepTarget,
        });
      }
      if (!step.title) {
        results.push({
          type: "warning",
          category: "questions",
          message: `A step in section "${section.title}" is missing a title.`,
          target: stepTarget,
        });
      }
    }
  }
  return hasSteps;
}

/**
 * Node identity for the visibleIf dependency graph: a step keyed by its
 * alias participates as both a source and a valid reference target (an
 * operand naming that alias resolves to this node); a step without an
 * alias, or a section (sections have no alias at all — nothing can
 * reference one by name), is only ever a source, keyed by a synthetic id
 * that can never collide with a real alias.
 */
function conditionGraphNodeId(kind: "step" | "section", id: string, alias?: unknown): string {
  if (kind === "step" && typeof alias === "string" && alias.length > 0) {
    return alias;
  }
  return `__${kind}__:${id}`;
}

interface ConditionGraphNodeInfo {
  target: WorkflowLintTarget;
  label: string;
}

/**
 * Build the visibleIf dependency graph plus a lookup back to a real lint
 * target per node.
 *
 * A step is legitimately referenceable by TWO different strings: its alias
 * (the normal case) and its raw id — `ConditionRow.tsx` falls back to
 * `v.id` as the `<SelectItem>` value whenever a step has no alias, so a
 * condition can legally store either. Both must resolve to the SAME
 * canonical node, or a step would show up as two different graph nodes and
 * corrupt cycle detection (a spurious self-reference through the two keys,
 * or a real cycle missed because it "exits" through the id-node instead of
 * the alias-node). `resolve` is built in a first pass over every step
 * before any edges are added, so a reference can resolve regardless of
 * whether it names the referenced step's alias or its id.
 */
function buildWorkflowConditionGraph(
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workflow definitions contain extensible dynamic configuration.
  sections: Record<string, any>[]
): { graph: ConditionDependencyGraph; info: Map<string, ConditionGraphNodeInfo> } {
  const info = new Map<string, ConditionGraphNodeInfo>();
  const resolve = new Map<string, string>(); // alias-or-raw-id -> canonical node id
  const nodeIds: string[] = [];
  const pending: { key: string; visibleIf: unknown }[] = [];

  for (const section of sections) {
    const sectionId = String(section.id);
    const sectionKey = conditionGraphNodeId("section", sectionId);
    nodeIds.push(sectionKey);
    info.set(sectionKey, {
      target: { tab: "sections", sectionId },
      label: `Section "${String(section.title)}"`,
    });
    pending.push({ key: sectionKey, visibleIf: section.visibleIf });

    const rawSteps: unknown = section.steps;
    const steps = Array.isArray(rawSteps) ? rawSteps as Record<string, unknown>[] : [];
    for (const step of steps) {
      const stepId = String(step.id);
      const stepKey = conditionGraphNodeId("step", stepId, step.alias);
      nodeIds.push(stepKey);
      info.set(stepKey, {
        target: { tab: "sections", sectionId, stepId },
        label: `Step "${String(step.title ?? stepId)}"`,
      });
      pending.push({ key: stepKey, visibleIf: step.visibleIf });

      resolve.set(stepId, stepKey);
      if (typeof step.alias === "string" && step.alias.length > 0) {
        resolve.set(step.alias, stepKey);
      }
    }
  }

  // Second pass: now that every step/section is known, extract each node's
  // visibleIf references and resolve them to a canonical node id. A
  // reference that resolves to nothing is left as-is — it will not match
  // any registered node id, so `detectDanglingReferences` reports it
  // (correctly) as dangling instead of silently dropping it.
  const edges: ConditionDependencyEdge[] = [];
  for (const node of pending) {
    for (const ref of extractConditionReferences(node.visibleIf)) {
      edges.push({ from: node.key, to: resolve.get(ref) ?? ref });
    }
  }

  return { graph: buildConditionDependencyGraphFromEdges(nodeIds, edges), info };
}

/**
 * Detect circular and dangling references among `visibleIf` conditions
 * (Model A only — logic_rules/Model B is out of scope, see LU-3 Decision #3).
 *
 * Complexity: O(V + E), inherited directly from `detectCycles` /
 * `detectDanglingReferences` in `shared/conditionGraph.ts` — this function
 * itself does one O(V + E) pass to build the graph and node-info lookup, and
 * one O(cycles + dangling refs) pass to turn results into findings.
 */
function lintConditionDependencies(
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workflow definitions contain extensible dynamic configuration.
  sections: Record<string, any>[],
  results: LintResult[]
): void {
  const { graph, info } = buildWorkflowConditionGraph(sections);

  const reportedCycles = new Set<string>();
  for (const cycle of detectCycles(graph)) {
    const key = [...new Set(cycle.path)].sort().join("|");
    if (reportedCycles.has(key)) { continue; }
    reportedCycles.add(key);

    const labels = cycle.path.map((nodeId) => info.get(nodeId)?.label ?? nodeId);
    // `detectCycles` never emits an empty path, but under the strict zones'
    // noUncheckedIndexedAccess an index read is `string | undefined`, so the
    // first node is destructured and checked rather than asserted.
    const [firstNode] = cycle.path;
    const target = (firstNode === undefined ? undefined : info.get(firstNode)?.target)
      ?? { tab: "sections" };
    results.push({
      type: "error",
      category: "logic",
      message: `Circular visibleIf reference detected: ${labels.join(" -> ")}`,
      target,
    });
  }

  for (const { from, to } of detectDanglingReferences(graph)) {
    const nodeInfo = info.get(from);
    results.push({
      type: "error",
      category: "logic",
      message: `${nodeInfo?.label ?? from} visibleIf condition references unknown alias: "${to}"`,
      target: nodeInfo?.target ?? { tab: "sections" },
    });
  }
}

function lintLogicRules(
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workflow definitions contain extensible dynamic configuration.
  rules: Record<string, any>[],
  stepRefs: Set<string>,
  sectionRefs: Set<string>,
  results: LintResult[]
): void {
  for (const rule of rules) {
    // Prefer the id field the serializer always emits alongside the alias;
    // the alias field is only a fallback for rules where the id is absent.
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Workflow definitions contain extensible dynamic configuration.
    const conditionRef = rule.conditionStepId ?? rule.conditionStepAlias;
// eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- Workflow definitions contain extensible dynamic configuration.
    if (conditionRef && !stepRefs.has(conditionRef)) {
      results.push({
        type: "error",
        category: "logic",
        message: `Logic rule condition references unknown alias: "${conditionRef}"`,
        target: { tab: "sections", panel: "logic" },
      });
    }

    const targetRefs = rule.targetType === "section" ? sectionRefs : stepRefs;
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Workflow definitions contain extensible dynamic configuration.
    const targetRef = rule.targetId ?? rule.targetAlias;
// eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- Workflow definitions contain extensible dynamic configuration.
    if (targetRef && !targetRefs.has(targetRef)) {
      results.push({
        type: "error",
        category: "logic",
        message: `Logic rule target references unknown alias: "${targetRef}"`,
        target: { tab: "sections", panel: "logic" },
      });
    }
  }
}

/** How one family of input-consuming blocks reports and links its findings. */
interface BlockLintKind {
  /** Human label used in the message, e.g. "Transform block". */
  typeName: string;
  category: WorkflowLintCategory;
  tab: WorkflowLintTarget["tab"];
}

function lintBlocksWithInputs(
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workflow definitions contain extensible dynamic configuration.
  blocks: Record<string, any>[],
  kind: BlockLintKind,
  validAliases: Set<string>,
  results: LintResult[]
): void {
  for (const b of blocks) {
    if (b.inputKeys) {
      for (const k of b.inputKeys) {
// eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- Workflow definitions contain extensible dynamic configuration.
        if (!validAliases.has(k)) {
          results.push({
            type: "error",
            category: kind.category,
            message: `${kind.typeName} "${b.name}" references unknown input alias: "${k}"`,
            target: { tab: kind.tab, blockId: String(b.id) },
          });
        }
      }
    }
  }
}

/**
 * Lint an already-serialized workflow. Returns errors and warnings; callers
 * decide what to block on (activation and publishing block on `type: "error"`).
 */
export function lintWorkflowContent(data: LintableWorkflowContent): LintResult[] {
  const results: LintResult[] = [];

// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- Workflow definitions contain extensible dynamic configuration.
  const sections = data.sections || [];
  if (sections.length === 0) {
    results.push({
      type: "error",
      category: "questions",
      message: "Workflow must have at least one section.",
      target: { tab: "sections" },
    });
  }

  const { stepAliases, stepRefs, sectionRefs } = collectReferenceSets(sections);
  const hasSteps = lintSections(sections, results);

  if (sections.length > 0 && !hasSteps) {
    results.push({
      type: "error",
      category: "questions",
      message: "Workflow must have at least one question.",
      target: { tab: "sections" },
    });
  }

  // LU-3: circular and dangling references among visibleIf conditions
  // (Model A). Model B (logic_rules) reference checks stay in lintLogicRules
  // below — out of scope here per Decision #3.
  lintConditionDependencies(sections, results);

// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- Workflow definitions contain extensible dynamic configuration.
  lintLogicRules(data.logicRules || [], stepRefs, sectionRefs, results);
// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- Workflow definitions contain extensible dynamic configuration.
  lintBlocksWithInputs(data.transformBlocks || [], { typeName: "Transform block", category: "logic", tab: "sections" }, stepAliases, results);
// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- Workflow definitions contain extensible dynamic configuration.
  lintBlocksWithInputs(data.lifecycleHooks || [], { typeName: "Lifecycle hook", category: "integrations", tab: "sections" }, stepAliases, results);
// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- Workflow definitions contain extensible dynamic configuration.
  lintBlocksWithInputs(data.documentHooks || [], { typeName: "Document hook", category: "documents", tab: "templates" }, stepAliases, results);

  return results;
}
