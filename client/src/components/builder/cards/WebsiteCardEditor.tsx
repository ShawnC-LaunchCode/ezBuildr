/**
 * Website Block Card Editor
 * Editor for website/URL blocks
 */

import { useState, useEffect } from "react";

import { Separator } from "@/components/ui/separator";
import { useUpdateStep, useWorkflowMode } from "@/lib/vault-hooks";

import type { ConditionExpression } from "@shared/types/conditions";
import type { WebsiteConfig } from "@shared/types/stepConfigs";

import type { StepEditorCommonProps } from "./common/stepEditorProps";

import { AliasField } from "./common/AliasField";
import { SwitchField, SectionHeader } from "./common/EditorField";
import { RequiredToggle } from "./common/RequiredToggle";
import { VisibilityField } from "./common/VisibilityField";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";





export function WebsiteCardEditor({ stepId, pageId, workflowId, step }: StepEditorCommonProps) {
  const updateStepMutation = useUpdateStep();
  const { data: workflowMode } = useWorkflowMode(workflowId);
  const isEasyMode = workflowMode?.mode === 'easy';

  const config = step.config as WebsiteConfig | undefined;

  const [localConfig, setLocalConfig] = useState({
    requireProtocol: config?.requireProtocol ?? false,
    allowedProtocols: config?.allowedProtocols?.join(", ") ?? "",
    restrictDomains: config?.restrictDomains?.join(", ") ?? "",
    blockDomains: config?.blockDomains?.join(", ") ?? "",
  });

  useEffect(() => {
    setLocalConfig({
      requireProtocol: config?.requireProtocol ?? false,
      allowedProtocols: config?.allowedProtocols?.join(", ") ?? "",
      restrictDomains: config?.restrictDomains?.join(", ") ?? "",
      blockDomains: config?.blockDomains?.join(", ") ?? "",
    });
  }, [step.config, config]);

  const handleUpdate = (updates: Partial<typeof localConfig>) => {
    const newConfig = { ...localConfig, ...updates };
    setLocalConfig(newConfig);

    const configToSave: WebsiteConfig = {
      requireProtocol: newConfig.requireProtocol,
    };
    
    if (!isEasyMode) {
      if (newConfig.allowedProtocols) {
        configToSave.allowedProtocols = newConfig.allowedProtocols.split(",")
          .map(p => p.trim())
          .filter(p => p === 'http' || p === 'https' || p === 'ftp');
      }
      if (newConfig.restrictDomains) {
        configToSave.restrictDomains = newConfig.restrictDomains.split(",").map(d => d.trim()).filter(Boolean);
      }
      if (newConfig.blockDomains) {
        configToSave.blockDomains = newConfig.blockDomains.split(",").map(d => d.trim()).filter(Boolean);
      }
    }

    updateStepMutation.mutate({ id: stepId, pageId, config: configToSave });
  };

  const handleAliasChange = (alias: string | null) => {
    updateStepMutation.mutate({ id: stepId, pageId, alias });
  };

  const handleRequiredChange = (required: boolean) => {
    updateStepMutation.mutate({ id: stepId, pageId, required });
  };

  return (
    <div className="space-y-4 p-4 border-t bg-muted/30">
      {/* Alias */}
      <AliasField value={step.alias} onChange={handleAliasChange} workflowId={workflowId} currentStepId={stepId} />

      {/* Required Toggle */}
      <RequiredToggle checked={step.required} onChange={handleRequiredChange} />

      <Separator />

      {/* Website Configuration */}
      <div className="space-y-4">
        <SectionHeader
          title="URL Validation"
          description="URL format validation is always enabled"
        />

        {/* Validation Info */}
        <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
          <p className="text-xs text-blue-900 dark:text-blue-100">
            <strong>URL Format:</strong> Valid web address
          </p>
          <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
            Input will be validated for proper URL format
          </p>
        </div>

        {/* Require Protocol Toggle */}
        <SwitchField
          label="Require Protocol"
          checked={localConfig.requireProtocol}
          onChange={(val) => handleUpdate({ requireProtocol: val })}
          description="Require http:// or https:// at the beginning"
        />
      </div>

      {!isEasyMode && (
        <>
          <div className="space-y-2">
            <Label className="text-xs font-medium">Allowed Protocols</Label>
            <Input
              value={localConfig.allowedProtocols}
              onChange={(e) => handleUpdate({ allowedProtocols: e.target.value })}
              placeholder="http, https"
              className="h-8"
            />
            <p className="text-xs text-muted-foreground">Comma-separated list (http, https, ftp)</p>
          </div>
        
          <div className="space-y-2">
            <Label className="text-xs font-medium">Restrict to Domains</Label>
            <Input
              value={localConfig.restrictDomains}
              onChange={(e) => handleUpdate({ restrictDomains: e.target.value })}
              placeholder="example.com, company.org"
              className="h-8"
            />
            <p className="text-xs text-muted-foreground">Comma-separated list of allowed domains</p>
          </div>
          
          <div className="space-y-2">
            <Label className="text-xs font-medium">Block Domains</Label>
            <Input
              value={localConfig.blockDomains}
              onChange={(e) => handleUpdate({ blockDomains: e.target.value })}
              placeholder="facebook.com, twitter.com"
              className="h-8"
            />
            <p className="text-xs text-muted-foreground">Comma-separated list of blocked domains</p>
          </div>
        </>
      )}

      {/* Format Preview */}
      <div className="bg-muted border rounded-lg p-3">
        <p className="text-xs font-medium mb-1">Format Preview</p>
        {localConfig.requireProtocol ? (
          <div className="space-y-1">
            <p className="text-sm font-mono text-green-600 dark:text-green-400">
              ✓ https://example.com
            </p>
            <p className="text-sm font-mono text-red-600 dark:text-red-400">
              ✗ example.com
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-sm font-mono text-green-600 dark:text-green-400">
              ✓ https://example.com
            </p>
            <p className="text-sm font-mono text-green-600 dark:text-green-400">
              ✓ example.com
            </p>
          </div>
        )}
      </div>

      {workflowId && (
        <VisibilityField
          stepId={stepId}
          pageId={pageId}
          workflowId={workflowId}
          visibleIf={step.visibleIf as ConditionExpression}
        />
      )}
    </div>
  );
}
