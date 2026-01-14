/**
 * Options Editor Component
 * Comprehensive editor for choice question options
 * Supports three source types:
 * 1. Static: Manual options with drag-and-drop reordering
 * 2. From List: Bind to a ListVariable from Read Table / List Tools blocks
 * 3. From Table Column: Convenience path to read from a table column
 */

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, X, GripVertical, Database, List as ListIcon } from "lucide-react";
import React, { useState, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

import type { DynamicOptionsConfig, DynamicOptionsSourceType } from "@/../../shared/types/stepConfigs";

export interface OptionItemData {
  id: string;
  label: string;
  alias?: string;
}

interface OptionsEditorProps {
  options: (string | OptionItemData)[] | DynamicOptionsConfig;
  onChange: (options: OptionItemData[] | DynamicOptionsConfig) => void;
  className?: string;
  elementId: string;
  mode?: 'easy' | 'advanced';  // Easy mode shows simplified UI
}

export function OptionsEditor({ options, onChange, className, elementId, mode = 'advanced' }: OptionsEditorProps) {
  // =========================================================================
  // State Management
  // =========================================================================

  // Determine source type from options structure
  const getSourceType = (opts: any): DynamicOptionsSourceType => {
    if (opts && typeof opts === 'object' && 'type' in opts) {
      return opts.type as DynamicOptionsSourceType;
    }
    if (opts && typeof opts === 'object' && ('listVariable' in opts || 'dataSourceId' in opts)) {
      // Legacy dynamic format
      return opts.listVariable ? 'list' : 'table_column';
    }
    return 'static';
  };

  const [sourceType, setSourceType] = useState<DynamicOptionsSourceType>(getSourceType(options));

  // Static options
  const normalizeOptions = (opts: any): OptionItemData[] => {
    if (!opts) {return [];}
    if (!Array.isArray(opts)) {return [];}
    return opts.map((opt, index) => {
      if (typeof opt === 'string') {
        return {
          id: `opt-${Date.now()}-${index}`,
          label: opt,
          alias: opt.toLowerCase().replace(/\s+/g, '_')
        };
      }
      return {
        ...opt,
        id: opt.id || `opt-${Date.now()}-${index}`
      };
    });
  };

  const [localOptions, setLocalOptions] = useState<OptionItemData[]>(() => {
    if (sourceType === 'static' && Array.isArray(options)) {
      return normalizeOptions(options);
    }
    if (typeof options === 'object' && 'type' in options && options.type === 'static') {
      return normalizeOptions(options.options);
    }
    return [];
  });

  // List source state
  const [listConfig, setListConfig] = useState(() => {
    if (typeof options === 'object' && 'type' in options && options.type === 'list') {
      return {
        listVariable: options.listVariable || '',
        labelPath: options.labelPath || '',
        valuePath: options.valuePath || '',
      };
    }
    return { listVariable: '', labelPath: '', valuePath: '' };
  });

  // Table column source state
  const [tableConfig, setTableConfig] = useState(() => {
    if (typeof options === 'object' && 'type' in options && options.type === 'table_column') {
      return {
        dataSourceId: options.dataSourceId || '',
        tableId: options.tableId || '',
        columnId: options.columnId || '',
        labelColumnId: options.labelColumnId || '',
        sort: options.sort,
        limit: options.limit || 100,
      };
    }
    return {
      dataSourceId: '',
      tableId: '',
      columnId: '',
      labelColumnId: '',
      limit: 100,
    };
  });

  // Sync with external changes
  useEffect(() => {
    const newSourceType = getSourceType(options);
    setSourceType(newSourceType);

    if (newSourceType === 'static') {
      if (Array.isArray(options)) {
        setLocalOptions(normalizeOptions(options));
      } else if (typeof options === 'object' && 'type' in options && options.type === 'static') {
        setLocalOptions(normalizeOptions(options.options));
      }
    }
  }, [options]);

  // =========================================================================
  // DnD Sensors
  // =========================================================================

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // =========================================================================
  // Static Options Handlers
  // =========================================================================

  const handleAddOption = () => {
    const newId = `opt-${Date.now()}`;
    const newOption: OptionItemData = {
      id: newId,
      label: `Option ${localOptions.length + 1}`,
      alias: `option_${localOptions.length + 1}`
    };
    const newOptions = [...localOptions, newOption];
    setLocalOptions(newOptions);
    emitStaticOptions(newOptions);
  };

  const handleRemoveOption = (index: number) => {
    const newOptions = localOptions.filter((_, i) => i !== index);
    setLocalOptions(newOptions);
    emitStaticOptions(newOptions);
  };

  const handleUpdateOption = (index: number, field: keyof OptionItemData, value: string) => {
    const newOptions = [...localOptions];
    newOptions[index] = { ...newOptions[index], [field]: value };
    setLocalOptions(newOptions);
  };

  const handleBlur = () => {
    emitStaticOptions(localOptions);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = localOptions.findIndex((o) => o.id === active.id);
      const newIndex = localOptions.findIndex((o) => o.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const reordered = arrayMove(localOptions, oldIndex, newIndex);
        setLocalOptions(reordered);
        emitStaticOptions(reordered);
      }
    }
  };

  const emitStaticOptions = (opts: OptionItemData[]) => {
    onChange({ type: 'static', options: opts } as DynamicOptionsConfig);
  };

  // =========================================================================
  // Source Type Change Handler
  // =========================================================================

  const handleSourceTypeChange = (newType: DynamicOptionsSourceType) => {
    setSourceType(newType);

    if (newType === 'static') {
      emitStaticOptions(localOptions);
    } else if (newType === 'list') {
      onChange({
        type: 'list',
        listVariable: listConfig.listVariable || '',
        labelPath: listConfig.labelPath || '',
        valuePath: listConfig.valuePath || '',
      } as DynamicOptionsConfig);
    } else if (newType === 'table_column') {
      onChange({
        type: 'table_column',
        dataSourceId: tableConfig.dataSourceId || '',
        tableId: tableConfig.tableId || '',
        columnId: tableConfig.columnId || '',
        labelColumnId: tableConfig.labelColumnId || '',
        limit: tableConfig.limit || 100,
      } as DynamicOptionsConfig);
    }
  };

  // =========================================================================
  // List Config Handlers
  // =========================================================================

  const handleListConfigChange = (field: keyof typeof listConfig, value: string) => {
    const newConfig = { ...listConfig, [field]: value };
    setListConfig(newConfig);
    onChange({
      type: 'list',
      listVariable: newConfig.listVariable,
      labelPath: newConfig.labelPath,
      valuePath: newConfig.valuePath,
    } as DynamicOptionsConfig);
  };

  // =========================================================================
  // Table Config Handlers
  // =========================================================================

  const handleTableConfigChange = (field: keyof typeof tableConfig, value: any) => {
    const newConfig = { ...tableConfig, [field]: value };
    setTableConfig(newConfig);
    onChange({
      type: 'table_column',
      dataSourceId: newConfig.dataSourceId,
      tableId: newConfig.tableId,
      columnId: newConfig.columnId,
      labelColumnId: newConfig.labelColumnId,
      limit: newConfig.limit,
    } as DynamicOptionsConfig);
  };

  // =========================================================================
  // Render
  // =========================================================================

  const isEasyMode = mode === 'easy';

  return (
    <div className={cn("space-y-4", className)}>
      {/* Source Type Selector */}
      <div className="space-y-2">
        <Label htmlFor={`source-type-${elementId}`} className="text-sm font-medium">
          Options Source
        </Label>
        {isEasyMode ? (
          <Select value={sourceType} onValueChange={handleSourceTypeChange}>
            <SelectTrigger id={`source-type-${elementId}`}>
              <SelectValue placeholder="Select source..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="static">Static Options</SelectItem>
              <SelectItem value="list">From Saved Data</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <div className="flex bg-muted rounded-md p-0.5">
            <button
              onClick={() => handleSourceTypeChange('static')}
              className={cn(
                "flex-1 text-xs px-3 py-1.5 rounded-sm transition-colors flex items-center justify-center gap-1.5",
                sourceType === 'static' ? "bg-background shadow-sm text-foreground font-medium" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Static
            </button>
            <button
              onClick={() => handleSourceTypeChange('list')}
              className={cn(
                "flex-1 text-xs px-3 py-1.5 rounded-sm transition-colors flex items-center justify-center gap-1.5",
                sourceType === 'list' ? "bg-background shadow-sm text-foreground font-medium" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <ListIcon className="w-3 h-3" />
              From List
            </button>
            <button
              onClick={() => handleSourceTypeChange('table_column')}
              className={cn(
                "flex-1 text-xs px-3 py-1.5 rounded-sm transition-colors flex items-center justify-center gap-1.5",
                sourceType === 'table_column' ? "bg-background shadow-sm text-foreground font-medium" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Database className="w-3 h-3" />
              From Table
            </button>
          </div>
        )}
        <p className="text-[10px] text-muted-foreground">
          {sourceType === 'static' && 'Define options manually'}
          {sourceType === 'list' && 'Load options from a List variable (Read Table / List Tools)'}
          {sourceType === 'table_column' && 'Load options directly from a table column'}
        </p>
      </div>

      {/* Static Options Editor */}
      {sourceType === 'static' && (
        <>
          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleAddOption}
              className="h-7 text-xs"
            >
              <Plus className="w-3 h-3 mr-1" />
              Add Option
            </Button>
          </div>

          {localOptions.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2 text-center border border-dashed rounded">
              No options defined. Click "Add Option" to get started.
            </p>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={localOptions.map((o) => o.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  <div className="grid grid-cols-[24px_1fr_1fr_24px] gap-2 px-1.5 mb-1">
                    <span />
                    <span className="text-[10px] text-muted-foreground pl-1">Display Label</span>
                    <span className="text-[10px] text-muted-foreground pl-1">Saved Value</span>
                    <span />
                  </div>
                  {localOptions.map((option, index) => (
                    <OptionItem
                      key={option.id}
                      id={option.id}
                      data={option}
                      index={index}
                      onUpdate={handleUpdateOption}
                      onBlur={handleBlur}
                      onRemove={() => handleRemoveOption(index)}
                      elementId={elementId}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </>
      )}

      {/* From List Config */}
      {sourceType === 'list' && (
        <div className="space-y-3 p-3 border rounded-md bg-muted/20">
          <div className="space-y-1.5">
            <Label htmlFor={`list-var-${elementId}`} className="text-xs font-medium">
              List Variable
            </Label>
            <Input
              id={`list-var-${elementId}`}
              placeholder="e.g. usersList"
              className="h-8 font-mono text-xs"
              value={listConfig.listVariable}
              onChange={(e) => handleListConfigChange('listVariable', e.target.value)}
            />
            <p className="text-[10px] text-muted-foreground">
              The variable name output by a Read Table or List Tools block.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor={`list-label-${elementId}`} className="text-xs font-medium">
                Label Column
              </Label>
              <Input
                id={`list-label-${elementId}`}
                placeholder="e.g. full_name"
                className="h-8 text-xs"
                value={listConfig.labelPath}
                onChange={(e) => handleListConfigChange('labelPath', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`list-value-${elementId}`} className="text-xs font-medium">
                Value Column
              </Label>
              <Input
                id={`list-value-${elementId}`}
                placeholder="e.g. user_id"
                className="h-8 text-xs"
                value={listConfig.valuePath}
                onChange={(e) => handleListConfigChange('valuePath', e.target.value)}
              />
            </div>
          </div>
        </div>
      )}

      {/* From Table Column Config */}
      {sourceType === 'table_column' && (
        <div className="space-y-3 p-3 border rounded-md bg-muted/20">
          <div className="space-y-1.5">
            <Label htmlFor={`table-ds-${elementId}`} className="text-xs font-medium">
              Data Source ID
            </Label>
            <Input
              id={`table-ds-${elementId}`}
              placeholder="Database UUID"
              className="h-8 font-mono text-xs"
              value={tableConfig.dataSourceId}
              onChange={(e) => handleTableConfigChange('dataSourceId', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`table-id-${elementId}`} className="text-xs font-medium">
              Table ID
            </Label>
            <Input
              id={`table-id-${elementId}`}
              placeholder="Table UUID"
              className="h-8 font-mono text-xs"
              value={tableConfig.tableId}
              onChange={(e) => handleTableConfigChange('tableId', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`table-col-${elementId}`} className="text-xs font-medium">
              Column ID
            </Label>
            <Input
              id={`table-col-${elementId}`}
              placeholder="Column UUID"
              className="h-8 font-mono text-xs"
              value={tableConfig.columnId}
              onChange={(e) => handleTableConfigChange('columnId', e.target.value)}
            />
            <p className="text-[10px] text-muted-foreground">
              The column to use for both label and value.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`table-label-col-${elementId}`} className="text-xs font-medium">
              Label Column ID (Optional)
            </Label>
            <Input
              id={`table-label-col-${elementId}`}
              placeholder="Column UUID for display text"
              className="h-8 font-mono text-xs"
              value={tableConfig.labelColumnId}
              onChange={(e) => handleTableConfigChange('labelColumnId', e.target.value)}
            />
            <p className="text-[10px] text-muted-foreground">
              If specified, use this column for display labels instead.
            </p>
          </div>
          {!isEasyMode && (
            <div className="space-y-1.5">
              <Label htmlFor={`table-limit-${elementId}`} className="text-xs font-medium">
                Limit
              </Label>
              <Input
                id={`table-limit-${elementId}`}
                type="number"
                min="1"
                max="1000"
                placeholder="100"
                className="h-8 text-xs"
                value={tableConfig.limit}
                onChange={(e) => handleTableConfigChange('limit', parseInt(e.target.value) || 100)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// OptionItem Component (for Static options)
// ============================================================================

interface OptionItemProps {
  id: string;
  data: OptionItemData;
  index: number;
  onUpdate: (index: number, field: keyof OptionItemData, value: string) => void;
  onBlur: () => void;
  onRemove: () => void;
  elementId: string;
}

function OptionItem({ id, data, index, onUpdate, onBlur, onRemove, elementId }: OptionItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 p-1.5 rounded border bg-background group",
        isDragging && "opacity-50"
      )}
    >
      <button
        className="cursor-grab active:cursor-grabbing p-0.5 hover:bg-accent rounded opacity-0 group-hover:opacity-100 mt-1"
        {...attributes}
        {...listeners}
        aria-label="Reorder option"
      >
        <GripVertical className="h-3 w-3 text-muted-foreground" />
      </button>

      {/* Display Value (Label) */}
      <Input
        id={`opt-label-${elementId}-${index}`}
        value={data.label}
        onChange={(e) => onUpdate(index, 'label', e.target.value)}
        onBlur={onBlur}
        className="flex-1 h-8 text-sm"
        placeholder="Display Value"
        aria-label="Display Value"
      />

      {/* Saved Value (Alias) */}
      <Input
        id={`opt-alias-${elementId}-${index}`}
        value={data.alias || ""}
        onChange={(e) => onUpdate(index, 'alias', e.target.value)}
        onBlur={onBlur}
        className="flex-1 h-8 text-sm font-mono text-muted-foreground"
        placeholder="Saved Value"
        aria-label="Saved Value"
      />

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 opacity-0 group-hover:opacity-100"
        onClick={onRemove}
        aria-label={`Remove option ${data.label}`}
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}
