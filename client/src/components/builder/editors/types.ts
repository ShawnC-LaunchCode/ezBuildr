/**
 * Unified Step Editor Props Interface
 */
import type { ApiStep } from "@/lib/vault-api";

export interface StepEditorProps {
    step: ApiStep;
    sectionId: string;
    workflowId: string;
    // Optional: Pass the mode explicitly if calculated upstream to avoid recalcuating in every child
    mode?: 'easy' | 'advanced';
}
