import { Plus, Trash2, FileText, AlertCircle } from "lucide-react";
import React, { useState, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { ApiStep } from "@/lib/vault-api";
import { useUpdateStep } from "@/lib/vault-hooks";

import { DocumentPicker } from "./common/DocumentPicker";
import { TextAreaField, TextField, SectionHeader } from "./common/EditorField";

import type { SignatureBlockConfig } from "@/../../shared/types/stepConfigs";

interface SignatureBlockEditorProps {
  stepId: string;
  sectionId: string;
  step: ApiStep;
}

type UpdateHandler = (updates: Partial<SignatureBlockConfig>) => void;

// --- Sub-Components ---

const SignerSection = ({ config, onUpdate }: { config: SignatureBlockConfig; onUpdate: UpdateHandler }) => {
  const commonSignerRoles = ["Applicant", "Attorney", "Spouse", "Respondent", "Witness", "Notary", "Guardian", "Trustee"];

  return (
    <div className="space-y-3">
      <SectionHeader title="Signer Configuration" description="Configure who signs and in what order" />

      {/* Signer Role */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Signer Role</label>
        <div className="flex gap-2">
          <select
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={commonSignerRoles.includes(config.signerRole) ? config.signerRole : "custom"}
            onChange={(e) => {
              if (e.target.value !== "custom") {
                onUpdate({ signerRole: e.target.value });
              }
            }}
          >
            {commonSignerRoles.map((role) => (
              <option key={role} value={role}>{role}</option>
            ))}
            <option value="custom">Custom...</option>
          </select>
        </div>
        {!commonSignerRoles.includes(config.signerRole) && (
          <TextField
            label="Custom Role"
            value={config.signerRole}
            onChange={(val) => onUpdate({ signerRole: val })}
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
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          onChange={(e) => {
            const val = parseInt(e.target.value);
            onUpdate({ routingOrder: isNaN(val) ? 1 : val });
          }}
        />
        <p className="text-xs text-muted-foreground">
          Lower numbers sign first (1, 2, 3...). All signers with the same number can sign in parallel.
        </p>
      </div>

      <TextField
        label="Signer Name (Optional)"
        value={config.signerName ?? ""}
        onChange={(val) => onUpdate({ signerName: val })}
        placeholder="Leave empty to collect at runtime or use variable"
        description="Pre-fill signer name or use workflow variable (e.g., {{firstName}} {{lastName}})"
      />

      <TextField
        label="Signer Email (Optional)"
        value={config.signerEmail ?? ""}
        onChange={(val) => onUpdate({ signerEmail: val })}
        placeholder="Leave empty to collect at runtime or use variable"
        description="Pre-fill signer email or use workflow variable (e.g., {{email}})"
      />
    </div>
  );
};

const ProviderSection = ({ config, onUpdate }: { config: SignatureBlockConfig; onUpdate: UpdateHandler }) => (
  <div className="space-y-3">
    <SectionHeader title="E-Signature Provider" description="Select the signature collection service" />

    <div className="space-y-2">
      <label className="text-sm font-medium">Provider</label>
      <select
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        value={config.provider ?? "docusign"}
        onChange={(e) => onUpdate({ provider: e.target.value as SignatureBlockConfig['provider'] })}
      >
        <option value="docusign">DocuSign</option>
        <option value="hellosign">HelloSign (Coming Soon)</option>
        <option value="native">Native Signature (Coming Soon)</option>
      </select>
    </div>

    <div className="space-y-2">
      <label className="text-sm font-medium">Expires In (Days)</label>
      <input
        type="number"
        min="1"
        max="365"
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        value={config.expiresInDays ?? 30}
        onChange={(e) => {
          const val = parseInt(e.target.value);
          onUpdate({ expiresInDays: isNaN(val) ? 30 : val });
        }}
      />
    </div>

    <div className="flex items-center gap-2">
      <input
        type="checkbox"
        id="allowDecline"
        checked={config.allowDecline ?? false}
        onChange={(e) => onUpdate({ allowDecline: e.target.checked })}
        className="h-4 w-4 rounded border-input"
      />
      <label htmlFor="allowDecline" className="text-sm font-medium cursor-pointer">
        Allow signer to decline
      </label>
    </div>

    <TextAreaField
      label="Message to Signer (Optional)"
      value={config.message ?? ""}
      onChange={(val) => onUpdate({ message: val })}
      placeholder="Please sign these documents to complete the process."
      description="Custom message shown in the signature request email"
      rows={3}
    />
  </div>
);

const DocumentsSection = ({ config, onUpdate }: { config: SignatureBlockConfig; onUpdate: UpdateHandler }) => {
  const handleUpdateDocument = (docId: string, updates: Partial<SignatureBlockConfig['documents'][0]>) => {
    onUpdate({
      documents: config.documents.map(doc => doc.id === docId ? { ...doc, ...updates } : doc),
    });
  };

  const handleRemoveDocument = (docId: string) => {
    onUpdate({
      documents: config.documents.filter(doc => doc.id !== docId),
    });
  };

  const handleAddDocument = () => {
    const newDocument = {
      id: `doc_${Date.now()}`,
      documentId: "placeholder",
      mapping: {} as Record<string, { type: 'variable', source: string }>,
    };
    onUpdate({
      documents: [...config.documents, newDocument],
    });
  };

  const hasErrors = config.documents.length === 0;

  return (
    <div className="space-y-3">
      <SectionHeader
        title="Documents to Sign"
        description="Select which documents require this signature"
      />

      {hasErrors && (
        <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/30 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">At least one document is required</p>
            <p className="text-xs mt-1">Add a document to complete this signature block configuration.</p>
          </div>
        </div>
      )}

      {config.documents.length > 0 && (
        <div className="space-y-3">
          {config.documents.map((doc, index) => (
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

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Document Template</label>
                <DocumentPicker
                  value={doc.documentId === "placeholder" ? "" : doc.documentId}
                  onChange={(val) => handleUpdateDocument(doc.id, { documentId: val })}
                />
              </div>

              <div className="text-xs text-muted-foreground p-2 bg-muted rounded">
                <p className="font-medium mb-1">Field Mapping</p>
                <p>Variable-to-field mapping UI will be implemented in the full version.</p>
                <p className="mt-1">For now, all workflow variables will be automatically mapped to matching document fields.</p>
              </div>
            </div>
          ))}
        </div>
      )}

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
  );
};

const AdvancedSection = ({ config, onUpdate }: { config: SignatureBlockConfig; onUpdate: UpdateHandler }) => (
  <div className="space-y-3">
    <SectionHeader
      title="Workflow Screen Header"
      description="Content shown before redirecting to signature provider"
    />

    <TextAreaField
      label="Markdown Header"
      value={config.markdownHeader ?? ""}
      onChange={(val) => onUpdate({ markdownHeader: val })}
      placeholder="# Signature Required\n\nPlease review and sign the documents below."
      description="Supports markdown formatting"
      rows={4}
    />

    <Separator />

    <SectionHeader
      title="Advanced Options"
      description="Optional configuration"
    />

    <TextField
      label="Redirect URL (Optional)"
      value={config.redirectUrl ?? ""}
      onChange={(val) => onUpdate({ redirectUrl: val })}
      placeholder="https://example.com/thank-you"
      description="Where to redirect after signing completes (leave empty to return to workflow)"
    />

    <div className="text-xs text-muted-foreground p-3 bg-muted rounded border">
      <p className="font-medium mb-2">Conditional Logic</p>
      <p>Show/hide this signature block based on workflow conditions.</p>
      <p className="mt-2 italic">Condition builder UI coming soon - will integrate with existing logic system.</p>
    </div>
  </div>
);

// --- Main Component ---

export function SignatureBlockEditor({ stepId, sectionId, step }: SignatureBlockEditorProps) {
  const updateStepMutation = useUpdateStep();

  // Cast step.config to expected type or partial
  const initialConfig = step.config as Partial<SignatureBlockConfig>;

  const [localConfig, setLocalConfig] = useState<SignatureBlockConfig>({
    signerRole: initialConfig?.signerRole ?? "Applicant",
    routingOrder: initialConfig?.routingOrder ?? 1,
    documents: initialConfig?.documents ?? [],
    markdownHeader: initialConfig?.markdownHeader ?? "# Signature Required\n\nPlease review and sign the documents below.",
    provider: initialConfig?.provider ?? "docusign",
    allowDecline: initialConfig?.allowDecline ?? false,
    expiresInDays: initialConfig?.expiresInDays ?? 30,
    signerEmail: initialConfig?.signerEmail ?? "",
    signerName: initialConfig?.signerName ?? "",
    message: initialConfig?.message ?? "",
    redirectUrl: initialConfig?.redirectUrl ?? "",
    conditions: initialConfig?.conditions ?? null,
  });

  useEffect(() => {
    const config = step.config as Partial<SignatureBlockConfig> | undefined;
    setLocalConfig({
      signerRole: config?.signerRole ?? "Applicant",
      routingOrder: config?.routingOrder ?? 1,
      documents: config?.documents ?? [],
      markdownHeader: config?.markdownHeader ?? "# Signature Required\n\nPlease review and sign the documents below.",
      provider: config?.provider ?? "docusign",
      allowDecline: config?.allowDecline ?? false,
      expiresInDays: config?.expiresInDays ?? 30,
      signerEmail: config?.signerEmail ?? "",
      signerName: config?.signerName ?? "",
      message: config?.message ?? "",
      redirectUrl: config?.redirectUrl ?? "",
      conditions: config?.conditions ?? null,
    });
  }, [step.config]);

  const handleUpdate = (updates: Partial<SignatureBlockConfig>) => {
    const newConfig = { ...localConfig, ...updates };
    setLocalConfig(newConfig);
    updateStepMutation.mutate({ id: stepId, sectionId, config: newConfig });
  };

  return (
    <div className="space-y-4 p-4 border-t bg-muted/30">
      <Separator />
      <SignerSection config={localConfig} onUpdate={handleUpdate} />
      <Separator />
      <ProviderSection config={localConfig} onUpdate={handleUpdate} />
      <Separator />
      <DocumentsSection config={localConfig} onUpdate={handleUpdate} />
      <Separator />
      <AdvancedSection config={localConfig} onUpdate={handleUpdate} />
    </div>
  );
}
