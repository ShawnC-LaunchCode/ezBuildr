/**
 * BlockRenderer - Core Block Rendering System
 *
 * Central router that renders the appropriate block component based on step type.
 * Supports all block types defined in the block registry with proper validation,
 * value storage, and alias-based data management.
 *
 * @version 2.0.0 - Runner Renderer Overhaul (Prompt 5)
 * @date December 2025
 */

import { Info } from "lucide-react";
import React from "react";

import { Label } from "@/components/ui/label";
import type { Step } from "@/types";

import type { ListValue, MultiFieldValue } from "@shared/types/stepConfigs";

// Block Renderers
import { AddressBlockRenderer } from "./AddressBlock";
import { BooleanBlockRenderer } from "./BooleanBlock";
import { ChoiceBlockRenderer } from "./ChoiceBlock";
import { CurrencyBlockRenderer } from "./CurrencyBlock";
import { DateBlockRenderer } from "./DateBlock";
import { DateTimeBlockRenderer } from "./DateTimeBlock";
import { DisplayBlockRenderer } from "./DisplayBlock";
import { EmailBlockRenderer } from "./EmailBlock";
import { FileUploadBlockRenderer } from "./FileUploadBlock";
import { ListBlockRenderer } from "./ListBlock";
import { MultiFieldBlockRenderer } from "./MultiFieldBlock";
import { NumberBlockRenderer } from "./NumberBlock";
import { PhoneBlockRenderer } from "./PhoneBlock";
import { ScaleBlockRenderer } from "./ScaleBlock";
import { SignatureBlockRenderer } from "./SignatureBlockRenderer";
import { getRunnerStepTypeStatus, normalizeRunnerStepType } from "./stepTypeRouting";
import { TextBlockRenderer } from "./TextBlock";
import { TimeBlockRenderer } from "./TimeBlock";
import { WebsiteBlockRenderer } from "./WebsiteBlock";
import {
  interpolateRunnerText,
  type RunnerAnswerDefinitions,
} from "../runnerInterpolation";

// ============================================================================
// TYPES
// ============================================================================

export interface BlockRendererProps {
  /** Step/block configuration */
  step: Step;

  /** Current value (keyed by step.alias or step.id) */
  value: unknown;

  /** Callback when value changes */
  onChange: (value: unknown) => void;

  /** Whether this field is required (computed from step + logic rules) */
  required?: boolean;

  /** Validation error message (if any) */
  error?: string;

  /** Read-only mode (for review/final documents) */
  readOnly?: boolean;

  /** Show validation state */
  showValidation?: boolean;

  /** Full context for resolving variables (e.g. dynamic lists) */
  context?: Record<string, unknown>;

  /** Maps a step's alias to its answer key for alias-aware `{{variable}}` interpolation. */
  aliasMap?: Record<string, string>;

  /** Answer type/config keyed like `context`, used for human-readable structured interpolation. */
  answerDefinitions?: RunnerAnswerDefinitions;

  /** Active run credentials used by controls with run-scoped side effects. */
  runId?: string;
  runToken?: string | null;
  /** Top-level owning step for a control nested inside a List item. */
  runStepId?: string;
  /** True outside a live production run, where a signature block simulates
   * signing locally instead of calling the provider. */
  preview?: boolean;
}

function isMultiFieldValue(value: unknown): value is MultiFieldValue {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every(item =>
    item === null
    || typeof item === "string"
    || typeof item === "number"
    || typeof item === "boolean"
    || (Array.isArray(item) && item.every(entry => typeof entry === "string"))
  );
}

function isListValue(value: unknown): value is ListValue {
  return typeof value === "object" && value !== null && Array.isArray((value as { items?: unknown }).items);
}

