/**
 * E-Signature Node Executor
 * Handles e-signature requests for document signing
 *
 * Stage 14: E-Signature Node + Document Review Portal
 */

import { evaluateExpression } from '../expr';

import type { EvalContext } from '../expr';

/**
 * E-Signature Node Configuration
 */
export interface EsignNodeConfig {
  signerType: 'internal' | 'external';
  signerEmailVar: string;              // Variable key holding signer email
  signerNameVar?: string;              // Optional variable key holding signer name
  provider: 'native' | 'docusign' | 'hellosign';
  documentOutputRef?: string;          // Which output ref to send for signing (from template node)
  message?: string;                    // Message for signer
  redirectUrlAfterSign?: string;       // Redirect URL after signing
  expiryHours?: number;                // Token expiry in hours (default 72)
  condition?: string;                  // Optional conditional execution
}

/**
 * E-Signature Node Input
 */
export interface EsignNodeInput {
  nodeId: string;
  config: EsignNodeConfig;
  context: EvalContext;
  runId: string;                       // Run ID for creating signature request
  workflowId: string;                  // Workflow ID
  tenantId: string;                    // Tenant ID
  projectId: string;                   // Project ID
  outputRefs?: Record<string, any>;    // Output refs from previous nodes (for document URL)
}

/**
 * E-Signature Node Output
 */
export interface EsignNodeOutput {
  status: 'executed' | 'skipped' | 'waiting';
  signatureRequestId?: string;         // Created signature request ID
  skipReason?: string;
  error?: string;
}

/**
 * Execute an e-signature node
 *
 * This node creates a signature request and pauses the workflow execution
 * until the document is signed or declined.
 *
 * @param input - Node configuration and execution context
 * @returns Execution result with waiting status
 */
export async function executeEsignNode(
  input: EsignNodeInput
): Promise<EsignNodeOutput> {
  const { nodeId, config, context, runId, workflowId, tenantId, projectId, outputRefs } = input;

  try {
    // Check condition if present
    if (config.condition) {
      const conditionResult = evaluateExpression(config.condition, context);
      if (!conditionResult) {
        return {
          status: 'skipped',
          skipReason: 'condition evaluated to false',
        };
      }
    }

    // Resolve signer email from context
    const signerEmail = context.vars[config.signerEmailVar];
    if (!signerEmail || typeof signerEmail !== 'string') {
      throw new Error(`Invalid or missing signer email in variable '${config.signerEmailVar}'`);
    }

    // Resolve signer name from context (optional)
    let signerName: string | undefined;
    if (config.signerNameVar) {
      const nameValue = context.vars[config.signerNameVar];
      if (nameValue && typeof nameValue === 'string') {
        signerName = nameValue;
      }
    }

    // Resolve document URL from output refs
    let documentUrl: string | undefined;
    if (config.documentOutputRef && outputRefs) {
      // Look for the output ref in the outputRefs object
      // The documentOutputRef is typically a node ID or output key
      const outputValue = outputRefs[config.documentOutputRef];
      if (outputValue) {
        // If it's an object with a url property, use that
        if (typeof outputValue === 'object' && 'url' in outputValue) {
          documentUrl = outputValue.url;
        } else if (typeof outputValue === 'string') {
          documentUrl = outputValue;
        }
      }
    }

    // Calculate expiry timestamp
    const expiryHours = config.expiryHours ?? 72; // Default 72 hours (3 days)
    const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

    // Store signature request info in context for service layer to create
    // The actual database operation will be handled by the service layer
    context.vars['__pendingSignatureRequest'] = {
      nodeId,
      runId,
      workflowId,
      tenantId,
      projectId,
      signerEmail,
      signerName,
      provider: config.provider,
      documentUrl,
      message: config.message,
      redirectUrl: config.redirectUrlAfterSign,
      expiresAt: expiresAt.toISOString(),
    };

    return {
      status: 'waiting',
      // The service layer will create the signature request and return its ID
    };
  } catch (error) {
    return {
      status: 'skipped',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
