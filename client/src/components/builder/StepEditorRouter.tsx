import type { ApiStep } from '@/lib/vault-api';

// eslint-disable-next-line import/no-cycle
import { AddressCardEditor } from './cards/AddressCardEditor';
// eslint-disable-next-line import/no-cycle
import { BooleanCardEditor } from './cards/BooleanCardEditor';
// eslint-disable-next-line import/no-cycle
import { ChoiceCardEditor } from './cards/ChoiceCardEditor';
// eslint-disable-next-line import/no-cycle
import { DisplayCardEditor } from './cards/DisplayCardEditor';
// eslint-disable-next-line import/no-cycle
import { EmailCardEditor } from './cards/EmailCardEditor';
import { MultiFieldCardEditor } from './cards/MultiFieldCardEditor';
import { NumberCardEditor } from './cards/NumberCardEditor';
// eslint-disable-next-line import/no-cycle
import { PhoneCardEditor } from './cards/PhoneCardEditor';
import { ScaleCardEditor } from './cards/ScaleCardEditor';
import { SignatureBlockEditor } from './cards/SignatureBlockEditor';
import { TextCardEditor } from './cards/TextCardEditor';
// eslint-disable-next-line import/no-cycle
import { WebsiteCardEditor } from './cards/WebsiteCardEditor';
// eslint-disable-next-line import/no-cycle
import { LegacyStepBody } from './questions/LegacyStepBody';

export interface StepEditorCommonProps {
    stepId: string;
    sectionId: string;
    workflowId: string;
    step: ApiStep;
}

// eslint-disable-next-line complexity
export function StepEditorRouter({ step, sectionId, workflowId }: { step: ApiStep; sectionId: string; workflowId: string }) {
    const commonProps: StepEditorCommonProps = {
        stepId: step.id,
        sectionId,
        workflowId,
        step,
    };

    // Display Steps
    if (step.type === 'display') {
        return <DisplayCardEditor {...commonProps} />;
    }

    // Text Steps
    if (step.type === 'short_text' || step.type === 'long_text' || step.type === 'text') {
        return <TextCardEditor {...commonProps} />;
    }

    // Boolean Steps
    if (step.type === 'yes_no' || step.type === 'true_false' || step.type === 'boolean') {
        return <BooleanCardEditor {...commonProps} />;
    }

    // Choice Steps
    if (step.type === 'radio' || step.type === 'multiple_choice' || step.type === 'choice') {
        return <ChoiceCardEditor {...commonProps} />;
    }

    // Number Steps
    if (step.type === 'number' || step.type === 'currency') {
        return <NumberCardEditor {...commonProps} />;
    }

    // Address Steps
    if (step.type === 'address') {
        return <AddressCardEditor {...commonProps} />;
    }

    // Email Steps
    if (step.type === 'email') {
        return <EmailCardEditor {...commonProps} />;
    }

    // Phone Steps
    if (step.type === 'phone') {
        return <PhoneCardEditor {...commonProps} />;
    }

    // Website/URL Steps
    if (step.type === 'website') {
        return <WebsiteCardEditor {...commonProps} />;
    }

    // Scale/Rating Steps
    if (step.type === 'scale') {
        return <ScaleCardEditor {...commonProps} />;
    }

    // Multi-Field Steps
    if (step.type === 'multi_field') {
        return <MultiFieldCardEditor {...commonProps} />;
    }

    // Signature Steps
    if (step.type === 'signature_block' || step.type === 'signature') {
        return <SignatureBlockEditor {...commonProps} />;
    }

    // Phase 1: Route everything to LegacyStepBody
    // Phase 2: Incrementally add specialized editors here
    // Remaining Legacy Types: date_time, date, time, file_upload, js_question, signature, signature_block
    return <LegacyStepBody {...commonProps} />;
}
