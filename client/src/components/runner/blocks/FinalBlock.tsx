/**
 * Final Block Renderer
 * Displays the final output screen with document downloads
 *
 * This component:
 * - Renders markdown header
 * - Shows list of documents (conditionally filtered)
 * - Displays download placeholders (Prompt 10 will add actual generation)
 * - Supports multiple final blocks in different workflow paths
 *
 * @version 1.0.0 - Prompt 9 (Final Block Implementation)
 * @date December 2025
 */
import { FileDown, FileText } from "lucide-react";
import React, { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import type { Step } from "@/types";
import type { FinalBlockConfig, LogicExpression } from "@/../../shared/types/stepConfigs";
// ============================================================================
// TYPES
// ============================================================================
export interface FinalBlockRendererProps {
  /** Step/block configuration */
  step: Step;
  /** All step values (for evaluating conditions) */
  stepValues?: Record<string, any>;
  /** Whether we're in preview mode */
  preview?: boolean;
}
// ============================================================================
// MAIN COMPONENT
// ============================================================================
export function FinalBlockRenderer({ step, stepValues = {}, preview = false }: FinalBlockRendererProps) {
  const config = step.config as FinalBlockConfig;
  // Evaluate which documents should be shown
  const visibleDocuments = useMemo(() => {
    if (!config?.documents) {return [];}
    return config.documents.filter(doc => {
      // If no conditions, always show
      if (!doc.conditions) {return true;}
      // Evaluate conditions (simplified for now)
      // Full logic evaluation will be enhanced in future prompts
      return evaluateDocumentConditions(doc.conditions, stepValues);
    });
  }, [config?.documents, stepValues]);
  if (!config) {
    return (
      <div className="text-sm text-muted-foreground italic">
        Final block configuration missing
      </div>
    );
  }
  return (
    <div className="space-y-6">
      {/* Markdown Header */}
      {config.markdownHeader && (
        <div className="prose prose-sm max-w-none dark:prose-invert">
          <ReactMarkdown>{config.markdownHeader}</ReactMarkdown>
        </div>
      )}
      {/* Documents List */}
      {visibleDocuments.length > 0 ? (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Your Documents</h3>
          <div className="grid gap-3">
            {visibleDocuments.map((doc, index) => (
              <DocumentCard
                key={doc.id}
                document={doc}
                index={index}
                preview={preview}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>No documents are available based on your responses.</p>
        </div>
      )}
      {/* Preview Notice */}
      {preview && (
        <div className="mt-6 p-4 rounded-md bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
          <p className="text-sm text-blue-900 dark:text-blue-100">
            <strong>Preview Mode:</strong> Documents will be generated when this workflow is run.
          </p>
        </div>
      )}
    </div>
  );
}
// ============================================================================
// DOCUMENT CARD COMPONENT
// ============================================================================
interface DocumentCardProps {
  document: FinalBlockConfig['documents'][0];
  index: number;
  preview: boolean;
}
function DocumentCard({ document, index, preview }: DocumentCardProps) {
  const handleDownload = () => {
    // Placeholder - actual download will be implemented in Prompt 10
    alert(`Document generation will be implemented in Prompt 10.\n\nDocument: ${document.alias}`);
  };
  return (
    <div className="flex items-center justify-between p-4 border rounded-lg bg-card hover:bg-accent/50 transition-colors">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-md bg-primary/10">
          <FileDown className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="font-medium">{document.alias.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</p>
          <p className="text-xs text-muted-foreground">
            {preview ? "Will be generated" : "Ready for download"}
          </p>
        </div>
      </div>
      {preview ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FileText className="h-4 w-4" />
          <span>Placeholder</span>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={handleDownload}
        >
          <FileDown className="h-4 w-4 mr-2" />
          Download
        </Button>
      )}
    </div>
  );
}
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
/**
 * Evaluate document conditions
 * Simplified implementation - will be enhanced with full logic engine later
 */
function evaluateDocumentConditions(
  conditions: LogicExpression,
  stepValues: Record<string, any>
): boolean {
  if (!conditions?.conditions || conditions.conditions.length === 0) {
    return true;
  }
  const operator = conditions.operator || 'AND';
  const results = conditions.conditions.map(cond => {
    const value = stepValues[cond.key];
    switch (cond.op) {
      case 'equals':
        return value === cond.value;
      case 'not_equals':
        return value !== cond.value;
      case 'contains':
        if (typeof value === 'string') {
          return value.includes(String(cond.value));
        }
        if (Array.isArray(value)) {
          return value.includes(cond.value);
        }
        return false;
      case 'greater_than':
        return Number(value) > Number(cond.value);
      case 'less_than':
        return Number(value) < Number(cond.value);
      case 'is_empty':
        return !value || value === '' || (Array.isArray(value) && value.length === 0);
      case 'is_not_empty':
        return !!value && value !== '' && (!Array.isArray(value) || value.length > 0);
      default:
        return true;
    }
  });
  if (operator === 'AND') {
    return results.every(r => r);
  } else {
    return results.some(r => r);
  }
}