/**
 * Final Block Card Editor
 * Editor for final block (document output and completion screen)
 *
 * Config shape:
 * {
 *   markdownHeader: string,
 *   documents: Array<{
 *     id: string,
 *     documentId: string,
 *     alias: string,
 *     conditions?: LogicExpression,
 *     mapping?: Record<string, {type: 'variable', source: string}>
 *   }>
 * }
 *
 * Note: Final blocks do NOT have aliases (they don't output variables)
 * Note: Final blocks should NOT have "required" toggle
 */

import { Plus, Trash2, FileText, AlertCircle } from "lucide-react";
import React, { useState, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useUpdateStep } from "@/lib/vault-hooks";

import { TextAreaField, TextField, SectionHeader } from "./common/EditorField";
import { LabelField } from "./common/LabelField";


import type { FinalBlockConfig, LogicExpression } from "@/../../shared/types/stepConfigs";

interface FinalBlockEditorProps {
  stepId: string;
  sectionId: string;
  step: {
    id: string;
    type: string;
    title: string;
    alias: string | null;
    required: boolean;
    config: any;
  };
}

export function FinalBlockEditor({ stepId, sectionId, step }: FinalBlockEditorProps) {
  const updateStepMutation = useUpdateStep();

  // Parse config
  const config = step.config as FinalBlockConfig | undefined;
  const [localConfig, setLocalConfig] = useState<FinalBlockConfig>({
    markdownHeader: config?.markdownHeader || "# Thank you!\n\nYour documents are ready for download.",
    documents: config?.documents || [],
  });

  const [showDocumentPicker, setShowDocumentPicker] = useState(false);

  useEffect(() => {
    const config = step.config as FinalBlockConfig | undefined;
    setLocalConfig({
      markdownHeader: config?.markdownHeader || "# Thank you!\n\nYour documents are ready for download.",
      documents: config?.documents || [],
    });
  }, [step.config]);

  const handleUpdate = (updates: Partial<FinalBlockConfig>) => {
    const newConfig = { ...localConfig, ...updates };
    setLocalConfig(newConfig);
    updateStepMutation.mutate({ id: stepId, sectionId, config: newConfig });
  };

  const handleLabelChange = (title: string) => {
    updateStepMutation.mutate({ id: stepId, sectionId, title });
  };

  const handleAddDocument = () => {
    // For now, create a placeholder document
    // In Prompt 10, this will open a modal to select from uploaded templates
    const newDocument = {
      id: `doc_${Date.now()}`,
      documentId: "placeholder",
      alias: `document_${localConfig.documents.length + 1}`,
      conditions: null,
      mapping: {},
    };

    handleUpdate({
      documents: [...localConfig.documents, newDocument],
    });
  };

  const handleRemoveDocument = (docId: string) => {
    handleUpdate({
      documents: localConfig.documents.filter(doc => doc.id !== docId),
    });
  };

  const handleUpdateDocument = (docId: string, updates: Partial<FinalBlockConfig['documents'][0]>) => {
    handleUpdate({
      documents: localConfig.documents.map(doc =>
        doc.id === docId ? { ...doc, ...updates } : doc
      ),
    });
  };

  // Validation
  const hasErrors = localConfig.documents.length === 0;
  const duplicateAliases = localConfig.documents.reduce((acc, doc, idx, arr) => {
    const duplicates = arr.filter(d => d.alias === doc.alias);
    if (duplicates.length > 1 && !acc.includes(doc.alias)) {
      acc.push(doc.alias);
    }
    return acc;
  }, [] as string[]);

  return (
    <div className="space-y-4 p-4 border-t bg-muted/30">
      {/* Label (optional for builder clarity) */}
      <LabelField
        value={step.title}
        onChange={handleLabelChange}
        description="Label for builder organization (not shown to end user)"
      />

      {/* No Alias field - final blocks don't output variables */}
      {/* No Required toggle - final blocks can't be required */}

      <Separator />

      {/* Markdown Header */}
      <div className="space-y-3">
        <SectionHeader
          title="Final Screen Header"
          description="Markdown content shown at the top of the final screen"
        />

        <TextAreaField
          label="Markdown Header"
          value={localConfig.markdownHeader}
          onChange={(val) => handleUpdate({ markdownHeader: val })}
          placeholder="# Thank you!\n\nYour documents are ready for download."
          description="Supports markdown formatting"
          rows={6}
          required
        />
      </div>

      <Separator />

      {/* Documents List */}
      <div className="space-y-3">
        <SectionHeader
          title="Documents"
          description="Configure which documents to generate and present"
        />

        {/* Validation Errors */}
        {hasErrors && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/30 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">At least one document is required</p>
              <p className="text-xs mt-1">Add a document to complete this final block configuration.</p>
            </div>
          </div>
        )}

        {duplicateAliases.length > 0 && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/30 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">Duplicate aliases detected</p>
              <p className="text-xs mt-1">Each document must have a unique alias: {duplicateAliases.join(", ")}</p>
            </div>
          </div>
        )}

        {/* Document Entries */}
        {localConfig.documents.length > 0 && (
          <div className="space-y-3">
            {localConfig.documents.map((doc, index) => (
              <div
                key={doc.id}
                className="p-4 border rounded-md bg-background space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Document {index + 1}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveDocument(doc.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                {/* Document Alias */}
                <TextField
                  label="Alias"
                  value={doc.alias}
                  onChange={(val) => handleUpdateDocument(doc.id, { alias: val })}
                  placeholder="contract_final"
                  description="Short name for this document (used for logic and labeling)"
                  required
                />

                {/* Document ID (Placeholder) */}
                <div className="text-xs text-muted-foreground bg-muted p-3 rounded-md">
                  <p className="font-medium mb-1">Document Template: {doc.documentId}</p>
                  <p className="italic">
                    Document selection will be implemented in Prompt 10
                  </p>
                </div>

                {/* Conditions (Placeholder) */}
                <div className="text-xs text-muted-foreground bg-blue-50 dark:bg-blue-950 p-3 rounded-md border border-blue-200 dark:border-blue-800">
                  <p className="font-medium mb-1">📋 Conditional Output</p>
                  <p className="italic">
                    Condition editor will be added to control when this document is shown.
                  </p>
                </div>

                {/* Variable Mapping (Placeholder) */}
                <div className="text-xs text-muted-foreground bg-muted p-3 rounded-md">
                  <p className="font-medium mb-1">🔗 Variable Mapping</p>
                  <p className="italic">
                    Variable mapping for document field population will be configured in Prompt 10.
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add Document Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleAddDocument}
          className="w-full"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Document
        </Button>
      </div>

      {/* Info */}
      <div className="text-xs text-muted-foreground bg-blue-50 dark:bg-blue-950 p-3 rounded-md border border-blue-200 dark:border-blue-800">
        <p className="font-medium mb-1">ℹ️ Final Block Behavior:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Appears at the end of workflow or in conditional branches</li>
          <li>Displays markdown header and list of documents</li>
          <li>Documents can be conditionally shown based on workflow data</li>
          <li>Document generation will be implemented in Prompt 10</li>
          <li>Multiple final blocks can exist in different workflow paths</li>
        </ul>
      </div>
    </div>
  );
}
