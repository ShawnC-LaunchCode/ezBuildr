/**
 * Signature Block Renderer
 * Displays signature collection interface in workflow runner
 *
 * This component:
 * - Renders markdown header
 * - Shows signer information
 * - Lists documents requiring signature
 * - Handles signature initiation
 * - Supports preview mode simulation
 * - Shows signature status
 *
 * @version 1.0.0 - Prompt 11 (E-Signature Integration)
 * @date December 2025
 */

import { PenTool, FileText, CheckCircle2, XCircle, Clock, AlertCircle } from "lucide-react";
import React, { useState, useMemo } from "react";
import ReactMarkdown from "react-markdown";

import { Button } from "@/components/ui/button";
import type { Step } from "@/types";

import type { SignatureBlockConfig } from "@/../../shared/types/stepConfigs";

// ============================================================================
// TYPES
// ============================================================================

export interface SignatureBlockRendererProps {
  /** Step/block configuration */
  step: Step;

  /** All step values (for variable substitution and conditions) */
  stepValues?: Record<string, any>;

  /** Whether we're in preview mode */
  preview?: boolean;

  /** Callback when signature is initiated */
  onSign?: () => void;

  /** Callback when signature is declined */
  onDecline?: () => void;

  /** Current signature status */
  status?: 'pending' | 'signing' | 'signed' | 'declined' | 'expired' | 'error';

  /** Error message if status is 'error' */
  errorMessage?: string;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function SignatureBlockRenderer({
  step,
  stepValues = {},
  preview = false,
  onSign,
  onDecline,
  status = 'pending',
  errorMessage,
}: SignatureBlockRendererProps) {
  const config = step.config as SignatureBlockConfig;
  const [isSimulating, setIsSimulating] = useState(false);

  // Replace variables in text fields (basic implementation)
  const replaceVariables = (text: string): string => {
    if (!text) {return text;}

    let result = text;
    Object.entries(stepValues).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(regex, String(value || ''));
    });

