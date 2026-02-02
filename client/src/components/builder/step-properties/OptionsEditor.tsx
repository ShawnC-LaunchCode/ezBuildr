
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
import { Plus, X, GripVertical } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface OptionsEditorProps {
    options: string[];
    onDraftChange: (options: string[]) => void;
    onCommitChange: (options: string[]) => void;
}

export function OptionsEditor({ options, onDraftChange, onCommitChange }: OptionsEditorProps) {
    // Initialize sensors for drag-and-drop
    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleAddOption = () => {
        const newOptions = [...options, `Option ${options.length + 1}`];
        onCommitChange(newOptions);
    };

    const handleRemoveOption = (index: number) => {
        const newOptions = options.filter((_, i) => i !== index);
        onCommitChange(newOptions);
    };

    const handleOptionTextChange = (index: number, text: string) => {
        const newOptions = [...options];
        newOptions[index] = text;
        onDraftChange(newOptions);
    };

    const handleOptionTextBlur = () => {
        onCommitChange(options);
    };

    const handleReorderOptions = (oldIndex: number, newIndex: number) => {
        const newOptions = arrayMove(options, oldIndex, newIndex);
        onCommitChange(newOptions);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            const oldIndex = options.findIndex((_, i) => i.toString() === active.id);
            const newIndex = options.findIndex((_, i) => i.toString() === over.id);

            if (oldIndex !== -1 && newIndex !== -1) {
                handleReorderOptions(oldIndex, newIndex);
            }
        }
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <Label>Options</Label>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAddOption}
                >
                    <Plus className="w-3 h-3 mr-1" />
                    Add Option
                </Button>
            </div>

            {options.length === 0 ? (
                <p className="text-sm text-muted-foreground">No options yet. Click &quot;Add Option&quot; to create one.</p>
            ) : (
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                >
                    <SortableContext
                        items={options.map((_, i) => i.toString())}
                        strategy={verticalListSortingStrategy}
                    >
                        <div className="space-y-2">
                            {options.map((option, index) => (
                                <OptionItem
                                    key={index}
                                    id={index.toString()}
                                    option={option}
                                    index={index}
                                    onChange={(text) => handleOptionTextChange(index, text)}
                                    onBlur={handleOptionTextBlur}
                                    onRemove={() => handleRemoveOption(index)}
                                />
                            ))}
                        </div>
                    </SortableContext>
                </DndContext>
            )}
        </div>
    );
}

interface OptionItemProps {
    id: string;
    option: string;
    index: number;
    onChange: (text: string) => void;
    onBlur: () => void;
    onRemove: () => void;
}

function OptionItem({ id, option, index, onChange, onBlur, onRemove }: OptionItemProps) {
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
            className={`flex items-center gap-2 p-2 rounded-md border bg-background ${isDragging ? "opacity-50" : ""
                }`}
        >
            <button
                className="cursor-grab active:cursor-grabbing p-1"
                {...attributes}
                {...listeners}
            >
                <GripVertical className="h-4 w-4 text-muted-foreground" />
            </button>

            <span className="text-sm text-muted-foreground w-6">{index + 1}.</span>

            <Input
                value={option}
                onChange={(e) => onChange(e.target.value)}
                onBlur={onBlur}
                className="flex-1"
                placeholder={`Option ${index + 1}`}
            />

            <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onRemove}
            >
                <X className="h-4 w-4" />
            </Button>
        </div>
    );
}
