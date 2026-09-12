/**
 * Human-readable diff derived from AI workflow patch operations (ICW2-10).
 *
 * The propose (`dryRun`) path must show the user what an edit would do *before*
 * anything is written, so the summary cannot be produced by comparing database
 * states. It is derived from the ops themselves instead — the same ops that are
 * later handed back for apply, so what the user reviews is exactly what runs.
 */

import type { AiEditChange, WorkflowPatchOp } from "./validation/aiWorkflowEdit.schema";

function label(value: string | undefined, fallback: string): string {
  return value !== undefined && value.trim() !== "" ? value : fallback;
}

// eslint-disable-next-line complexity, sonarjs/cognitive-complexity
function describeOp(op: WorkflowPatchOp): AiEditChange {
  switch (op.op) {
    case "workflow.setMetadata":
      return {
        type: "update",
        entity: "workflow",
        explanation: `Update workflow ${[
          op.title !== undefined ? "title" : null,
          op.description !== undefined ? "description" : null,
        ].filter((part): part is string => part !== null).join(" and ") || "metadata"}`,
      };

    case "page.create":
      return { type: "add", entity: "page", explanation: `Add page "${op.title}"` };
    case "page.update":
      return {
        type: "update",
        entity: "page",
        explanation: `Update page ${label(op.title, op.id ?? op.tempId ?? "(unknown)")}`,
      };
    case "page.delete":
      return {
        type: "remove",
        entity: "page",
        explanation: `Delete page ${op.id ?? op.tempId ?? "(unknown)"}`,
      };
    case "page.reorder":
      return {
        type: "move",
        entity: "page",
        explanation: `Reorder ${op.pageIds.length} pages`,
      };
    case "page.setVisibleIf":
      return {
        type: "update",
        entity: "page",
        explanation: op.visibleIf === null
          ? `Always show page ${op.id ?? op.tempId ?? "(unknown)"}`
          : `Make page ${op.id ?? op.tempId ?? "(unknown)"} conditional`,
      };

    case "page.setSection":
      return {
        type: "move",
        entity: "page",
        explanation: op.sectionId === null
          ? `Remove page ${op.id ?? op.tempId ?? "(unknown)"} from its section`
          : `Move page ${op.id ?? op.tempId ?? "(unknown)"} into a section`,
      };

    case "section.create":
      return {
        type: "add",
        entity: "section",
        explanation: `Add section "${op.title}" over ${op.pageIds.length} page(s)`,
      };
    case "section.update":
      return {
        type: "update",
        entity: "section",
        explanation: `Update section ${label(op.title, op.id ?? op.tempId ?? "(unknown)")}`,
      };
    case "section.delete":
      return {
        type: "remove",
        entity: "section",
        explanation: `Delete section ${op.id ?? op.tempId ?? "(unknown)"} (its pages are kept, ungrouped)`,
      };
    case "section.setVisibleIf":
      return {
        type: "update",
        entity: "section",
        explanation: op.visibleIf === null
          ? `Always show section ${op.id ?? op.tempId ?? "(unknown)"}`
          : `Make section ${op.id ?? op.tempId ?? "(unknown)"} conditional`,
      };

    case "step.create":
      return {
        type: "add",
        entity: "step",
        explanation: `Add ${op.type} question "${op.title}"`,
      };
    case "step.update":
      return {
        type: "update",
        entity: "step",
        explanation: `Update question ${label(op.title, op.id ?? op.tempId ?? "(unknown)")}`,
      };
    case "step.delete":
      return {
        type: "remove",
        entity: "step",
        explanation: `Delete question ${op.id ?? op.tempId ?? "(unknown)"}`,
      };
    case "step.move":
      return {
        type: "move",
        entity: "step",
        explanation: `Move question ${op.id ?? op.tempId ?? "(unknown)"} to another page`,
      };
    case "step.setVisibleIf":
      return {
        type: "update",
        entity: "step",
        explanation: op.visibleIf === null
          ? `Always show question ${op.id ?? op.tempId ?? "(unknown)"}`
          : `Make question ${op.id ?? op.tempId ?? "(unknown)"} conditional`,
      };
    case "step.reorder":
      return {
        type: "move",
        entity: "step",
        explanation: `Reorder ${op.stepIds.length} questions in a page`,
      };
    case "step.setRequired":
      return {
        type: "update",
        entity: "step",
        explanation: `Make question ${op.id ?? op.tempId ?? "(unknown)"} ${op.required ? "required" : "optional"}`,
      };

    case "logicRule.create":
      return {
        type: "add",
        entity: "logic",
        explanation: `Add logic rule: ${op.rule.action} when ${op.rule.condition}`,
      };
    case "logicRule.update":
      return { type: "update", entity: "logic", explanation: `Update logic rule ${op.id}` };
    case "logicRule.delete":
      return { type: "remove", entity: "logic", explanation: `Delete logic rule ${op.id}` };

    case "document.add":
      return { type: "add", entity: "document", explanation: `Add ${op.fileType} document "${op.name}"` };
    case "document.update":
      return {
        type: "update",
        entity: "document",
        explanation: `Update document ${label(op.name, op.id ?? op.tempId ?? "(unknown)")}`,
      };
    case "document.setConditional":
      return {
        type: "update",
        entity: "document",
        explanation: op.condition === null
          ? `Always generate document ${op.id ?? op.tempId ?? "(unknown)"}`
          : `Make document ${op.id ?? op.tempId ?? "(unknown)"} conditional`,
      };
    case "document.bindFields":
      return {
        type: "update",
        entity: "document",
        explanation: `Bind ${Object.keys(op.bindings).length} document fields`,
      };

    case "datavault.createTable":
      return {
        type: "add",
        entity: "datavault",
        explanation: `Create table "${op.name}" with ${op.columns.length} columns`,
      };
    case "datavault.addColumns":
      return {
        type: "add",
        entity: "datavault",
        explanation: `Add ${op.columns.length} columns to table ${op.tableId}`,
      };
  }
}

/**
 * Map a set of patch operations to reviewable change entries, in op order.
 */
export function buildOpsDiff(ops: WorkflowPatchOp[]): AiEditChange[] {
  return ops.map(describeOp);
}
