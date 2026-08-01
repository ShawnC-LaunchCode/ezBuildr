/**
 * Recursive per-level editor for a List step's field tree (LIST-6).
 *
 * `ListLevelEditor` renders one level's settings + sortable field rows.
 * `ListFieldRow` renders one field; when that field is itself `kind: "list"`,
 * its row recursively renders another `ListLevelEditor` for the nested
 * level. The two live in one file (not one component importing the other
 * from a sibling module) deliberately — a two-file split would form an
 * import cycle (`import/no-cycle` is an error in this repo) since each
 * genuinely needs the other to recurse.
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
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlertCircle, ChevronDown, ChevronRight, GripVertical, ListTree, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

import { LIST_VALIDATION_MAX_DEPTH } from "@shared/validation/BlockValidation";
import type { ListConfig, ListField, ListFieldQuestionType } from "@shared/types/stepConfigs";

import {
  LIST_FIELD_TYPE_OPTIONS,
  NESTED_LIST_TYPE_VALUE,
  appendField,
  changeFieldType,
  createNestedListField,
  createQuestionField,
  findDuplicateFieldAliases,
  isDuplicateFieldAlias,
  removeField,
  reorderFields,
  replaceField,
  validateFieldAliasFormat,
} from "./listEditorHelpers";
import { ListSettingsPanel } from "./ListSettingsPanel";

interface ListLevelEditorProps {
  config: ListConfig;
  onChange: (config: ListConfig) => void;
  /** 1-indexed — the top-level step's own fields are depth 1. */
  depth: number;
}

export function ListLevelEditor({ config, onChange, depth }: ListLevelEditorProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const fields = config.fields;
  const duplicateAliases = findDuplicateFieldAliases(fields);
  const canNest = depth < LIST_VALIDATION_MAX_DEPTH;

  const handleFieldsChange = (nextFields: ListField[]) => onChange({ ...config, fields: nextFields });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = fields.findIndex((f) => f.id === active.id);
      const newIndex = fields.findIndex((f) => f.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        handleFieldsChange(reorderFields(fields, oldIndex, newIndex));
      }
    }
  };

  return (
    <div className="space-y-3">
      <ListSettingsPanel config={config} onChange={onChange} depth={depth} fieldAliases={fields.map((f) => f.alias)} />

      {fields.length === 0 ? (
        <p className="text-sm text-muted-foreground p-3 border border-dashed rounded-md text-center">
          No fields yet. Add one below.
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {fields.map((field, index) => (
                <ListFieldRow
                  key={field.id}
                  field={field}
                  index={index}
                  depth={depth}
                  canNest={canNest}
                  isDuplicateAlias={isDuplicateFieldAlias(field.alias, duplicateAliases)}
                  onChange={(next) => handleFieldsChange(replaceField(fields, field.id, next))}
                  onRemove={() => handleFieldsChange(removeField(fields, field.id))}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => onChange(appendField(config, createQuestionField(fields)))}
        >
          <Plus className="h-4 w-4 mr-1" />
          Add field
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          disabled={!canNest}
          onClick={() => onChange(appendField(config, createNestedListField(fields)))}
        >
          <ListTree className="h-4 w-4 mr-1" />
          Add nested list
        </Button>
      </div>
      {!canNest && (
        <p className="text-xs text-muted-foreground">
          Lists can nest up to {LIST_VALIDATION_MAX_DEPTH} levels deep — this level is already at the limit.
        </p>
      )}
    </div>
  );
}

interface ListFieldRowProps {
  field: ListField;
  index: number;
  depth: number;
  canNest: boolean;
  isDuplicateAlias: boolean;
  onChange: (next: ListField) => void;
  onRemove: () => void;
}

function ListFieldRow({ field, index, depth, canNest, isDuplicateAlias, onChange, onRemove }: ListFieldRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.id });
  const [isExpanded, setIsExpanded] = useState(true);

  const style = { transform: CSS.Transform.toString(transform), transition };
  const aliasError = validateFieldAliasFormat(field.alias) ?? (isDuplicateAlias ? "Duplicate alias at this level" : null);
  const typeSelectValue = field.kind === "list" ? NESTED_LIST_TYPE_VALUE : field.type;

  const handleTypeChange = (value: string) => {
    onChange(changeFieldType(field, value as ListFieldQuestionType | typeof NESTED_LIST_TYPE_VALUE));
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`border rounded-md bg-background ${isDragging ? "opacity-50" : ""}`}
      data-testid="list-field-row"
    >
      <div className="flex items-start gap-2 p-3">
        <button
          type="button"
          className="cursor-grab active:cursor-grabbing p-1 mt-1"
          aria-label="Reorder field"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </button>
        <span className="text-xs text-muted-foreground w-5 pt-2">{index + 1}.</span>

        <div className="flex-1 space-y-2">
          <div className="flex gap-2">
            <div className="flex-1">
              <Label className="sr-only" htmlFor={`field-title-${field.id}`}>Title</Label>
              <Input
                id={`field-title-${field.id}`}
                value={field.title}
                onChange={(e) => onChange({ ...field, title: e.target.value })}
                placeholder="Field title"
                className="text-sm"
              />
            </div>
            <div className="w-40">
              <Label className="sr-only" htmlFor={`field-alias-${field.id}`}>Alias</Label>
              <Input
                id={`field-alias-${field.id}`}
                value={field.alias}
                onChange={(e) => onChange({ ...field, alias: e.target.value })}
                placeholder="alias"
                className={`text-sm font-mono ${aliasError ? "border-destructive focus-visible:ring-destructive" : ""}`}
              />
            </div>
          </div>

          {aliasError && (
            <div className="flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="h-3 w-3" />
              <span>{aliasError}</span>
            </div>
          )}

          <div className="flex items-center gap-3">
            <Select value={typeSelectValue} onValueChange={handleTypeChange}>
              <SelectTrigger className="h-8 text-xs flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LIST_FIELD_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
                <SelectItem value={NESTED_LIST_TYPE_VALUE} disabled={!canNest && typeSelectValue !== NESTED_LIST_TYPE_VALUE}>
                  Nested List
                </SelectItem>
              </SelectContent>
            </Select>

            {field.kind === "question" && (
              <div className="flex items-center gap-2 shrink-0">
                <Label htmlFor={`field-required-${field.id}`} className="text-xs">Required</Label>
                <Switch
                  id={`field-required-${field.id}`}
                  checked={field.required ?? false}
                  onCheckedChange={(required) => onChange({ ...field, required })}
                />
              </div>
            )}

            {field.kind === "list" && (
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground shrink-0"
                onClick={() => setIsExpanded((v) => !v)}
              >
                {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                {field.list.fields.length} field{field.list.fields.length === 1 ? "" : "s"} inside
              </button>
            )}
          </div>
        </div>

        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onRemove} aria-label="Remove field">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {field.kind === "list" && isExpanded && (
        <div className="ml-6 mr-3 mb-3 pl-4 border-l-2 border-muted space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Level {depth + 1} of {LIST_VALIDATION_MAX_DEPTH}
          </p>
          <ListLevelEditor config={field.list} onChange={(list) => onChange({ ...field, list })} depth={depth + 1} />
        </div>
      )}
    </div>
  );
}