    return result;
  };

  // Prepare display values
  const displayConfig = useMemo(() => ({
    signerRole: config?.signerRole || 'Signer',
    signerName: replaceVariables(config?.signerName || ''),
    signerEmail: replaceVariables(config?.signerEmail || ''),
    message: replaceVariables(config?.message || ''),
    markdownHeader: replaceVariables(config?.markdownHeader || ''),
    documents: config?.documents || [],
    provider: config?.provider || 'docusign',
    allowDecline: config?.allowDecline ?? false,
  }), [config, stepValues]);

  // Handle signature initiation in preview mode
  const handlePreviewSign = async () => {
    if (!preview) {return;}

    setIsSimulating(true);

    // Simulate 2-second signing process
    await new Promise(resolve => setTimeout(resolve, 2000));

    setIsSimulating(false);
    onSign?.();
  };

  // Handle decline in preview mode
  const handlePreviewDecline = async () => {
    if (!preview) {return;}

    setIsSimulating(true);
    await new Promise(resolve => setTimeout(resolve, 500));
    setIsSimulating(false);
    onDecline?.();
  };

  if (!config) {
    return (
      <div className="text-sm text-muted-foreground italic">
        Signature block configuration missing
      </div>
    );
  }

  // Status indicator component
  const StatusIndicator = () => {
    switch (status) {
      case 'signed':
        return (
          <div className="flex items-center gap-2 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
            <div>
              <p className="font-medium text-green-900 dark:text-green-100">Signature Completed</p>
              <p className="text-sm text-green-700 dark:text-green-300">All documents have been signed</p>
            </div>
          </div>
        );

      case 'declined':
        return (
          <div className="flex items-center gap-2 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
            <div>
              <p className="font-medium text-red-900 dark:text-red-100">Signature Declined</p>
              <p className="text-sm text-red-700 dark:text-red-300">The signature request was declined</p>
            </div>
          </div>
        );

      case 'expired':
        return (
          <div className="flex items-center gap-2 p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg">
            <Clock className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            <div>
              <p className="font-medium text-orange-900 dark:text-orange-100">Signature Expired</p>
              <p className="text-sm text-orange-700 dark:text-orange-300">The signature request has expired</p>
            </div>
          </div>
        );

      case 'error':
        return (
          <div className="flex items-center gap-2 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
            <div>
              <p className="font-medium text-red-900 dark:text-red-100">Signature Error</p>
              <p className="text-sm text-red-700 dark:text-red-300">
                {errorMessage || 'An error occurred while processing the signature request'}
              </p>
            </div>
          </div>
        );

      case 'signing':
        return (
          <div className="flex items-center gap-2 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400 animate-pulse" />
            <div>
              <p className="font-medium text-blue-900 dark:text-blue-100">Signature In Progress</p>
              <p className="text-sm text-blue-700 dark:text-blue-300">Redirecting to signature provider...</p>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Preview Mode Badge */}
      {preview && (
        <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-sm">
          <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <span className="text-blue-900 dark:text-blue-100">
            <strong>Preview Mode:</strong> No actual signature request will be sent. This is a simulation.
          </span>
        </div>
      )}

      {/* Status Indicator */}
      <StatusIndicator />

      {/* Markdown Header */}
      {displayConfig.markdownHeader && status === 'pending' && (
        <div className="prose prose-sm max-w-none dark:prose-invert">
          <ReactMarkdown>{displayConfig.markdownHeader}</ReactMarkdown>
        </div>
      )}

      {/* Signer Information */}
      {status === 'pending' && (
        <div className="p-4 bg-muted/50 rounded-lg border space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <PenTool className="h-4 w-4" />
            <span>Signature Required</span>
          </div>

          <div className="space-y-2 text-sm">
            <div>
              <span className="text-muted-foreground">Role:</span>
              <span className="ml-2 font-medium">{displayConfig.signerRole}</span>
            </div>

            {displayConfig.signerName && (
              <div>
                <span className="text-muted-foreground">Signer:</span>
                <span className="ml-2 font-medium">{displayConfig.signerName}</span>
              </div>
            )}

            {displayConfig.signerEmail && (
              <div>
                <span className="text-muted-foreground">Email:</span>
                <span className="ml-2 font-medium">{displayConfig.signerEmail}</span>
              </div>
            )}

            <div>
              <span className="text-muted-foreground">Provider:</span>
              <span className="ml-2 font-medium capitalize">{displayConfig.provider}</span>
            </div>
          </div>

          {/* Custom Message */}
          {displayConfig.message && (
            <div className="pt-2 border-t text-sm text-muted-foreground">
              {displayConfig.message}
            </div>
          )}
        </div>
      )}

      {/* Documents List */}
      {status === 'pending' && displayConfig.documents.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Documents to Sign</h3>

          <div className="space-y-2">
            {displayConfig.documents.map((doc, index) => (
              <div
                key={doc.id}
                className="flex items-center gap-3 p-3 border rounded-lg bg-background"
              >
                <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    Document {index + 1}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {doc.documentId}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No Documents Warning */}
      {status === 'pending' && displayConfig.documents.length === 0 && (
        <div className="flex items-center gap-2 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg text-sm">
          <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
          <span className="text-yellow-900 dark:text-yellow-100">
            No documents configured for signature
          </span>
        </div>
      )}

      {/* Action Buttons */}
      {status === 'pending' && displayConfig.documents.length > 0 && (
        <div className="flex gap-3">
          <Button
            onClick={preview ? handlePreviewSign : onSign}
            disabled={isSimulating}
            className="flex-1"
          >
            <PenTool className="h-4 w-4 mr-2" />
            {isSimulating ? 'Processing...' : preview ? 'Simulate Signature' : 'Continue to Sign'}
          </Button>

          {displayConfig.allowDecline && (
            <Button
              variant="outline"
              onClick={preview ? handlePreviewDecline : onDecline}
              disabled={isSimulating}
            >
              Decline
            </Button>
          )}
        </div>
      )}

      {/* Error Recovery Button */}
      {status === 'error' && (
        <Button onClick={onSign} className="w-full">
          Try Again
        </Button>
      )}
    </div>
  );
}
