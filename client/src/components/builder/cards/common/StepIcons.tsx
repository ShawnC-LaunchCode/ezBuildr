import { QuestionTypeIcon } from "@/components/shared/QuestionTypeIcon";

import type { StepType } from "@/lib/vault-api";

/**
 * Get the icon for a question type.
 *
 * This used to be a local switch that only knew nine types, so phone, email,
 * currency, address and every other newer type all silently rendered the same
 * generic page icon. It now delegates to QuestionTypeIcon, which reads
 * BLOCK_REGISTRY — the one place a type's mark and colour are defined.
 */
export function getQuestionTypeIcon(type: StepType, config?: unknown) {
    return <QuestionTypeIcon type={type} config={config} size="md" />;
}
