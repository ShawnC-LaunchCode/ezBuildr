/**
 * Description Field Component
 * Editor for step description / help text
 */

import React from "react";

import { AutoExpandTextarea } from "@/components/ui/auto-expand-textarea";
import { useUpdateStep } from "@/lib/vault-hooks";

import { EditorField } from "./EditorField";

interface DescriptionFieldProps {
    stepId: string;
    sectionId: string;
    description?: string | null;
    isDisplayStep?: boolean;
}

export function DescriptionField({
    stepId,
    sectionId,
    description,
    isDisplayStep = false
}: DescriptionFieldProps) {
    const updateStepMutation = useUpdateStep();

    const handleDescriptionChange = (value: string) => {
        updateStepMutation.mutate({ id: stepId, sectionId, description: value });
    };

    return (
        <EditorField
            label={isDisplayStep ? "Content (Markdown)" : "Description / Help Text"}
            description={isDisplayStep ? undefined : "Optional"}
        >
            <AutoExpandTextarea
                id={`description-${stepId}`}
                name={`description-${stepId}`}
                value={description || ""}
                onChange={(e) => handleDescriptionChange(e.target.value)}
                placeholder={isDisplayStep ? "Enter markdown content..." : "Add instructions for the user..."}
                minRows={isDisplayStep ? 6 : 1}
                maxRows={isDisplayStep ? 12 : 4}
                className="text-sm"
            />
        </EditorField>
    );
}
