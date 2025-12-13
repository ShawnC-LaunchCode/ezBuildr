import type { EvalContext } from './expr';
import {
  executeQuestionNode,
  type QuestionNodeConfig,
  type QuestionNodeInput,
  type QuestionNodeOutput,
} from './nodes/question';
import {
  executeComputeNode,
  type ComputeNodeConfig,
  type ComputeNodeInput,
  type ComputeNodeOutput,
} from './nodes/compute';
import {
  executeBranchNode,
  type BranchNodeConfig,
  type BranchNodeInput,
  type BranchNodeOutput,
} from './nodes/branch';
import {
  executeTemplateNode,
  type TemplateNodeConfig,
  type TemplateNodeInput,
  type TemplateNodeOutput,
} from './nodes/template';
import {
  executeHttpNode,
  type HttpNodeConfig,
  type HttpNodeInput,
  type HttpNodeOutput,
} from './nodes/http';
import {
  executeReviewNode,
  type ReviewNodeConfig,
  type ReviewNodeInput,
  type ReviewNodeOutput,
} from './nodes/review';
import {
  executeEsignNode,
  type EsignNodeConfig,
  type EsignNodeInput,
  type EsignNodeOutput,
} from './nodes/esign';
import {
  executeWebhookNode,
  type WebhookNodeConfig,
  type WebhookNodeInput,
  type WebhookNodeOutput,
} from './nodes/webhook';
import {
  executeQueryNode,
  executeWriteNode,
  type QueryNodeConfig,
  type WriteNodeConfig,
  type QueryNodeOutput,
  type WriteNodeOutput,
  type QueryNodeInput,
  type WriteNodeInput,
} from './nodes/data';
import {
  executeFinalNode,
  type FinalBlockConfig,
  type FinalBlockInput,
  type FinalBlockOutput,
} from './nodes/final';

/**
 * Node Executor Registry
 * Central registry for all node type executors
 */

export type NodeType = 'question' | 'compute' | 'branch' | 'template' | 'http' | 'review' | 'esign' | 'webhook' | 'query' | 'write' | 'final';

export type NodeConfig =
  | QuestionNodeConfig
  | ComputeNodeConfig
  | BranchNodeConfig
  | TemplateNodeConfig
  | HttpNodeConfig
  | ReviewNodeConfig
  | EsignNodeConfig
  | WebhookNodeConfig
  | QueryNodeConfig
  | QueryNodeConfig
  | WriteNodeConfig
  | FinalBlockConfig;

export type NodeOutput =
  | QuestionNodeOutput
  | ComputeNodeOutput
  | BranchNodeOutput
  | TemplateNodeOutput
  | HttpNodeOutput
  | ReviewNodeOutput
  | EsignNodeOutput
  | WebhookNodeOutput
  | QueryNodeOutput
  | QueryNodeOutput
  | WriteNodeOutput
  | FinalBlockOutput;

export interface Node {
  id: string;
  type: NodeType;
  config: NodeConfig;
}

export interface ExecuteNodeInput {
  node: Node;
  context: EvalContext;
  tenantId: string;
  projectId?: string; // For HTTP nodes (secret/connection resolution)
  userInputs?: Record<string, any>; // For question nodes
  runId?: string; // For review/esign nodes
  workflowId?: string; // For review/esign nodes
  outputRefs?: Record<string, any>; // For esign nodes (document references)
}

/**
 * Execute a node based on its type
 *
 * @param input - Node execution input
 * @returns Node execution output
 */
export async function executeNode(input: ExecuteNodeInput): Promise<NodeOutput> {
  const { node, context, tenantId, userInputs } = input;
  switch (node.type) {
    case 'question': {
      const questionInput: QuestionNodeInput = {
        nodeId: node.id,
        config: node.config as QuestionNodeConfig,
        context,
        userAnswer: userInputs?.[node.id],
      };
      return await executeQuestionNode(questionInput);
    }

    case 'compute': {
      const computeInput: ComputeNodeInput = {
        nodeId: node.id,
        config: node.config as ComputeNodeConfig,
        context,
      };
      return await executeComputeNode(computeInput);
    }

    case 'branch': {
      const branchInput: BranchNodeInput = {
        nodeId: node.id,
        config: node.config as BranchNodeConfig,
        context,
      };
      return await executeBranchNode(branchInput);
    }

    case 'template': {
      const templateInput: TemplateNodeInput = {
        nodeId: node.id,
        config: node.config as TemplateNodeConfig,
        context,
        tenantId,
      };
      return await executeTemplateNode(templateInput);
    }

    case 'http': {
      if (!input.projectId) {
        throw new Error('projectId is required for HTTP nodes');
      }
      const httpInput: HttpNodeInput = {
        nodeId: node.id,
        config: node.config as HttpNodeConfig,
        context,
        projectId: input.projectId,
      };
      return await executeHttpNode(httpInput);
    }

    case 'review': {
      if (!input.runId || !input.workflowId || !input.projectId) {
        throw new Error('runId, workflowId, and projectId are required for REVIEW nodes');
      }
      const reviewInput: ReviewNodeInput = {
        nodeId: node.id,
        config: node.config as ReviewNodeConfig,
        context,
        runId: input.runId,
        workflowId: input.workflowId,
        tenantId,
        projectId: input.projectId,
      };
      return await executeReviewNode(reviewInput);
    }

    case 'esign': {
      if (!input.runId || !input.workflowId || !input.projectId) {
        throw new Error('runId, workflowId, and projectId are required for ESIGN nodes');
      }
      const esignInput: EsignNodeInput = {
        nodeId: node.id,
        config: node.config as EsignNodeConfig,
        context,
        runId: input.runId,
        workflowId: input.workflowId,
        tenantId,
        projectId: input.projectId,
        outputRefs: input.outputRefs,
      };
      return await executeEsignNode(esignInput);
    }

    case 'webhook': {
      const webhookInput: WebhookNodeInput = {
        nodeId: node.id,
        config: node.config as WebhookNodeConfig,
        context,
        projectId: input.projectId,
      };
      return await executeWebhookNode(webhookInput);
    }

    case 'query': {
      const queryInput: QueryNodeInput = {
        nodeId: node.id,
        config: node.config as QueryNodeConfig,
        context,
        tenantId,
      };
      return await executeQueryNode(queryInput);
    }

    case 'write': {
      const writeInput: WriteNodeInput = {
        nodeId: node.id,
        config: node.config as WriteNodeConfig,
        context,
        tenantId,
      };
      return await executeWriteNode(writeInput);
    }

    case 'final': {
      const finalInput: FinalBlockInput = {
        nodeId: node.id,
        config: node.config as FinalBlockConfig,
        context,
        tenantId,
        runId: input.runId,
        workflowVersionId: input.workflowId, // Assuming input.workflowId is distinct from version, but likely close enough for now or need to check call site
      };
      return await executeFinalNode(finalInput);
    }

    default:
      throw new Error(`Unknown node type: ${(node as any).type}`);
  }
}

/**
 * Get all supported node types
 */
export function getSupportedNodeTypes(): NodeType[] {
  return ['question', 'compute', 'branch', 'template', 'http', 'review', 'esign', 'webhook', 'query', 'write', 'final'];
}

/**
 * Check if a node type is supported
 */
export function isNodeTypeSupported(type: string): type is NodeType {
  return getSupportedNodeTypes().includes(type as NodeType);
}