function ExplicitRunnerTypeNotice({ type, status }: { type: string; status: "unsupported" | "unknown" }) {
  // Honest, not apologetic: the runner has no control for this step type, so
  // it is not required and will not block the respondent from finishing
  // (RUN2-3). "not available yet" previously implied a control was coming
  // and said nothing about what happens to the answer.
  const message = status === "unsupported"
    ? "This question type isn't supported in the runner yet, so it's skipped for this response."
    : "This question type isn't recognized by the runner, so it's skipped for this response.";

  return (
    <div className="flex items-start gap-2 rounded-md border border-muted bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
      <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        {message}
        <span className="ml-1 font-mono text-xs">{type}</span>
      </span>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function BlockRenderer(props: BlockRendererProps) {
  const { step, value, onChange, required, error, readOnly, showValidation } = props;
  const normalizedType = normalizeRunnerStepType(step.type);
  const typeStatus = getRunnerStepTypeStatus(step.type);
  const renderedStep = normalizedType === "display" ? step : {
    ...step,
    title: interpolateRunnerText(
      step.title,
      props.context,
      props.aliasMap,
      props.answerDefinitions,
      { output: "text" }
    ),
    description: step.description
      ? interpolateRunnerText(
        step.description,
        props.context,
        props.aliasMap,
        props.answerDefinitions,
        { output: "text" }
      )
      : step.description,
  };
  // Unsupported/unknown types are never required (RUN2-3) — don't mark them
  // required in the label when there's no control to answer with.
  const showRequiredIndicator = required && typeStatus !== "unsupported" && typeStatus !== "unknown";

  // -------------------------------------------------------------------------
  // Handle JS blocks (no UI, invisible execution)
  // -------------------------------------------------------------------------
  if (typeStatus === "hidden" || step.isVirtual) {
    // Computed, JS, and virtual steps are execution-only and do not render UI.
    return null;
  }

  // Generate ARIA IDs
  const descriptionId = renderedStep.description ? `${step.id}-description` : undefined;
  const errorId = showValidation && error ? `${step.id}-error` : undefined;

  // Combine IDs for aria-describedby
  const ariaDescribedBy = [descriptionId, errorId].filter(Boolean).join(" ") || undefined;

  // -------------------------------------------------------------------------
  // Render block input based on type
  // -------------------------------------------------------------------------
  // eslint-disable-next-line complexity
  const renderBlockInput = () => {
    if (typeStatus === "unsupported" || typeStatus === "unknown") {
      return <ExplicitRunnerTypeNotice type={step.type} status={typeStatus} />;
    }

    switch (normalizedType) {
      // Text blocks
      case "short_text":
      case "long_text":
      case "text":

        return <TextBlockRenderer step={renderedStep} value={typeof value === "string" ? value : null} onChange={onChange} readOnly={readOnly} ariaDescribedBy={ariaDescribedBy} required={required} hasError={Boolean(showValidation && error)} />;

      // Boolean blocks
      case "boolean":
        return <BooleanBlockRenderer step={renderedStep} value={value} onChange={onChange} readOnly={readOnly} ariaDescribedBy={ariaDescribedBy} required={required} hasError={Boolean(showValidation && error)} />;

      // Validated inputs
      case "phone":
        return <PhoneBlockRenderer step={renderedStep} value={value} onChange={onChange} readOnly={readOnly} ariaDescribedBy={ariaDescribedBy} required={required} hasError={Boolean(showValidation && error)} />;

      case "email":
        return <EmailBlockRenderer step={renderedStep} value={value} onChange={onChange} readOnly={readOnly} ariaDescribedBy={ariaDescribedBy} required={required} hasError={Boolean(showValidation && error)} />;

      case "website":
        return <WebsiteBlockRenderer step={renderedStep} value={value} onChange={onChange} readOnly={readOnly} ariaDescribedBy={ariaDescribedBy} required={required} hasError={Boolean(showValidation && error)} />;

      // Date/Time inputs
      case "date":
        return <DateBlockRenderer step={renderedStep} value={value} onChange={onChange} readOnly={readOnly} ariaDescribedBy={ariaDescribedBy} required={required} hasError={Boolean(showValidation && error)} />;

      case "time":
        return <TimeBlockRenderer step={renderedStep} value={value} onChange={onChange} readOnly={readOnly} ariaDescribedBy={ariaDescribedBy} required={required} hasError={Boolean(showValidation && error)} />;

      case "date_time":
        return <DateTimeBlockRenderer step={renderedStep} value={value} onChange={onChange} readOnly={readOnly} ariaDescribedBy={ariaDescribedBy} required={required} hasError={Boolean(showValidation && error)} />;

      // Numeric inputs
      case "number":
        return <NumberBlockRenderer step={renderedStep} value={value} onChange={onChange} readOnly={readOnly} ariaDescribedBy={ariaDescribedBy} required={required} hasError={Boolean(showValidation && error)} />;

      case "currency":
        return <CurrencyBlockRenderer step={renderedStep} value={value} onChange={onChange} readOnly={readOnly} ariaDescribedBy={ariaDescribedBy} required={required} hasError={Boolean(showValidation && error)} />;

      case "scale":
        return <ScaleBlockRenderer step={renderedStep} value={value} onChange={onChange} readOnly={readOnly} ariaDescribedBy={ariaDescribedBy} required={required} hasError={Boolean(showValidation && error)} />;

      // Choice inputs
      case "choice":
        return <ChoiceBlockRenderer step={renderedStep} value={value} onChange={onChange} readOnly={readOnly} ariaDescribedBy={ariaDescribedBy} required={required} hasError={Boolean(showValidation && error)} context={props.context} aliasMap={props.aliasMap} />;

      // Complex blocks
      case "address":
        return <AddressBlockRenderer step={renderedStep} value={value} onChange={onChange} readOnly={readOnly} ariaDescribedBy={ariaDescribedBy} required={required} hasError={Boolean(showValidation && error)} />;

      case "multi_field":
        return <MultiFieldBlockRenderer step={renderedStep} value={isMultiFieldValue(value) ? value : null} onChange={onChange} readOnly={readOnly} ariaDescribedBy={ariaDescribedBy} required={required} hasError={Boolean(showValidation && error)} />;

      case "file_upload":
        return <FileUploadBlockRenderer step={renderedStep} value={value} onChange={onChange} runId={props.runId} runToken={props.runToken} runStepId={props.runStepId} readOnly={readOnly} ariaDescribedBy={ariaDescribedBy} required={required} hasError={Boolean(showValidation && error)} />;

      // Nestable, repeating question (LIST-8)
      case "list":
        return <ListBlockRenderer step={renderedStep} value={isListValue(value) ? value : null} onChange={onChange} readOnly={readOnly} ariaDescribedBy={ariaDescribedBy} required={required} hasError={Boolean(showValidation && error)} />;

      // Display blocks
      case "display":
        return <DisplayBlockRenderer step={step} context={props.context} aliasMap={props.aliasMap} answerDefinitions={props.answerDefinitions} />;

      // Signature block (e-signature integration)
      case "signature_block":
        return (
          <SignatureBlockRenderer
            step={renderedStep}
            stepValues={props.context}
            runId={props.runId}
            runToken={props.runToken}
            preview={props.preview}
          />
        );

      // Legacy/fallback
      default:
        console.warn(`[BlockRenderer] Unmapped block type: ${step.type}`);
        return <ExplicitRunnerTypeNotice type={step.type} status="unknown" />;
    }
  };

  // -------------------------------------------------------------------------
  // Render block with label and error
  // -------------------------------------------------------------------------
  // Display blocks, final blocks, and signature blocks don't have labels
  if (normalizedType === "display" || normalizedType === "final_documents" || normalizedType === "signature_block") {
    return renderBlockInput();
  }

  return (
    <div id={`block-container-${step.id}`} className="space-y-2">
      {/* Label */}
      <Label htmlFor={step.id}>
        {renderedStep.title}
        {showRequiredIndicator && <span className="text-destructive ml-1" aria-hidden="true">*</span>}
      </Label>

      {/* Description/Help Text */}
      {renderedStep.description && (
        <p id={descriptionId} className="text-sm text-muted-foreground">{renderedStep.description}</p>
      )}

      {/* Input */}
      {renderBlockInput()}

      {/* Validation Error */}
      {showValidation && error && (
        <p id={errorId} className="text-sm text-destructive" role="alert">{error}</p>
      )}
    </div>
  );
}
