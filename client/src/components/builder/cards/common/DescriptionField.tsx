/**
 * Description Field Component
 * Editor for step description / help text
 */

import { AutoExpandTextarea } from "@/components/ui/auto-expand-textarea";
import { useDebouncedFieldMutation } from "@/hooks/useDebouncedFieldMutation";
import { useUpdateStep } from "@/lib/vault-hooks";

import { EditorField } from "./EditorField";

interface DescriptionFieldProps {
    stepId: string;
    pageId: string;
    description?: string | null;
    isDisplayStep?: boolean;
}

export function DescriptionField({
    stepId,
    pageId,
    description,
    isDisplayStep = false
}: DescriptionFieldProps) {
    const updateStepMutation = useUpdateStep();

    const handleDescriptionChange = (value: string) => {
        updateStepMutation.mutate({ id: stepId, pageId, description: value });
    };

    const { localValue, onChange, onBlur } = useDebouncedFieldMutation(
        description ?? "",
        handleDescriptionChange
    );

    return (
        <EditorField
            label={isDisplayStep ? "Content (Markdown)" : "Description / Help Text"}
            description={isDisplayStep ? undefined : "Optional"}
        >
            <AutoExpandTextarea
                id={`description-${stepId}`}
                name={`description-${stepId}`}
                value={localValue}
                onChange={(e) => onChange(e.target.value)}
                onBlur={onBlur}
                placeholder={isDisplayStep ? "Enter markdown content..." : "Add instructions for the user..."}
                minRows={isDisplayStep ? 6 : 1}
                maxRows={isDisplayStep ? 12 : 4}
                className="text-sm"
            />
        </EditorField>
    );
}
