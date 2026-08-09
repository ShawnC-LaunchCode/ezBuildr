/**
 * Workflow map model — turns a workflow's sections/steps/rules into the plain
 * node/edge graph the visual map (GH-153) renders and MAP-3's flow analysis
 * (`shared/conditionGraph.ts#analyzeWorkflowFlow`) walks.
 *
 * Kept pure, framework-agnostic, and free of any `client/`/`server/` import —
 * mirrors the discipline of `shared/conditionGraph.ts` so it unit-tests
 * directly against small hand-built inputs and is reusable by the lint
 * pipeline (MAP-3), the map surface (MAP-4..6) and the path simulator
 * (MAP-7), none of which should have to invent this graph themselves.
 *
 * D-2: a map node **is a section**. A `final_documents` step gets its own
 * node type, additional to (not instead of) its owning section's node, and
 * exactly one synthetic `terminal` node (`"__complete__"`) stands in for
 * GH-153 AC1's "endings" — there is no ending entity in this schema.
 * Documents ARE an ending too: a `final_documents` node gets its own outgoing
 * sequential edge straight to the terminal node, in addition to its incoming
 * edge from the owning section. Without it, every `final_documents` node
 * would have zero outgoing edges and MAP-3's `analyzeWorkflowFlow` (which
 * treats any non-terminal node with no outgoing edge as a dead end, at
 * publish-blocking `error` severity) would flag every workflow that
 * generates documents as broken.
 *
 * Three edge sources exist and mean different things to an author:
 *  - **Sequential** — `sections.order`, the default path. Mirrors the sort
 *    `calculateNextSection()` (`shared/workflowLogic.ts`) applies.
 *  - **Skip** — a `logic_rules` row with `action: 'skip_to'` and
 *    `targetType: 'section'`. One edge per rule whose target resolves to a
 *    known section; a rule whose target does not resolve produces no edge —
 *    that is a MAP-3 finding, not something this module papers over. A
 *    *backward* skip (a no-op at runtime per `isForwardSkipTarget` in
 *    `shared/workflowLogic.ts`, RUN2-2) still draws an edge here: whether it
 *    is a no-op is a flow-analysis judgement (MAP-3), not a graph-model one.
 *  - **Conditional visibility** — `visibleIf`, plus `show`/`hide` rules.
 *    These do not create a route; they only mark a node/step `conditional`.
 *    Drawing them as edges would misrepresent the model.
 */

/** The kinds of node the map renders. A node is a section, unless D-2 promotes a step to its own node. */
export type WorkflowMapNodeKind = "section" | "final_documents" | "terminal";

/** The kinds of edge the map renders — see the module doc comment for what each one means. */
export type WorkflowMapEdgeKind = "sequential" | "skip";

/** Synthetic id of the single terminal "Complete" node (D-2). */
export const WORKFLOW_MAP_TERMINAL_NODE_ID = "__complete__";

export interface WorkflowMapNode {
  id: string;
  kind: WorkflowMapNodeKind;
  label: string;
  order: number;
  /** Set when the node's own visibility is conditional (visibleIf, or a show/hide rule targets it). */
  conditional: boolean;
  /** Ids of steps inside this section whose own visibleIf is set — the expand-on-demand payload (D-2). */
  conditionalStepIds: string[];
}

export interface WorkflowMapEdge {
  id: string;
  from: string;
  to: string;
  kind: WorkflowMapEdgeKind;
  /** For `skip` edges, the rule that produces it — lets the UI link to the rule. */
  ruleId?: string;
}

export interface WorkflowMapSectionInput {
  id: string;
  title: string;
  order: number;
  visibleIf?: unknown;
}

export interface WorkflowMapStepInput {
  id: string;
  sectionId: string;
  type: string;
  title: string;
  visibleIf?: unknown;
}

export interface WorkflowMapRuleInput {
  id: string;
  /** The step whose condition triggers this rule — resolves to the section a `skip`/`show`/`hide` edge originates from. */
  conditionStepId: string;
  action: string;
  targetType: string;
  targetSectionId: string | null;
  targetStepId: string | null;
  order: number;
}

export interface BuildWorkflowMapInput {
  sections: WorkflowMapSectionInput[];
  steps: WorkflowMapStepInput[];
  rules: WorkflowMapRuleInput[];
}

export interface WorkflowMapGraph {
  nodes: WorkflowMapNode[];
  edges: WorkflowMapEdge[];
}

/**
 * Build the map's node/edge graph from a workflow's raw sections, steps and
 * rules. Pure: no I/O, no evaluation of any condition — that stays in
 * `shared/conditionEvaluator.ts` / `shared/workflowLogic.ts`. This module
 * only decides which nodes and routes *exist*, never whether one currently
 * fires.
 */
