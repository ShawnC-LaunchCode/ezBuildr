/**
 * Choice Block Card Editor
 * Editor for choice blocks (radio, multiple_choice, choice)
 *
 * Config shape:
 * {
 *   display: "radio" | "dropdown" | "multiple",
 *   allowMultiple: boolean,
 *   options: Array<{ id: string; label: string; alias?: string; }>
 * }
 */

import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import { useState, useMemo } from "react";

import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useChoiceConfig, type ChoiceCardState } from "@/hooks/useChoiceConfig";
import { useListToolsValidation } from "@/hooks/useListToolsValidation";
import { blockAPI, type ApiTransformBlock } from "@/lib/vault-api";
import { useUpdateStep, useWorkflowVariables, useWorkflow } from "@/lib/vault-hooks";

import type { ChoiceAdvancedConfig, ChoiceDisplay } from "@shared/types/stepConfigs";

import { BlockEditorDialog, type UniversalBlock } from "../BlockEditorDialog";
import type { StepEditorCommonProps } from "./common/stepEditorProps";

import { ListToolsDialogs } from "./choices/ListToolsDialogs";
import { ChoiceOptionsSettings } from "./choices/ChoiceOptionsSettings";
import { AliasField } from "./common/AliasField";
import { DefaultValueField, DefaultValueType } from "./common/DefaultValueField";
import { SectionHeader } from "./common/EditorField";
import { RequiredToggle } from "./common/RequiredToggle";
import { DynamicOptionsEditor } from "./DynamicOptionsEditor";

const SINGLE_SELECT_DISPLAYS: Array<{ value: ChoiceDisplay; label: string; hint: string }> = [
  { value: "radio", label: "Radio", hint: "Every option is visible at once. Best for short lists." },
  { value: "dropdown", label: "Dropdown", hint: "A closed list. Best when there are many options." },
  {
    value: "combobox",
    label: "Combo Box",
    hint: "Searchable, and the respondent can enter an answer that isn't listed.",
  },
];

