import { AddressCardEditor } from './cards/AddressCardEditor';
import { BooleanCardEditor } from './cards/BooleanCardEditor';
import { ChoiceCardEditor } from './cards/ChoiceCardEditor';
import { DateTimeCardEditor } from './cards/DateTimeCardEditor';
import { DisplayCardEditor } from './cards/DisplayCardEditor';
import { EmailCardEditor } from './cards/EmailCardEditor';
import { GenericStepEditor } from './cards/GenericStepEditor';
import { JsQuestionCardEditor } from './cards/JsQuestionCardEditor';
import { MultiFieldCardEditor } from './cards/MultiFieldCardEditor';
import { NumberCardEditor } from './cards/NumberCardEditor';
import { PhoneCardEditor } from './cards/PhoneCardEditor';
import { ScaleCardEditor } from './cards/ScaleCardEditor';
import { SignatureBlockEditor } from './cards/SignatureBlockEditor';
import { TextCardEditor } from './cards/TextCardEditor';
import { WebsiteCardEditor } from './cards/WebsiteCardEditor';
import type { StepEditorCommonProps } from './cards/common/stepEditorProps';

// eslint-disable-next-line complexity
export function StepEditorRouter({ step, sectionId, workflowId }: Omit<StepEditorCommonProps, 'stepId'>) {
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

    // Date/Time Steps
    if (
        step.type === 'date' ||
        step.type === 'time' ||
        step.type === 'date_time' ||
        step.type === 'datetime' ||
        step.type === 'datetime_unified'
    ) {
        return <DateTimeCardEditor {...commonProps} />;
    }

    // JS / Computed Steps
    if (step.type === 'js_question') {
        return <JsQuestionCardEditor {...commonProps} />;
    }

    // Multi-Field Steps
    if (step.type === 'multi_field') {
        return <MultiFieldCardEditor {...commonProps} />;
    }

    // Signature Steps
    if (step.type === 'signature_block' || step.type === 'signature') {
        return <SignatureBlockEditor {...commonProps} />;
    }

    // Fallback for legacy / imported enum types with no dedicated editor
    // (e.g. computed, repeater, file_upload, *_advanced variants). These have no
    // creation path in the palette but may exist in older workflows.
    return <GenericStepEditor {...commonProps} />;
}
