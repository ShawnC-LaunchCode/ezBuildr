/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
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

import React from "react";

import { Label } from "@/components/ui/label";
import type { Step } from "@/types";

// Block Renderers
import { AddressBlockRenderer } from "./AddressBlock";
import { BooleanBlockRenderer } from "./BooleanBlock";
import { ChoiceBlockRenderer } from "./ChoiceBlock";
import { CurrencyBlockRenderer } from "./CurrencyBlock";
import { DateBlockRenderer } from "./DateBlock";
import { DateTimeBlockRenderer } from "./DateTimeBlock";
import { DisplayBlockRenderer } from "./DisplayBlock";
import { EmailBlockRenderer } from "./EmailBlock";
import { FinalBlockRenderer } from "./FinalBlock";
import { MultiFieldBlockRenderer } from "./MultiFieldBlock";
import { NumberBlockRenderer } from "./NumberBlock";
import { PhoneBlockRenderer } from "./PhoneBlock";
import { ScaleBlockRenderer } from "./ScaleBlock";
import { SignatureBlockRenderer } from "./SignatureBlockRenderer";
import { getRunnerStepTypeStatus, normalizeRunnerStepType } from "./stepTypeRouting";
import { TextBlockRenderer } from "./TextBlock";
import { TimeBlockRenderer } from "./TimeBlock";
import { WebsiteBlockRenderer } from "./WebsiteBlock";

// ============================================================================
// TYPES
// ============================================================================

export interface BlockRendererProps {
  /** Step/block configuration */
  step: Step;

  /** Current value (keyed by step.alias or step.id) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any;

  /** Callback when value changes */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onChange: (value: any) => void;

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
}

function ExplicitRunnerTypeNotice({ type, status }: { type: string; status: "unsupported" | "unknown" }) {
  const message = status === "unsupported"
    ? "This question type is not available in the runner yet."
    : "This question type is not recognized by the runner.";

  return (
    <div className="rounded-md border border-muted bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
      {message}
      <span className="ml-1 font-mono text-xs">{type}</span>
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

  // -------------------------------------------------------------------------
  // Handle JS blocks (no UI, invisible execution)
  // -------------------------------------------------------------------------
  if (typeStatus === "hidden" || step.isVirtual) {
    // Computed, JS, and virtual steps are execution-only and do not render UI.
    return null;
  }

  // Generate ARIA IDs
  const descriptionId = step.description ? `${step.id}-description` : undefined;
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

        return <TextBlockRenderer step={step} value={value} onChange={onChange} readOnly={readOnly} ariaDescribedBy={ariaDescribedBy} />;

      // Boolean blocks
      case "boolean":
        return <BooleanBlockRenderer step={step} value={value} onChange={onChange} readOnly={readOnly} ariaDescribedBy={ariaDescribedBy} required={required} hasError={Boolean(showValidation && error)} />;

      // Validated inputs
      case "phone":
        return <PhoneBlockRenderer step={step} value={value} onChange={onChange} readOnly={readOnly} ariaDescribedBy={ariaDescribedBy} required={required} hasError={Boolean(showValidation && error)} />;

      case "email":
        return <EmailBlockRenderer step={step} value={value} onChange={onChange} readOnly={readOnly} ariaDescribedBy={ariaDescribedBy} required={required} hasError={Boolean(showValidation && error)} />;

      case "website":
        return <WebsiteBlockRenderer step={step} value={value} onChange={onChange} readOnly={readOnly} ariaDescribedBy={ariaDescribedBy} required={required} hasError={Boolean(showValidation && error)} />;

      // Date/Time inputs
      case "date":
        return <DateBlockRenderer step={step} value={value} onChange={onChange} readOnly={readOnly} ariaDescribedBy={ariaDescribedBy} required={required} hasError={Boolean(showValidation && error)} />;

      case "time":
        return <TimeBlockRenderer step={step} value={value} onChange={onChange} readOnly={readOnly} ariaDescribedBy={ariaDescribedBy} required={required} hasError={Boolean(showValidation && error)} />;

      case "date_time":
        return <DateTimeBlockRenderer step={step} value={value} onChange={onChange} readOnly={readOnly} ariaDescribedBy={ariaDescribedBy} required={required} hasError={Boolean(showValidation && error)} />;

      // Numeric inputs
      case "number":
        return <NumberBlockRenderer step={step} value={value} onChange={onChange} readOnly={readOnly} ariaDescribedBy={ariaDescribedBy} required={required} hasError={Boolean(showValidation && error)} />;

      case "currency":
        return <CurrencyBlockRenderer step={step} value={value} onChange={onChange} readOnly={readOnly} ariaDescribedBy={ariaDescribedBy} required={required} hasError={Boolean(showValidation && error)} />;

      case "scale":
        return <ScaleBlockRenderer step={step} value={value} onChange={onChange} readOnly={readOnly} ariaDescribedBy={ariaDescribedBy} required={required} hasError={Boolean(showValidation && error)} />;

      // Choice inputs
      case "choice":
        return <ChoiceBlockRenderer step={step} value={value} onChange={onChange} readOnly={readOnly} ariaDescribedBy={ariaDescribedBy} required={required} hasError={Boolean(showValidation && error)} context={props.context} />;

      // Complex blocks
      case "address":
        return <AddressBlockRenderer step={step} value={value} onChange={onChange} readOnly={readOnly} ariaDescribedBy={ariaDescribedBy} required={required} hasError={Boolean(showValidation && error)} />;

      case "multi_field":
        return <MultiFieldBlockRenderer step={step} value={value} onChange={onChange} readOnly={readOnly} ariaDescribedBy={ariaDescribedBy} required={required} hasError={Boolean(showValidation && error)} />;

      // Display blocks
      case "display":
        return <DisplayBlockRenderer step={step} context={props.context} />;

      // Final block (output/completion)
      case "final_documents":
        return <FinalBlockRenderer step={step} />;

      // Signature block (e-signature integration)
      case "signature_block":
        return <SignatureBlockRenderer step={step} />;

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
        {step.title}
        {required && <span className="text-destructive ml-1" aria-hidden="true">*</span>}
      </Label>

      {/* Description/Help Text */}
      {step.description && (
        <p id={descriptionId} className="text-sm text-muted-foreground">{step.description}</p>
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
