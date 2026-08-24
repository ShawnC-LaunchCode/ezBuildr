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
  analyzeWorkflowFlow,
  buildConditionDependencyGraphFromEdges,
  detectCycles,
  detectDanglingReferences,
  extractConditionReferences,
  type ConditionDependencyEdge,
  type ConditionDependencyGraph,
  type WorkflowFlowEdge,
  type WorkflowFlowNode,
} from "@shared/conditionGraph";
import type {
  WorkflowLintCategory,
  WorkflowLintIssue,
  WorkflowLintTarget,
} from "@shared/types/workflowLint";

export type LintResult = WorkflowLintIssue;

type LintSectionRecord = Record<string, unknown>;

interface ReferenceSets {
  stepAliases: Set<string>;
  stepRefs: Set<string>;
  pageRefs: Set<string>;
}

/** Serialized workflow content, as produced by `VersionService.serializeWorkflow`. */
export interface LintableWorkflowContent {
  sections?: LintSectionRecord[];
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workflow definitions contain extensible dynamic configuration.
  pages?: Record<string, any>[];
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
 * `VersionService.serializeWorkflow` never emits a `page.alias` field — a
 * page rule's `targetAlias` is the page **title**, and a step-condition's
 * `conditionStepAlias` falls back to the raw step **id** when the step has no
 * alias. So logic-rule references must be checked against ids-and-titles
 * (pages) or ids-and-aliases (steps), not against a step-alias-only set.
 * `stepAliases` is kept separate (alias-only) for visibleIf/input-key checks,
 * which only ever reference human-typed step aliases.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workflow definitions contain extensible dynamic configuration.
function collectReferenceSets(pages: Record<string, any>[]): ReferenceSets {
  const stepAliases = new Set<string>();
  const stepRefs = new Set<string>();
  const pageRefs = new Set<string>();

  for (const page of pages) {
// eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- Workflow definitions contain extensible dynamic configuration.
    pageRefs.add(page.id);
// eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- Workflow definitions contain extensible dynamic configuration.
    if (page.title) { pageRefs.add(page.title); }

    for (const step of page.steps || []) {
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

  return { stepAliases, stepRefs, pageRefs };
}

function lintPages(
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workflow definitions contain extensible dynamic configuration.
  pages: Record<string, any>[],
  results: LintResult[]
): boolean {
  let hasSteps = false;
  for (const page of pages) {
    const rawSteps: unknown = page.steps;
    const steps = Array.isArray(rawSteps) ? rawSteps as Record<string, unknown>[] : [];
    if (steps.length > 0) {hasSteps = true;}

    for (const step of steps) {
      const stepId = String(step.id);
      const stepLabel = String(step.title ?? step.id);
      const stepTarget: WorkflowLintTarget = {
        tab: "pages",
        pageId: String(page.id),
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
          message: `A step in page "${page.title}" is missing a title.`,
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
 * alias, or a page (pages have no alias at all — nothing can
 * reference one by name), is only ever a source, keyed by a synthetic id
 * that can never collide with a real alias.
 */
function conditionGraphNodeId(kind: "step" | "page" | "section", id: string, alias?: unknown): string {
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
  pages: Record<string, unknown>[],
  sections: LintSectionRecord[]
): { graph: ConditionDependencyGraph; info: Map<string, ConditionGraphNodeInfo> } {
  const info = new Map<string, ConditionGraphNodeInfo>();
  const resolve = new Map<string, string>(); // alias-or-raw-id -> canonical node id
  const nodeIds: string[] = [];
  const pending: { key: string; visibleIf: unknown }[] = [];

  for (const section of sections) {
    const sectionId = String(section.id);
    const sectionKey = conditionGraphNodeId("section", sectionId);
    const firstPage = orderFlowPages(pages.filter((page) => page.sectionId === section.id))[0];
    nodeIds.push(sectionKey);
    info.set(sectionKey, {
      target: firstPage === undefined ? { tab: "pages" } : { tab: "pages", pageId: firstPage.id },
      label: `Section "${String(section.title)}"`,
    });
    pending.push({ key: sectionKey, visibleIf: section.visibleIf });
  }

  for (const page of pages) {
    const pageId = String(page.id);
    const pageKey = conditionGraphNodeId("page", pageId);
    nodeIds.push(pageKey);
    info.set(pageKey, {
      target: { tab: "pages", pageId },
      label: `Page "${String(page.title)}"`,
    });
    pending.push({ key: pageKey, visibleIf: page.visibleIf });

    const rawSteps: unknown = page.steps;
    const steps = Array.isArray(rawSteps) ? rawSteps as Record<string, unknown>[] : [];
    for (const step of steps) {
      const stepId = String(step.id);
      const stepKey = conditionGraphNodeId("step", stepId, step.alias);
      nodeIds.push(stepKey);
      info.set(stepKey, {
        target: { tab: "pages", pageId, stepId },
        label: `Step "${String(step.title ?? stepId)}"`,
      });
      pending.push({ key: stepKey, visibleIf: step.visibleIf });

      resolve.set(stepId, stepKey);
      if (typeof step.alias === "string" && step.alias.length > 0) {
        resolve.set(step.alias, stepKey);
      }
    }
  }

  // Second pass: now that every step/page is known, extract each node's
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
  pages: Record<string, unknown>[],
  sections: LintSectionRecord[],
  results: LintResult[]
): void {
  const { graph, info } = buildWorkflowConditionGraph(pages, sections);

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
      ?? { tab: "pages" };
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
      target: nodeInfo?.target ?? { tab: "pages" },
    });
  }
}

function containsScriptCondition(node: unknown): boolean {
  if (node === null || typeof node !== "object") { return false; }
  const value = node as Record<string, unknown>;
  if (value.type === "script") { return true; }
  return Array.isArray(value.conditions) && value.conditions.some(containsScriptCondition);
}

function hasNonEmptyCondition(node: unknown): boolean {
  if (node === null || typeof node !== "object") { return false; }
  const value = node as Record<string, unknown>;
  if (value.type === "condition") {
    return typeof value.variable === "string" && value.variable.length > 0;
  }
  if (value.type === "script") {
    return typeof value.code === "string" && value.code.length > 0;
  }
  return Array.isArray(value.conditions) && value.conditions.some(hasNonEmptyCondition);
}

/** Section visibility may only depend on questions the respondent has already passed. */
function lintSectionConditions(
  sections: LintSectionRecord[],
  pages: Record<string, unknown>[],
  results: LintResult[]
): void {
  const orderedPages = orderFlowPages(pages);
  const stepPageOrder = new Map<string, number>();
  for (const { page, order } of orderedPages) {
    const rawSteps: unknown = page.steps;
    const steps = Array.isArray(rawSteps) ? rawSteps as Record<string, unknown>[] : [];
    for (const step of steps) {
      stepPageOrder.set(String(step.id), order);
      if (typeof step.alias === "string" && step.alias.length > 0) {
        stepPageOrder.set(step.alias, order);
      }
    }
  }

  for (const section of sections) {
    const memberPages = orderedPages.filter(({ page }) => page.sectionId === section.id);
    const firstPage = memberPages[0];
    const target: WorkflowLintTarget = firstPage === undefined
      ? { tab: "pages" }
      : { tab: "pages", pageId: firstPage.id };
    const label = `Section "${String(section.title)}"`;

    if (containsScriptCondition(section.visibleIf)) {
      results.push({
        type: "error",
        category: "logic",
        message: `${label} visibleIf cannot use script conditions because their dependencies are opaque.`,
        target,
      });
    }
    if (firstPage === undefined) { continue; }

    const reportedRefs = new Set<string>();
    for (const ref of extractConditionReferences(section.visibleIf)) {
      const sourceOrder = stepPageOrder.get(ref);
      if (sourceOrder === undefined || sourceOrder < firstPage.order || reportedRefs.has(ref)) { continue; }
      reportedRefs.add(ref);
      results.push({
        type: "error",
        category: "logic",
        message: `${label} visibleIf must reference only questions on pages before the Section; "${ref}" is in the same Section or a later page.`,
        target,
      });
    }
  }
}

/** V1 does not attempt implication analysis between a skip rule and a Section condition. */
function lintConditionalSectionSkipTargets(
  sections: LintSectionRecord[],
  pages: Record<string, unknown>[],
  rules: Record<string, unknown>[],
  results: LintResult[]
): void {
  const conditionalSectionById = new Map(
    sections
      .filter((section) => hasNonEmptyCondition(section.visibleIf))
      .map((section) => [String(section.id), section] as const)
  );
  const pageById = new Map(pages.map((page) => [String(page.id), page] as const));

  for (const rule of rules) {
    if (rule.action !== "skip_to" || rule.targetType !== "page") { continue; }
    const targetId = typeof rule.targetId === "string" ? rule.targetId : null;
    const targetPage = targetId === null ? undefined : pageById.get(targetId);
    const sectionId = typeof targetPage?.sectionId === "string" ? targetPage.sectionId : null;
    const section = sectionId === null ? undefined : conditionalSectionById.get(sectionId);
    if (!section) { continue; }
    results.push({
      type: "error",
      category: "logic",
      message: `Skip-to rule cannot target page "${String(targetPage?.title ?? targetId)}" because Section "${String(section.title)}" has conditional visibility. Target an ungrouped page or a page in an unconditional Section.`,
      target: { tab: "pages", pageId: targetId ?? undefined, panel: "logic" },
    });
  }
}

const FLOW_TERMINAL_ID = "__complete__";

interface WorkflowFlowGraph {
  nodes: WorkflowFlowNode[];
  edges: WorkflowFlowEdge[];
  info: Map<string, ConditionGraphNodeInfo>;
}

/** `{ id, order }` plus the page's own record, sorted by `order`. */
interface OrderedFlowPage {
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workflow definitions contain extensible dynamic configuration.
  page: Record<string, any>;
  id: string;
  order: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workflow definitions contain extensible dynamic configuration.
function orderFlowPages(pages: Record<string, any>[]): OrderedFlowPage[] {
  return pages
    .map((page, index) => ({
      page,
      id: String(page.id),
      order: typeof page.order === "number" ? page.order : index,
    }))
    .sort((a, b) => a.order - b.order);
}

/**
 * Pages that can never be shown to any respondent: the target of an
 * UNCONDITIONAL `hide` rule (`when` null/absent — "always fires", per
 * `shared/workflowLogic.ts`'s `evaluateCondition`) with no `show` rule also
 * targeting it. A `show` target's visibility is governed entirely by whether
 * that show rule fires (`evaluateWorkflowVisibility`), so an unconditional
 * hide sharing a target with any show rule is not actually a guaranteed
 * always-off — excluded here rather than mis-flagged.
 */
function findAlwaysHiddenPageIds(
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workflow definitions contain extensible dynamic configuration.
  rules: Record<string, any>[],
  knownPageIds: Set<string>
): Set<string> {
  const showTargets = new Set<string>();
  const unconditionalHideTargets = new Set<string>();
  for (const rule of rules) {
    if (rule.targetType !== "page") { continue; }
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Workflow definitions contain extensible dynamic configuration.
    const targetId = rule.targetId;
    if (typeof targetId !== "string" || !knownPageIds.has(targetId)) { continue; }
    if (rule.action === "show") { showTargets.add(targetId); }
    if (rule.action === "hide" && (rule.when === null || rule.when === undefined)) {
      unconditionalHideTargets.add(targetId);
    }
  }
  return new Set([...unconditionalHideTargets].filter((id) => !showTargets.has(id)));
}

interface FlowPageMaps {
  info: Map<string, ConditionGraphNodeInfo>;
  pageOrderById: Map<string, number>;
  stepToPageId: Map<string, string>;
}

/** First pass over the ordered pages: node-info lookup, order-by-id, and a step-id/alias -> page-id resolver. */
function buildFlowPageMaps(ordered: OrderedFlowPage[]): FlowPageMaps {
  const info = new Map<string, ConditionGraphNodeInfo>();
  const pageOrderById = new Map<string, number>();
  const stepToPageId = new Map<string, string>();

  for (const { page, id, order } of ordered) {
    pageOrderById.set(id, order);
    info.set(id, { target: { tab: "pages", pageId: id }, label: `Page "${String(page.title)}"` });

    const rawSteps: unknown = page.steps;
    const steps = Array.isArray(rawSteps) ? rawSteps as Record<string, unknown>[] : [];
    for (const step of steps) {
      stepToPageId.set(String(step.id), id);
      if (typeof step.alias === "string" && step.alias.length > 0) {
        stepToPageId.set(step.alias, id);
      }
    }
  }
  info.set(FLOW_TERMINAL_ID, { target: { tab: "pages" }, label: "Complete" });

  return { info, pageOrderById, stepToPageId };
}

/**
 * `sequential` edges following `order`, bypassing any always-hidden page
 * forward to the next non-hidden one (or the terminal) so it loses its own
 * inbound edge (see `buildWorkflowFlowGraph`) without cutting reachability
 * for what follows it.
 */
function buildSequentialFlowEdges(
  ordered: OrderedFlowPage[],
  alwaysHidden: Set<string>
): WorkflowFlowEdge[] {
  const edges: WorkflowFlowEdge[] = [];
  for (let i = 0; i < ordered.length; i++) {
    // The loop bound guarantees `ordered[i]` exists, but under the strict
    // zones' `noUncheckedIndexedAccess` an indexed read is `T | undefined`
    // regardless — checked rather than asserted (matches the `[firstNode]`
    // pattern in `shared/conditionGraph.ts`'s `detectCycles`/`lintConditionDependencies`).
    const current = ordered[i];
    if (current === undefined) { continue; }

    let next = i + 1;
    let nextPage = ordered[next];
    while (nextPage !== undefined && alwaysHidden.has(nextPage.id)) {
      next++;
      nextPage = ordered[next];
    }
    const toId = nextPage !== undefined ? nextPage.id : FLOW_TERMINAL_ID;
    edges.push({ id: `sequential:${current.id}->${toId}`, from: current.id, to: toId, kind: "sequential" });
  }
  return edges;
}

/** One `skip` edge per resolvable `skip_to` page rule, from its condition's page to its target page. */
function buildSkipFlowEdges(
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workflow definitions contain extensible dynamic configuration.
  rules: Record<string, any>[],
  maps: FlowPageMaps,
  alwaysHidden: Set<string>
): WorkflowFlowEdge[] {
  const edges: WorkflowFlowEdge[] = [];

  for (const rule of rules) {
    if (rule.action !== "skip_to" || rule.targetType !== "page") { continue; }
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Workflow definitions contain extensible dynamic configuration.
    const targetId = rule.targetId;
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Workflow definitions contain extensible dynamic configuration.
    const conditionRef = rule.conditionStepId ?? rule.conditionStepAlias;
    if (typeof targetId !== "string" || typeof conditionRef !== "string") { continue; }
    const fromId = maps.stepToPageId.get(conditionRef);
    // A rule whose condition or target does not resolve to a known
    // step/page produces no edge — not this analysis's job to flag
    // (lintLogicRules already reports the dangling reference).
    if (fromId === undefined || !maps.pageOrderById.has(targetId) || alwaysHidden.has(targetId)) { continue; }

    edges.push({ id: String(rule.id), from: fromId, to: targetId, kind: "skip" });
  }

  return edges;
}

/**
 * Build the page-level navigational graph `analyzeWorkflowFlow` walks:
 * one node per page plus a synthetic terminal, `sequential` edges
 * following `order`, and `skip` edges from a `skip_to` rule's condition
 * page to its target page.
 *
 * An always-hidden page (see `findAlwaysHiddenPageIds`) gets no
 * INCOMING edge of either kind — nothing can land there, matching how
 * `calculateNextPage`/`resolveNextPage` skip straight past a hidden
 * page at run time. `sequential` edges bypass it forward (to the next
 * non-hidden page, or the terminal) so pages after it stay reachable;
 * its own outgoing edge is unaffected.
 */
function buildWorkflowFlowGraph(
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workflow definitions contain extensible dynamic configuration.
  pages: Record<string, any>[],
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workflow definitions contain extensible dynamic configuration.
  rules: Record<string, any>[]
): WorkflowFlowGraph {
  const ordered = orderFlowPages(pages);
  const maps = buildFlowPageMaps(ordered);
  const alwaysHidden = findAlwaysHiddenPageIds(rules, new Set(maps.pageOrderById.keys()));

  const nodes: WorkflowFlowNode[] = ordered.map(({ id, order }) => ({ id, kind: "page", order }));
  const maxOrder = maps.pageOrderById.size > 0 ? Math.max(...maps.pageOrderById.values()) : 0;
  nodes.push({ id: FLOW_TERMINAL_ID, kind: "terminal", order: maxOrder + 1 });

  const sequentialEdges = buildSequentialFlowEdges(ordered, alwaysHidden);
  const skipFlowEdges = buildSkipFlowEdges(rules, maps, alwaysHidden);

  return { nodes, edges: [...sequentialEdges, ...skipFlowEdges], info: maps.info };
}

/**
 * Detect unreachable pages, dead ends, and skip_to loop risk (GH-153 AC4,
 * MAP-3). Distinct from `lintConditionDependencies` above: that graph is
 * `visibleIf` (pull, Model A); this one is the page-to-page
 * navigational graph (`sequential` order + `skip_to` push edges), analyzed
 * by `analyzeWorkflowFlow` in `shared/conditionGraph.ts`.
 *
 * A backward (or same-position) `skip_to` is flagged elsewhere, not here:
 * `checkSkipDirection` in `server/services/workflowStructureRules.ts` is the
 * single source for that finding (repo owner's ruling, 2026-08-08) — a rule
 * that can never fire is a dead rule regardless of whether
 * `isForwardSkipTarget` (`shared/workflowLogic.ts`, RUN2-2) also keeps it
 * from ever executing at run time, and the realistic way an author hits it
 * is an unvalidated page reorder (`PageService.reorderPages`)
 * silently turning a working forward rule into a dead one — a regression an
 * `error` belongs to, not a `warning` that would still let it publish
 * unnoticed. Duplicating it here as a warning would give the same rule two
 * conflicting severities on one publish gate.
 */
function lintWorkflowFlow(
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workflow definitions contain extensible dynamic configuration.
  pages: Record<string, any>[],
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workflow definitions contain extensible dynamic configuration.
  rules: Record<string, any>[],
  results: LintResult[]
): void {
  if (pages.length === 0) { return; } // "must have at least one page" already covers this

  const { nodes, edges, info } = buildWorkflowFlowGraph(pages, rules);
  const diagnostics = analyzeWorkflowFlow(nodes, edges);

  for (const id of diagnostics.unreachable) {
    const nodeInfo = info.get(id);
    results.push({
      type: "error",
      category: "logic",
      message: `${nodeInfo?.label ?? id} is unreachable: no path from the first page reaches it.`,
      target: nodeInfo?.target ?? { tab: "pages" },
    });
  }

  for (const id of diagnostics.deadEnds) {
    const nodeInfo = info.get(id);
    results.push({
      type: "error",
      category: "logic",
      message: `${nodeInfo?.label ?? id} is a dead end: the workflow has no way to continue past it.`,
      target: nodeInfo?.target ?? { tab: "pages" },
    });
  }

  for (const loop of diagnostics.loops) {
    const labels = loop.path.map((id) => info.get(id)?.label ?? id);
    const [firstNode] = loop.path;
    const target = (firstNode === undefined ? undefined : info.get(firstNode)?.target) ?? { tab: "pages" };
    results.push({
      type: "error",
      category: "logic",
      message: `Skip-to loop detected: ${labels.join(" -> ")}.`,
      target,
    });
  }
}

function lintLogicRules(
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Workflow definitions contain extensible dynamic configuration.
  rules: Record<string, any>[],
  stepRefs: Set<string>,
  pageRefs: Set<string>,
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
        target: { tab: "pages", panel: "logic" },
      });
    }

    const targetRefs = rule.targetType === "page" ? pageRefs : stepRefs;
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Workflow definitions contain extensible dynamic configuration.
    const targetRef = rule.targetId ?? rule.targetAlias;
// eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- Workflow definitions contain extensible dynamic configuration.
    if (targetRef && !targetRefs.has(targetRef)) {
      results.push({
        type: "error",
        category: "logic",
        message: `Logic rule target references unknown alias: "${targetRef}"`,
        target: { tab: "pages", panel: "logic" },
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
  const pages = data.pages || [];
  const sections = data.sections ?? [];
  const logicRules = data.logicRules ?? [];
  if (pages.length === 0) {
    results.push({
      type: "error",
      category: "questions",
      message: "Workflow must have at least one page.",
      target: { tab: "pages" },
    });
  }

  const { stepAliases, stepRefs, pageRefs } = collectReferenceSets(pages);
  const hasSteps = lintPages(pages, results);

  if (pages.length > 0 && !hasSteps) {
    results.push({
      type: "error",
      category: "questions",
      message: "Workflow must have at least one question.",
      target: { tab: "pages" },
    });
  }

  // LU-3: circular and dangling references among visibleIf conditions
  // (Model A). Model B (logic_rules) reference checks stay in lintLogicRules
  // below — out of scope here per Decision #3.
  lintConditionDependencies(pages, sections, results);
  lintSectionConditions(sections, pages, results);
  lintConditionalSectionSkipTargets(sections, pages, logicRules, results);

  // MAP-3 / GH-153 AC4: unreachable pages, dead ends, and skip_to loop
  // risk over the page-to-page navigational graph.
  lintWorkflowFlow(pages, logicRules, results);

  lintLogicRules(logicRules, stepRefs, pageRefs, results);
// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- Workflow definitions contain extensible dynamic configuration.
  lintBlocksWithInputs(data.transformBlocks || [], { typeName: "Transform block", category: "logic", tab: "pages" }, stepAliases, results);
// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- Workflow definitions contain extensible dynamic configuration.
  lintBlocksWithInputs(data.lifecycleHooks || [], { typeName: "Lifecycle hook", category: "integrations", tab: "pages" }, stepAliases, results);
// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- Workflow definitions contain extensible dynamic configuration.
  lintBlocksWithInputs(data.documentHooks || [], { typeName: "Document hook", category: "documents", tab: "templates" }, stepAliases, results);

  return results;
}
