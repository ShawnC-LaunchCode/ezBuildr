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
  value: any;

  /** Callback when value changes */
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
  context?: Record<string, any>;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function BlockRenderer(props: BlockRendererProps) {
  const { step, value, onChange, required, error, readOnly, showValidation } = props;

  // -------------------------------------------------------------------------
  // Handle JS blocks (no UI, invisible execution)
  // -------------------------------------------------------------------------
  if (step.type === "js_question" || step.isVirtual) {
    // JS blocks and virtual steps do not render any UI
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
  const renderBlockInput = () => {
    switch (step.type) {
      // Text blocks
      case "short_text":
      case "long_text":
      case "text":
        // @ts-ignore - Prop injection for accessibility
        return <TextBlockRenderer step={step} value={value} onChange={onChange} readOnly={readOnly} ariaDescribedBy={ariaDescribedBy} />;

      // Boolean blocks
      case "yes_no":
      case "true_false":
      case "boolean":
        return <BooleanBlockRenderer step={step} value={value} onChange={onChange} readOnly={readOnly} />;

      // Validated inputs
      case "phone":
        return <PhoneBlockRenderer step={step} value={value} onChange={onChange} readOnly={readOnly} />;

      case "email":
        return <EmailBlockRenderer step={step} value={value} onChange={onChange} readOnly={readOnly} />;

      case "website":
        return <WebsiteBlockRenderer step={step} value={value} onChange={onChange} readOnly={readOnly} />;

      // Date/Time inputs
      case "date":
        return <DateBlockRenderer step={step} value={value} onChange={onChange} readOnly={readOnly} />;

      case "time":
        return <TimeBlockRenderer step={step} value={value} onChange={onChange} readOnly={readOnly} />;

      case "date_time":
        return <DateTimeBlockRenderer step={step} value={value} onChange={onChange} readOnly={readOnly} />;

      // Numeric inputs
      case "number":
        return <NumberBlockRenderer step={step} value={value} onChange={onChange} readOnly={readOnly} />;

      case "currency":
        return <CurrencyBlockRenderer step={step} value={value} onChange={onChange} readOnly={readOnly} />;

      case "scale":
        return <ScaleBlockRenderer step={step} value={value} onChange={onChange} readOnly={readOnly} />;

      // Choice inputs
      case "radio":
      case "multiple_choice":
      case "choice":
        return <ChoiceBlockRenderer step={step} value={value} onChange={onChange} readOnly={readOnly} context={props.context} />;

      // Complex blocks
      case "address":
        return <AddressBlockRenderer step={step} value={value} onChange={onChange} readOnly={readOnly} />;

      case "multi_field":
        return <MultiFieldBlockRenderer step={step} value={value} onChange={onChange} readOnly={readOnly} />;

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
        console.warn(`[BlockRenderer] Unsupported block type: ${step.type}`);
        return (
          <div className="text-sm text-muted-foreground italic">
            Unsupported block type: {step.type}
          </div>
        );
    }
  };

  // -------------------------------------------------------------------------
  // Render block with label and error
  // -------------------------------------------------------------------------
  // Display blocks, final blocks, and signature blocks don't have labels
  if (step.type === "display" || step.type === "final_documents" || step.type === "signature_block") {
    return renderBlockInput();
  }

  return (
    <div className="space-y-2">
      {/* Label */}
      <Label htmlFor={step.id}>
        {step.title}
        {required && <span className="text-destructive ml-1">*</span>}
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
