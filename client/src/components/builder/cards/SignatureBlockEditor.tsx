import { useState, useEffect } from "react";

import { Separator } from "@/components/ui/separator";
import { useUpdateStep } from "@/lib/vault-hooks";

import type { SignatureBlockConfig } from "@shared/types/stepConfigs";

import { SignerSection, ProviderSection, DocumentsSection, AdvancedSection } from "./SignatureBlockEditor.components";
import type { StepEditorCommonProps } from "./common/stepEditorProps";

// --- Main Component ---

export function SignatureBlockEditor({ stepId, pageId, step }: StepEditorCommonProps): JSX.Element {
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
    updateStepMutation.mutate({ id: stepId, pageId, config: newConfig });
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
