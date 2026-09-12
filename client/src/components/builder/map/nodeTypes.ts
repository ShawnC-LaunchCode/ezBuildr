import type { NodeTypes } from "@xyflow/react";

import { FinalDocumentsMapNode } from "./nodes/FinalDocumentsMapNode";
import { PageMapNode } from "./nodes/PageMapNode";
import { TerminalMapNode } from "./nodes/TerminalMapNode";

/** One component per `WorkflowMapNodeKind` (`shared/workflowMap.ts`). */
export const workflowMapNodeTypes = {
  page: PageMapNode,
  final_documents: FinalDocumentsMapNode,
  terminal: TerminalMapNode,
} satisfies NodeTypes;