// eslint-disable-next-line max-lines-per-function
export function ChoiceCardEditor({ stepId, pageId, workflowId, step }: StepEditorCommonProps) {
  const updateStepMutation = useUpdateStep();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [_isCreatingListTools, setIsCreatingListTools] = useState(false);

  // Block Editor Dialog state
  const [isBlockEditorOpen, setIsBlockEditorOpen] = useState(false);
  const [editingBlock, setEditingBlock] = useState<UniversalBlock | null>(null);

  // Unlink Confirmation Dialog state
  const [showUnlinkConfirm, setShowUnlinkConfirm] = useState(false);
  const [unlinkMode, setUnlinkMode] = useState<"keep" | "remove">("keep");

  // Replace Confirmation Dialog state
  const [showReplaceConfirm, setShowReplaceConfirm] = useState(false);
  const [replaceMode, setReplaceMode] = useState<"migrate" | "reset">("migrate");

  // Fetch workflow for mode
  const { data: workflow } = useWorkflow(workflowId);
  const mode = workflow?.modeOverride ?? 'easy';

  // Determine mode (kept for compatibility, but hook also provides this)
  const isAdvancedMode = step.type === "choice";

  // State
  const [errors, setErrors] = useState<string[]>([]);

  const saveConfig = (newConfig: ChoiceCardState, saveSourceMode: "static" | "dynamic") => {
    // Validation
    const formErrors: string[] = [];
    if (saveSourceMode === "static") {
      if ((newConfig.staticOptions ?? []).length === 0) { formErrors.push("At least one option is required"); }
      // Check for duplicate aliases
      const aliases = (newConfig.staticOptions ?? []).map((opt) => opt.alias ?? opt.id);
      if (new Set(aliases).size !== aliases.length) { formErrors.push("Duplicate aliases found"); }
    } else {
      if (!newConfig.dynamicOptions?.listVariable) { formErrors.push("List variable is required"); }
      // We allow saving with warning
    }
    setErrors(formErrors);
    if (formErrors.length > 0) { return; }

    // Construct Payload
    // If we are in "dynamic" mode, we MUST be 'choice' type (Advanced schema)
    const isNowAdvanced = saveSourceMode === "dynamic" || isAdvancedMode;

    if (isNowAdvanced) {
      // `searchable` is deliberately not written: display: 'combobox' now
      // carries that meaning. Old configs still setting it are normalised on
      // read by resolveChoiceDisplay.
      const payload: ChoiceAdvancedConfig = {
        display: newConfig.display,
        layout: newConfig.layout,
        options: saveSourceMode === 'static'
          // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
          ? { type: 'static', options: newConfig.staticOptions || [] }
          // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
          : { ...(newConfig.dynamicOptions || { listVariable: '' }), type: 'list' }
      };
      // Auto-upgrade type if needed
      if (step.type !== 'choice') {
        updateStepMutation.mutate({ id: stepId, pageId, type: 'choice', config: payload });
      } else {
        updateStepMutation.mutate({ id: stepId, pageId, config: payload });
      }
    } else {
      // Legacy Save
      const payload = {
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        options: (newConfig.staticOptions || []).map((opt) => ({
          id: opt.id,
          label: opt.label,
          alias: opt.alias
        }))
      };
      updateStepMutation.mutate({ id: stepId, pageId, config: payload });
    }
  };

  // Use custom hooks for config management
  const { localConfig, setLocalConfig, sourceMode, setSourceMode } = useChoiceConfig(step, saveConfig);

  // Fetch Workflow Variables (for dynamic mode)
  const { data: variables = [] } = useWorkflowVariables(workflowId);

  // Filter for List variables only
  const listVariables = useMemo(() => {
    return (variables).filter(v => v.type === 'read_table' || v.type === 'list_tools' || v.type === 'list');
  }, [variables]);

  // Use custom hook for validation
  const {
    timingWarning,
    labelColumnWarning,
    valueColumnWarning,
    sourceBlock,
    sourceTableId,
    columns,
    loadingColumns,
    blocks
  } = useListToolsValidation({ localConfig, workflowId, pageId });


  // Derived state for Dynamic Columns
  const _selectedListVarName = localConfig?.dynamicOptions?.listVariable;

  // ---------------------------------------------------------------------------
  // HANDLERS
  // ---------------------------------------------------------------------------

  const handleUpdate = (updates: Partial<ChoiceCardState>) => {
    if (!localConfig) { return; }
    const next: ChoiceCardState = { ...localConfig, ...updates };
    setLocalConfig(next);
  };

  const handleSourceModeChange = (val: string) => {
    if (!localConfig) { return; }
    const newMode = val as "static" | "dynamic";
    setSourceMode(newMode);
    // Mode changes are discrete actions; save immediately to bypass debounce queue
    saveConfig(localConfig, newMode);
  };

  const handleStaticOptionsChange = (config: ChoiceAdvancedConfig) => {
    const nextOptions = Array.isArray(config.options)
      ? config.options
      : config.options.type === "static"
        ? config.options.options
        : [];
    handleUpdate({ staticOptions: nextOptions });
  };


  const handleAliasChange = (alias: string | null) => updateStepMutation.mutate({ id: stepId, pageId, alias });
  const handleRequiredChange = (required: boolean) => updateStepMutation.mutate({ id: stepId, pageId, required });
  const handleDisplayChange = (display: ChoiceDisplay) => {
    // Easy-mode `radio` / `multiple_choice` steps have nowhere to store a
    // display mode, so dropdown and combobox both require promoting the step
    // to the advanced `choice` type first.
    const needsAdvancedType = display === "dropdown" || display === "combobox";

    if (!isAdvancedMode && sourceMode === 'static') {
      if (needsAdvancedType) {
        const payload: ChoiceAdvancedConfig = {
          display,
          layout: localConfig?.layout ?? "vertical",
          options: { type: 'static', options: localConfig?.staticOptions ?? [] }
        };
        updateStepMutation.mutate({ id: stepId, pageId, type: 'choice', config: payload });
      } else {
        const newType = display === "multiple" ? "multiple_choice" : "radio";
        updateStepMutation.mutate({ id: stepId, pageId, type: newType });
      }
    } else {
      handleUpdate({ display });
    }
  };

  // List Tools block handlers
  const handleCreateListTools = async () => {
    if (!localConfig?.dynamicOptions?.listVariable) {
      toast({
        title: "Error",
        description: "Please select a list variable first",
        variant: "destructive"
      });
      return;
    }

    setIsCreatingListTools(true);
    try {
      const result = await blockAPI.createListToolsFromChoice(workflowId, stepId, {
        sourceListVar: localConfig.dynamicOptions.listVariable,
        transformConfig: localConfig.dynamicOptions.transform,
        pageId: pageId
      });

      // Update the question config to link to the new block
      const newDynamic = {
        ...localConfig.dynamicOptions,
        linkedListToolsBlockId: result.block.id,
        baseListVar: localConfig.dynamicOptions.listVariable,
        listVariable: result.outputVar,
        transform: undefined // Clear transform since it's now in the block
      };

      handleUpdate({ dynamicOptions: newDynamic });

      // Invalidate blocks query to refresh the list
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      queryClient.invalidateQueries({ queryKey: ['blocks', workflowId] });

      toast({
        title: "Success",
        description: `Created List Tools block: ${result.outputVar}`,
      });

      // Auto-open the block editor so user can immediately configure transforms
      const universalBlock: UniversalBlock = {
        id: result.block.id,
        type: result.block.type,
        phase: result.block.phase || 'onRunStart',
        order: result.block.order || 0,
        enabled: result.block.enabled ?? true,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
        raw: result.block as unknown as any,
        source: 'regular',
        title: result.outputVar,
        displayType: 'list_tools'
      };

      setEditingBlock(universalBlock);
      setIsBlockEditorOpen(true);
    } catch (error) {
      console.error("Error creating List Tools block:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create List Tools block",
        variant: "destructive"
      });
    } finally {
      setIsCreatingListTools(false);
    }
  };



  const confirmUnlinkListTools = () => {
    if (!localConfig?.dynamicOptions?.baseListVar) {
      toast({
        title: "Error",
        description: "No base list variable found", // Should theoretically not happen if button enabled
        variant: "destructive"
      });
      // Fallback: just clear link if we can't find base? No, risky.
      // But if baseListVar is missing, maybe we should just use current listVariable?
      // For now, respect the error.
      setShowUnlinkConfirm(false);
      return;
    }

    let transform = undefined;

    if (unlinkMode === 'keep') {
      // Attempt to migrate transforms back
      if (linkedBlock?.config) {
        const blockConfig = linkedBlock.config as Record<string, unknown>;
        transform = {
          filters: blockConfig['filters'],
          sort: blockConfig['sort'],
          limit: blockConfig['limit'],
          offset: blockConfig['offset'],
          dedupe: blockConfig['dedupe'],
          select: blockConfig['select']
        } as ChoiceCardState['dynamicOptions']['transform'];
      } else {
        // Warning if block not found?
        toast({
          title: "Warning",
          description: "Linked block not found. Transforms could not be preserved.",
          variant: "destructive"
        });
      }
    }

    const newDynamic = {
      ...localConfig.dynamicOptions,
      linkedListToolsBlockId: undefined,
      listVariable: localConfig.dynamicOptions.baseListVar,
      baseListVar: undefined,
      transform: transform
    };

    handleUpdate({ dynamicOptions: newDynamic });

    toast({
      title: "Unlinked",
      description: unlinkMode === 'keep'
        ? "List Tools block unlinked. Transforms have been copied to this question."
        : "List Tools block unlinked. Transforms have been removed.",
    });

    setShowUnlinkConfirm(false);
  };



  const confirmReplaceListTools = async () => {
    if (!localConfig?.dynamicOptions?.baseListVar) {
      toast({
        title: "Error",
        description: "No base list variable found",
        variant: "destructive"
      });
      setShowReplaceConfirm(false);
      return;
    }

    setIsCreatingListTools(true);
    try {
      // Determine transform config for new block
      let transformConfig = undefined;
      if (replaceMode === 'migrate' && (linkedBlock)?.config) {
        // Create copy of existing transforms
        const blockConfig = linkedBlock.config as Record<string, unknown>;
        transformConfig = {
          filters: blockConfig['filters'],
          sort: blockConfig['sort'],
          limit: blockConfig['limit'],
          offset: blockConfig['offset'],
          dedupe: blockConfig['dedupe'],
          select: blockConfig['select']
        };
      }

      // Unlink first (conceptually), but we can just overwrite the link.
      // Actually, we should probably keep the old block unless we want to delete it?
      // "Replace" implies swapping. We won't delete the old block automatically as it might be used elsewhere (though unlikely for dedicated tools).
      // API createListToolsFromChoice creates a NEW block.

      const result = await blockAPI.createListToolsFromChoice(workflowId, stepId, {
        sourceListVar: localConfig.dynamicOptions.baseListVar, // Use base list as source
        transformConfig: transformConfig,
        pageId: pageId
      });

      // Update the question config to link to the new block
      const newDynamic = {
        ...localConfig.dynamicOptions,
        linkedListToolsBlockId: result.block.id,
        listVariable: result.outputVar,
        // baseListVar remains the same
        transform: undefined
      };

      handleUpdate({ dynamicOptions: newDynamic });

      // Invalidate blocks
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      queryClient.invalidateQueries({ queryKey: ['blocks', workflowId] });

      toast({
        title: "Success",
        description: replaceMode === 'migrate'
          ? `Replaced List Tools block (transforms maintained): ${result.outputVar}`
          : `Replaced List Tools block (fresh start): ${result.outputVar}`,
      });

      // Open new block
      const universalBlock: UniversalBlock = {
        id: result.block.id,
        type: result.block.type,
        phase: result.block.phase || 'onRunStart',
        order: result.block.order || 0,
        enabled: result.block.enabled ?? true,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
        raw: result.block as unknown as any,
        source: 'regular',
        title: result.outputVar,
        displayType: 'list_tools'
      };

      setEditingBlock(universalBlock);
      setIsBlockEditorOpen(true);

    } catch (error) {
      console.error("Error replacing List Tools block:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to replace List Tools block",
        variant: "destructive"
      });
    } finally {
      setIsCreatingListTools(false);
      setShowReplaceConfirm(false);
    }
  };

  const linkedBlock = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (!localConfig?.dynamicOptions?.linkedListToolsBlockId || !blocks) { return null; }
    return (blocks ?? []).find((b) => b.id === localConfig.dynamicOptions?.linkedListToolsBlockId);
  }, [localConfig?.dynamicOptions?.linkedListToolsBlockId, blocks]);

  const handleOpenLinkedBlock = () => {
    if (!linkedBlock) {
      toast({
        title: "Error",
        description: "Linked block not found",
        variant: "destructive"
      });
      return;
    }

    // Convert to UniversalBlock format expected by BlockEditorDialog
    const blockCfg = linkedBlock.config as Record<string, unknown>;
    const universalBlock: UniversalBlock = {
      id: linkedBlock.id,
      type: linkedBlock.type,
      phase: linkedBlock.phase ?? 'onRunStart',
      order: linkedBlock.order ?? 0,
      enabled: linkedBlock.enabled ?? true,
      raw: linkedBlock as unknown as Record<string, unknown>,
      source: 'regular',
      title: (blockCfg['outputListVar'] as string | undefined) ?? (blockCfg['outputKey'] as string | undefined) ?? 'List Tools',
      displayType: 'list_tools'
    };

    setEditingBlock(universalBlock);
    setIsBlockEditorOpen(true);
  };

  const handleCloseBlockEditor = () => {
    setIsBlockEditorOpen(false);
    setEditingBlock(null);
    // Refresh blocks after editing
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    queryClient.invalidateQueries({ queryKey: ['workflows', workflowId, 'blocks'] });
  };

  if (localConfig === null || localConfig === undefined) { return null; }

  const isMultiSelect = localConfig.display === "multiple";

  return (
    <div className="space-y-4 p-4 border-t bg-muted/30">
      <AliasField value={step.alias} onChange={(val) => { void handleAliasChange(val); }} workflowId={workflowId} currentStepId={stepId} />
      <RequiredToggle checked={step.required} onChange={(val) => { void handleRequiredChange(val); }} />

      <Separator />

      {!isMultiSelect && (
        <>
          <div className="space-y-3">
            <SectionHeader title="Display Mode" description="How choices are displayed" />
            <RadioGroup
              value={localConfig.display}
              onValueChange={(v) => handleDisplayChange(v as ChoiceDisplay)}
              className="flex gap-4"
            >
              {SINGLE_SELECT_DISPLAYS.map((opt) => (
                <div key={opt.value} className="flex items-center space-x-2">
                  <RadioGroupItem value={opt.value} id={`d-${opt.value}`} />
                  <Label htmlFor={`d-${opt.value}`}>{opt.label}</Label>
                </div>
              ))}
            </RadioGroup>
            <p className="text-xs text-muted-foreground">
              {SINGLE_SELECT_DISPLAYS.find((o) => o.value === localConfig.display)?.hint}
            </p>
          </div>

          <Separator />
        </>
      )}

      {(localConfig.display === 'radio' || localConfig.display === 'multiple') && (
        <>
          <div className="space-y-3">
            <SectionHeader title="Layout" description="Visual arrangement of options" />
            <RadioGroup
              value={localConfig.layout ?? 'vertical'}
              onValueChange={(v) => handleUpdate({ layout: v as 'vertical' | 'horizontal' })}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="vertical" id="layout-vertical" />
                <Label htmlFor="layout-vertical">Vertical</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="horizontal" id="layout-horizontal" />
                <Label htmlFor="layout-horizontal">Horizontal</Label>
              </div>
            </RadioGroup>
          </div>

          <Separator />
        </>
      )}

      <div className="space-y-4">
        {localConfig.display !== 'combobox' && (
          <div className="space-y-3">
            <div className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm bg-background">
              <div className="space-y-0.5">
                <Label>Allow &quot;Other&quot; Option</Label>
                <p className="text-xs text-muted-foreground">Add a text input for unlisted answers</p>
              </div>
              <Switch
                checked={localConfig.allowOther ?? false}
                onCheckedChange={(v) => handleUpdate({ allowOther: v })}
              />
            </div>
            {localConfig.allowOther && (
              <div className="ml-4 space-y-1">
                <Label className="text-xs font-medium">&quot;Other&quot; Option Label</Label>
                <Input
                  className="h-8 max-w-sm"
                  value={localConfig.otherLabel ?? ''}
                  placeholder="Other"
                  onChange={(e) => handleUpdate({ otherLabel: e.target.value })}
                />
              </div>
            )}
          </div>
        )}

        <div className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm bg-background">
          <div className="space-y-0.5">
            <Label>Randomize Order</Label>
            <p className="text-xs text-muted-foreground">Shuffle options randomly for each respondent</p>
          </div>
          <Switch
            checked={localConfig.randomizeOrder ?? false}
            onCheckedChange={(v) => handleUpdate({ randomizeOrder: v })}
          />
        </div>
      </div>

      <Separator />

      {/* Options Source Toggle */}
      <Tabs value={sourceMode} onValueChange={handleSourceModeChange} className="w-full">
        <div className="flex items-center justify-between mb-4">
          <Label className="text-sm font-medium">Options Source</Label>
          <TabsList className="grid w-[200px] grid-cols-2 h-8">
            <TabsTrigger value="static" className="text-xs">Manual</TabsTrigger>
            <TabsTrigger value="dynamic" className="text-xs">From Table</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="static" className="mt-0 space-y-3">
          <ChoiceOptionsSettings
            config={{
              display: localConfig.display,
              layout: localConfig.layout,
              options: { type: "static", options: localConfig.staticOptions },
            }}
            onChange={handleStaticOptionsChange}
          />
        </TabsContent>

        <TabsContent value="dynamic" className="mt-0 space-y-4">
          <DynamicOptionsEditor
            config={localConfig.dynamicOptions}
            listVariables={listVariables}
            sourceBlock={(sourceBlock as ApiTransformBlock | null)}
            sourceTableId={sourceTableId}
            columns={columns}
            loadingColumns={loadingColumns}
            timingWarning={timingWarning}
            labelColumnWarning={labelColumnWarning}
            valueColumnWarning={valueColumnWarning}
            onUpdate={(updates) => handleUpdate({ dynamicOptions: { ...localConfig.dynamicOptions, ...updates } })}
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            onCreateListTools={handleCreateListTools}
            onEditBlock={handleOpenLinkedBlock}
            onUnlinkBlock={() => setShowUnlinkConfirm(true)}
            onReplaceBlock={() => setShowReplaceConfirm(true)}
          />
        </TabsContent>
      </Tabs>

      {/* Errors */}
      {
        errors.length > 0 && (
          <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 p-3 rounded-md">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <ul className="list-disc list-inside">
              {errors.map((error, idx) => <li key={idx}>{error}</li>)}
            </ul>
          </div>
        )
      }

      {/* Block Editor Dialog */}
      <BlockEditorDialog
        workflowId={workflowId}
        block={editingBlock}
        mode={mode}
        isOpen={isBlockEditorOpen}
        onClose={handleCloseBlockEditor}
      />

      <ListToolsDialogs
        showReplaceConfirm={showReplaceConfirm}
        setShowReplaceConfirm={setShowReplaceConfirm}
        replaceMode={replaceMode}
        setReplaceMode={setReplaceMode}
        confirmReplaceListTools={() => { void confirmReplaceListTools(); }}
        showUnlinkConfirm={showUnlinkConfirm}
        setShowUnlinkConfirm={setShowUnlinkConfirm}
        unlinkMode={unlinkMode}
        setUnlinkMode={setUnlinkMode}
        confirmUnlinkListTools={confirmUnlinkListTools}
      />
      <DefaultValueField
        stepId={stepId}
        pageId={pageId}
        defaultValue={step.defaultValue as DefaultValueType}
        type={step.type}
        mode={isAdvancedMode ? 'advanced' : 'easy'}
      />
    </div >
  );
}
