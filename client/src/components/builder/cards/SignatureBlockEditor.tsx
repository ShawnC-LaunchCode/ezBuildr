/**
 * Signature Block Card Editor
 * Editor for signature block (e-signature integration)
 *
 * Config shape:
 * {
 *   signerRole: string,
 *   routingOrder: number,
 *   documents: Array<{
 *     id: string,
 *     documentId: string,
 *     mapping?: Record<string, {type: 'variable', source: string}>
 *   }>,
 *   conditions?: LogicExpression,
 *   markdownHeader?: string,
 *   provider?: 'docusign' | 'hellosign' | 'native',
 *   allowDecline?: boolean,
 *   expiresInDays?: number,
 *   signerEmail?: string,
 *   signerName?: string,
 *   message?: string,
 *   redirectUrl?: string
 * }
 */

import { useState, useEffect } from "react";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { LabelField } from "./common/LabelField";
import { TextAreaField, TextField, SectionHeader } from "./common/EditorField";
import { useUpdateStep } from "@/lib/vault-hooks";
import { Plus, Trash2, FileText, AlertCircle } from "lucide-react";
import type { SignatureBlockConfig, LogicExpression } from "@/../../shared/types/stepConfigs";

interface SignatureBlockEditorProps {
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

export function SignatureBlockEditor({ stepId, sectionId, step }: SignatureBlockEditorProps) {
  const updateStepMutation = useUpdateStep();

  // Parse config
  const config = step.config as SignatureBlockConfig | undefined;
  const [localConfig, setLocalConfig] = useState<SignatureBlockConfig>({
    signerRole: config?.signerRole || "Applicant",
    routingOrder: config?.routingOrder || 1,
    documents: config?.documents || [],
    markdownHeader: config?.markdownHeader || "# Signature Required\n\nPlease review and sign the documents below.",
    provider: config?.provider || "docusign",
    allowDecline: config?.allowDecline ?? false,
    expiresInDays: config?.expiresInDays || 30,
    signerEmail: config?.signerEmail || "",
    signerName: config?.signerName || "",
    message: config?.message || "",
    redirectUrl: config?.redirectUrl || "",
    conditions: config?.conditions || null,
  });

  useEffect(() => {
    const config = step.config as SignatureBlockConfig | undefined;
    setLocalConfig({
      signerRole: config?.signerRole || "Applicant",
      routingOrder: config?.routingOrder || 1,
      documents: config?.documents || [],
      markdownHeader: config?.markdownHeader || "# Signature Required\n\nPlease review and sign the documents below.",
      provider: config?.provider || "docusign",
      allowDecline: config?.allowDecline ?? false,
      expiresInDays: config?.expiresInDays || 30,
      signerEmail: config?.signerEmail || "",
      signerName: config?.signerName || "",
      message: config?.message || "",
      redirectUrl: config?.redirectUrl || "",
      conditions: config?.conditions || null,
    });
  }, [step.config]);

  const handleUpdate = (updates: Partial<SignatureBlockConfig>) => {
    const newConfig = { ...localConfig, ...updates };
    setLocalConfig(newConfig);
    updateStepMutation.mutate({ id: stepId, sectionId, config: newConfig });
  };

  const handleLabelChange = (title: string) => {
    updateStepMutation.mutate({ id: stepId, sectionId, title });
  };

  const handleAddDocument = () => {
    const newDocument = {
      id: `doc_${Date.now()}`,
      documentId: "placeholder",
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

  const handleUpdateDocument = (docId: string, updates: Partial<SignatureBlockConfig['documents'][0]>) => {
    handleUpdate({
      documents: localConfig.documents.map(doc =>
        doc.id === docId ? { ...doc, ...updates } : doc
      ),
    });
  };

  // Validation
  const hasErrors = localConfig.documents.length === 0;

  // Predefined signer roles
  const commonSignerRoles = [
    "Applicant",
    "Attorney",
    "Spouse",
    "Respondent",
    "Witness",
    "Notary",
    "Guardian",
    "Trustee",
  ];

  return (
    <div className="space-y-4 p-4 border-t bg-muted/30">
      {/* Label */}
      <LabelField
        value={step.title}
        onChange={handleLabelChange}
        description="Label for builder organization"
      />

      <Separator />

      {/* Signer Configuration */}
      <div className="space-y-3">
        <SectionHeader
          title="Signer Configuration"
          description="Configure who signs and in what order"
        />

        {/* Signer Role */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Signer Role</label>
          <div className="flex gap-2">
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={commonSignerRoles.includes(localConfig.signerRole) ? localConfig.signerRole : "custom"}
              onChange={(e) => {
                if (e.target.value !== "custom") {
                  handleUpdate({ signerRole: e.target.value });
                }
              }}
            >
              {commonSignerRoles.map(role => (
                <option key={role} value={role}>{role}</option>
              ))}
              <option value="custom">Custom...</option>
            </select>
          </div>
          {!commonSignerRoles.includes(localConfig.signerRole) && (
            <TextField
              label="Custom Role"
              value={localConfig.signerRole}
              onChange={(val) => handleUpdate({ signerRole: val })}
              placeholder="Enter custom role name"
            />
          )}
        </div>

        {/* Routing Order */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Routing Order</label>
          <input
            type="number"
            min="1"
            max="99"
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={localConfig.routingOrder}
            onChange={(e) => handleUpdate({ routingOrder: parseInt(e.target.value) || 1 })}
          />
          <p className="text-xs text-muted-foreground">
            Lower numbers sign first (1, 2, 3...). All signers with the same number can sign in parallel.
          </p>
        </div>

        {/* Signer Name (optional) */}
        <TextField
          label="Signer Name (Optional)"
          value={localConfig.signerName || ""}
          onChange={(val) => handleUpdate({ signerName: val })}
          placeholder="Leave empty to collect at runtime or use variable"
          description="Pre-fill signer name or use workflow variable (e.g., {{firstName}} {{lastName}})"
        />

        {/* Signer Email (optional) */}
        <TextField
          label="Signer Email (Optional)"
          value={localConfig.signerEmail || ""}
          onChange={(val) => handleUpdate({ signerEmail: val })}
          placeholder="Leave empty to collect at runtime or use variable"
          description="Pre-fill signer email or use workflow variable (e.g., {{email}})"
        />
      </div>

      <Separator />

      {/* Provider Configuration */}
      <div className="space-y-3">
        <SectionHeader
          title="E-Signature Provider"
          description="Select the signature collection service"
        />

        <div className="space-y-2">
          <label className="text-sm font-medium">Provider</label>
          <select
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={localConfig.provider || "docusign"}
            onChange={(e) => handleUpdate({ provider: e.target.value as any })}
          >
            <option value="docusign">DocuSign</option>
            <option value="hellosign">HelloSign (Coming Soon)</option>
            <option value="native">Native Signature (Coming Soon)</option>
          </select>
        </div>

        {/* Expiration Days */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Expires In (Days)</label>
          <input
            type="number"
            min="1"
            max="365"
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={localConfig.expiresInDays || 30}
            onChange={(e) => handleUpdate({ expiresInDays: parseInt(e.target.value) || 30 })}
          />
        </div>

        {/* Allow Decline */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="allowDecline"
            checked={localConfig.allowDecline ?? false}
            onChange={(e) => handleUpdate({ allowDecline: e.target.checked })}
            className="h-4 w-4 rounded border-input"
          />
          <label htmlFor="allowDecline" className="text-sm font-medium cursor-pointer">
            Allow signer to decline
          </label>
        </div>

        {/* Custom Message */}
        <TextAreaField
          label="Message to Signer (Optional)"
          value={localConfig.message || ""}
          onChange={(val) => handleUpdate({ message: val })}
          placeholder="Please sign these documents to complete the process."
          description="Custom message shown in the signature request email"
          rows={3}
        />
      </div>

      <Separator />

      {/* Markdown Header */}
      <div className="space-y-3">
        <SectionHeader
          title="Workflow Screen Header"
          description="Content shown before redirecting to signature provider"
        />

        <TextAreaField
          label="Markdown Header"
          value={localConfig.markdownHeader || ""}
          onChange={(val) => handleUpdate({ markdownHeader: val })}
          placeholder="# Signature Required\n\nPlease review and sign the documents below."
          description="Supports markdown formatting"
          rows={4}
        />
      </div>

      <Separator />

      {/* Documents List */}
      <div className="space-y-3">
        <SectionHeader
          title="Documents to Sign"
          description="Select which documents require this signature"
        />

        {/* Validation Errors */}
        {hasErrors && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/30 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">At least one document is required</p>
              <p className="text-xs mt-1">Add a document to complete this signature block configuration.</p>
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

                {/* Document ID placeholder */}
                <TextField
                  label="Document ID"
                  value={doc.documentId}
                  onChange={(val) => handleUpdateDocument(doc.id, { documentId: val })}
                  placeholder="Select from uploaded templates or use output from Final Block"
                  description="In production, this will be a document picker"
                />

                {/* Mapping UI placeholder */}
                <div className="text-xs text-muted-foreground p-2 bg-muted rounded">
                  <p className="font-medium mb-1">Field Mapping</p>
                  <p>Variable-to-field mapping UI will be implemented in the full version.</p>
                  <p className="mt-1">For now, all workflow variables will be automatically mapped to matching document fields.</p>
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

      <Separator />

      {/* Advanced Options */}
      <div className="space-y-3">
        <SectionHeader
          title="Advanced Options"
          description="Optional configuration"
        />

        <TextField
          label="Redirect URL (Optional)"
          value={localConfig.redirectUrl || ""}
          onChange={(val) => handleUpdate({ redirectUrl: val })}
          placeholder="https://example.com/thank-you"
          description="Where to redirect after signing completes (leave empty to return to workflow)"
        />

        <div className="text-xs text-muted-foreground p-3 bg-muted rounded border">
          <p className="font-medium mb-2">Conditional Logic</p>
          <p>Show/hide this signature block based on workflow conditions.</p>
          <p className="mt-2 italic">Condition builder UI coming soon - will integrate with existing logic system.</p>
        </div>
      </div>
    </div>
  );
}