export function buildWorkflowMap(input: BuildWorkflowMapInput): WorkflowMapGraph {
  const { sections, steps, rules } = input;

  // Sort by `order`, exactly as `calculateNextSection()` does — never trust
  // the caller's array order.
  const sortedSections = [...sections].sort((a, b) => a.order - b.order);
  const sectionIds = new Set(sortedSections.map((s) => s.id));
  const stepById = new Map(steps.map((s) => [s.id, s]));

  const sectionShowHideTargets = new Set(
    rules
      .filter((r) => r.targetType === "section" && (r.action === "show" || r.action === "hide"))
      .map((r) => r.targetSectionId)
      .filter((id): id is string => Boolean(id))
  );
  const stepShowHideTargets = new Set(
    rules
      .filter((r) => r.targetType === "step" && (r.action === "show" || r.action === "hide"))
      .map((r) => r.targetStepId)
      .filter((id): id is string => Boolean(id))
  );

  const nodes: WorkflowMapNode[] = [];
  const edges: WorkflowMapEdge[] = [];

  for (const section of sortedSections) {
    const sectionSteps = steps.filter((s) => s.sectionId === section.id);
    const conditionalStepIds = sectionSteps
      .filter((s) => s.visibleIf != null)
      .map((s) => s.id);

    nodes.push({
      id: section.id,
      kind: "section",
      label: section.title,
      order: section.order,
      conditional: section.visibleIf != null || sectionShowHideTargets.has(section.id),
      conditionalStepIds,
    });

    // D-2: a `final_documents` step gets its own node, additional to (not
    // instead of) its section's, positioned downstream of it. Documents are
    // themselves an ending, so the node also gets an outgoing edge straight
    // to the terminal node — otherwise it would be a dead end by
    // MAP-3's definition (see the module doc comment).
    for (const step of sectionSteps) {
      if (step.type !== "final_documents") { continue; }
      nodes.push({
        id: step.id,
        kind: "final_documents",
        label: step.title,
        order: section.order,
        conditional: step.visibleIf != null || stepShowHideTargets.has(step.id),
        conditionalStepIds: [],
      });
      edges.push({
        id: `sequential:${section.id}->${step.id}`,
        from: section.id,
        to: step.id,
        kind: "sequential",
      });
      edges.push({
        id: `sequential:${step.id}->${WORKFLOW_MAP_TERMINAL_NODE_ID}`,
        from: step.id,
        to: WORKFLOW_MAP_TERMINAL_NODE_ID,
        kind: "sequential",
      });
    }
  }

  // The default path: consecutive sections in `order`.
  for (let i = 0; i < sortedSections.length - 1; i++) {
    const from = sortedSections[i];
    const to = sortedSections[i + 1];
    edges.push({
      id: `sequential:${from.id}->${to.id}`,
      from: from.id,
      to: to.id,
      kind: "sequential",
    });
  }

  // Exactly one terminal node, with an incoming sequential edge from the
  // last section in order (D-2's stand-in for GH-153 AC1's "endings").
  // `noUncheckedIndexedAccess` is off in this project's tsconfig, so
  // TypeScript sees array indexing as always returning the element type —
  // an explicit length check (rather than a truthy check on the indexed
  // value) is what makes the empty-sections case type-honest.
  const hasSections = sortedSections.length > 0;
  const lastSection = hasSections ? sortedSections[sortedSections.length - 1] : null;
  nodes.push({
    id: WORKFLOW_MAP_TERMINAL_NODE_ID,
    kind: "terminal",
    label: "Complete",
    order: lastSection === null ? 0 : lastSection.order + 1,
    conditional: false,
    conditionalStepIds: [],
  });
  if (lastSection !== null) {
    edges.push({
      id: `sequential:${lastSection.id}->${WORKFLOW_MAP_TERMINAL_NODE_ID}`,
      from: lastSection.id,
      to: WORKFLOW_MAP_TERMINAL_NODE_ID,
      kind: "sequential",
    });
  }

  // One `skip` edge per `skip_to` section rule whose target resolves to a
  // known section, and whose condition step resolves to a known section (its
  // origin). Either side failing to resolve means no edge — a dangling
  // reference is a MAP-3 finding, not the map's job to draw.
  const skipRules = rules.filter((r) => r.action === "skip_to" && r.targetType === "section");
  for (const rule of skipRules) {
    if (!rule.targetSectionId || !sectionIds.has(rule.targetSectionId)) { continue; }
    const conditionStep = stepById.get(rule.conditionStepId);
    if (!conditionStep || !sectionIds.has(conditionStep.sectionId)) { continue; }
    edges.push({
      id: `skip:${rule.id}`,
      from: conditionStep.sectionId,
      to: rule.targetSectionId,
      kind: "skip",
      ruleId: rule.id,
    });
  }

  return { nodes, edges };
}
