// @ts-nocheck
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useChoiceConfig, type ChoiceCardState } from "@/hooks/useChoiceConfig";
import { useListToolsValidation } from "@/hooks/useListToolsValidation";
import { blockAPI, type ApiTransformBlock } from "@/lib/vault-api";
import { useUpdateStep, useWorkflowVariables, useWorkflow } from "@/lib/vault-hooks";

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import type { ChoiceAdvancedConfig, ChoiceOption } from "@shared/types/stepConfigs";

import { BlockEditorDialog, type UniversalBlock } from "../BlockEditorDialog";
// eslint-disable-next-line import/no-cycle
import { StepEditorCommonProps } from "../StepEditorRouter";

import { ListToolsDialogs } from "./choices/ListToolsDialogs";
import { AliasField } from "./common/AliasField";
import { DefaultValueField, DefaultValueType } from "./common/DefaultValueField";
import { SectionHeader } from "./common/EditorField";
import { RequiredToggle } from "./common/RequiredToggle";
import { DynamicOptionsEditor } from "./DynamicOptionsEditor";
import { StaticOptionsEditor } from "./StaticOptionsEditor";

// eslint-disable-next-line max-lines-per-function
export function ChoiceCardEditor({ stepId, sectionId, workflowId, step }: StepEditorCommonProps) {
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

  // Use custom hooks for config management
  const { localConfig, setLocalConfig, sourceMode, setSourceMode } = useChoiceConfig(step);

  // State
  const [errors, setErrors] = useState<string[]>([]);

  // Fetch Workflow Variables (for dynamic mode)
  const { data: variables = [] } = useWorkflowVariables(workflowId);

  // Filter for List variables only
  const listVariables = useMemo(() => {
    return (variables).filter(v => v.type === 'read_table' || v.type === 'list_tools');
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
  } = useListToolsValidation({ localConfig, workflowId, sectionId });


  // Derived state for Dynamic Columns
  const _selectedListVarName = localConfig?.dynamicOptions?.listVariable;

  // ---------------------------------------------------------------------------
  // HANDLERS
  // ---------------------------------------------------------------------------

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
      const payload: ChoiceAdvancedConfig = {
        display: newConfig.display,
        allowMultiple: newConfig.allowMultiple,
        searchable: newConfig.searchable,
        options: saveSourceMode === 'static'
          // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
          ? { type: 'static', options: newConfig.staticOptions || [] }
          // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
          : { ...(newConfig.dynamicOptions || { listVariable: '' }), type: 'list' }
      };
      // Auto-upgrade type if needed
      if (step.type !== 'choice') {
        updateStepMutation.mutate({ id: stepId, sectionId, type: 'choice', config: payload });
      } else {
        updateStepMutation.mutate({ id: stepId, sectionId, config: payload });
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
      updateStepMutation.mutate({ id: stepId, sectionId, config: payload });
    }
  };

  const handleUpdate = (updates: Partial<ChoiceCardState>) => {
    if (!localConfig) { return; }
    const next: ChoiceCardState = { ...localConfig, ...updates };
    setLocalConfig(next);
    saveConfig(next, sourceMode);
  };

  const handleSourceModeChange = (val: string) => {
    if (!localConfig) { return; }
    const newMode = val as "static" | "dynamic";
    setSourceMode(newMode);
    saveConfig(localConfig, newMode);
  };

  const handleAddOption = () => {
    if (!localConfig) { return; }
    const newOptions = [
      ...localConfig.staticOptions,
      {
        id: `opt${localConfig.staticOptions.length + 1}`,
        label: `Option ${localConfig.staticOptions.length + 1}`,
        alias: `option${localConfig.staticOptions.length + 1}`,
      },
    ];
    handleUpdate({ staticOptions: newOptions });
  };

  const handleUpdateOption = (index: number, field: keyof ChoiceOption, value: string) => {
    if (!localConfig) { return; }
    const newOptions = [...localConfig.staticOptions];
    newOptions[index] = { ...newOptions[index], [field]: value };
    handleUpdate({ staticOptions: newOptions });
  };

  const handleDeleteOption = (index: number) => {
    if (!localConfig) { return; }
    const newOptions = localConfig.staticOptions.filter((_, i: number) => i !== index);
    handleUpdate({ staticOptions: newOptions });
  };


  const handleAliasChange = (alias: string | null) => updateStepMutation.mutate({ id: stepId, sectionId, alias });
  const handleRequiredChange = (required: boolean) => updateStepMutation.mutate({ id: stepId, sectionId, required });
  const handleDisplayChange = (display: "radio" | "dropdown" | "multiple") => {
    const allowMultiple = display === "multiple";
    if (!isAdvancedMode && sourceMode === 'static') {
      const newType = allowMultiple ? "multiple_choice" : "radio";
      updateStepMutation.mutate({ id: stepId, sectionId, type: newType });
    } else {
      handleUpdate({ display, allowMultiple });
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
        sectionId: sectionId
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
        };
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
        sectionId: sectionId
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
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions, @typescript-eslint/prefer-nullish-coalescing
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

  return (
    <div className="space-y-4 p-4 border-t bg-muted/30">
      <AliasField value={step.alias} onChange={(val) => { void handleAliasChange(val); }} />
      <RequiredToggle checked={step.required} onChange={(val) => { void handleRequiredChange(val); }} />

      <Separator />

      {/* Display Mode */}
      <div className="space-y-3">
        <SectionHeader title="Display Mode" description="How choices are displayed" />
        <RadioGroup value={localConfig.display} onValueChange={(v) => handleDisplayChange(v as "radio" | "dropdown" | "multiple")} disabled={false} className="flex gap-4">
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="radio" id="d-radio" />
            <Label htmlFor="d-radio">Radio</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="dropdown" id="d-dropdown" />
            <Label htmlFor="d-dropdown">Dropdown</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="multiple" id="d-multiple" />
            <Label htmlFor="d-multiple">Multiple</Label>
          </div>
        </RadioGroup>

        {(localConfig.display === 'dropdown' || localConfig.display === 'multiple') && (
          <div className="flex items-center space-x-2 pt-2">
            <Switch
              id="searchable-mode"
              checked={localConfig.searchable ?? false}
              onCheckedChange={(c) => handleUpdate({ searchable: c })}
            />
            <Label htmlFor="searchable-mode" className="text-xs font-normal text-muted-foreground">Allow Search</Label>
          </div>
        )}
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
          <StaticOptionsEditor
            options={localConfig.staticOptions}
            onUpdate={handleUpdateOption}
            onDelete={handleDeleteOption}
            onAdd={handleAddOption}
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
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
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
        sectionId={sectionId}
        workflowId={workflowId}
        defaultValue={step.defaultValue as DefaultValueType}
        type={step.type}
        mode={isAdvancedMode ? 'advanced' : 'easy'}
      />
    </div >
  );
}
