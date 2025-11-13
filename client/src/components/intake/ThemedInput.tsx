/**
 * Stage 17: Themed Input Component
 *
 * Branded input for intake portals using tenant branding CSS variables
 */

import { InputHTMLAttributes, forwardRef, TextareaHTMLAttributes } from 'react';

export interface ThemedInputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Input label */
  label?: string;

  /** Helper text or error message */
  helperText?: string;

  /** Error state */
  error?: boolean;

  /** Required field indicator */
  showRequired?: boolean;
}

export interface ThemedTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Textarea label */
  label?: string;

  /** Helper text or error message */
  helperText?: string;

  /** Error state */
  error?: boolean;

  /** Required field indicator */
  showRequired?: boolean;
}

/**
 * Themed input component
 *
 * Uses CSS variables from BrandingProvider:
 * - --brand-surface (background)
 * - --brand-border (border)
 * - --brand-text (text color)
 * - --brand-primary (focus border)
 */
export const ThemedInput = forwardRef<HTMLInputElement, ThemedInputProps>(
  (
    {
      label,
      helperText,
      error = false,
      showRequired = false,
      className = '',
      id,
      ...props
    },
    ref
  ) => {
    const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`;

    const inputStyles = {
      width: '100%',
      padding: '0.5rem 0.75rem',
      fontSize: '1rem',
      lineHeight: '1.5',
      borderRadius: '0.375rem',
      border: error
        ? '1px solid #EF4444'
        : '1px solid var(--brand-border, #E2E8F0)',
      backgroundColor: 'var(--brand-surface, #FFFFFF)',
      color: 'var(--brand-text, #0F172A)',
      transition: 'border-color 0.2s, box-shadow 0.2s',
    };

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      if (!error) {
        e.currentTarget.style.borderColor = 'var(--brand-primary, #3B82F6)';
        e.currentTarget.style.boxShadow = '0 0 0 3px var(--brand-primary-lighter, rgba(59, 130, 246, 0.1))';
      }
      props.onFocus?.(e);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      e.currentTarget.style.borderColor = error
        ? '#EF4444'
        : 'var(--brand-border, #E2E8F0)';
      e.currentTarget.style.boxShadow = 'none';
      props.onBlur?.(e);
    };

    return (
      <div className={`themed-input-wrapper ${className}`}>
        {label && (
          <label
            htmlFor={inputId}
            className="block mb-1.5 text-sm font-medium"
            style={{
              color: 'var(--brand-text, #0F172A)',
            }}
          >
            {label}
            {showRequired && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className="themed-input"
          style={inputStyles}
          onFocus={handleFocus}
          onBlur={handleBlur}
          {...props}
        />
        {helperText && (
          <p
            className="mt-1.5 text-sm"
            style={{
              color: error ? '#EF4444' : 'var(--brand-text-muted, #64748B)',
            }}
          >
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

ThemedInput.displayName = 'ThemedInput';

/**
 * Themed textarea component
 */
export const ThemedTextarea = forwardRef<HTMLTextAreaElement, ThemedTextareaProps>(
  (
    {
      label,
      helperText,
      error = false,
      showRequired = false,
      className = '',
      id,
      rows = 3,
      ...props
    },
    ref
  ) => {
    const textareaId = id || `textarea-${Math.random().toString(36).substr(2, 9)}`;

    const textareaStyles = {
      width: '100%',
      padding: '0.5rem 0.75rem',
      fontSize: '1rem',
      lineHeight: '1.5',
      borderRadius: '0.375rem',
      border: error
        ? '1px solid #EF4444'
        : '1px solid var(--brand-border, #E2E8F0)',
      backgroundColor: 'var(--brand-surface, #FFFFFF)',
      color: 'var(--brand-text, #0F172A)',
      transition: 'border-color 0.2s, box-shadow 0.2s',
      resize: 'vertical' as const,
    };

    const handleFocus = (e: React.FocusEvent<HTMLTextAreaElement>) => {
      if (!error) {
        e.currentTarget.style.borderColor = 'var(--brand-primary, #3B82F6)';
        e.currentTarget.style.boxShadow = '0 0 0 3px var(--brand-primary-lighter, rgba(59, 130, 246, 0.1))';
      }
      props.onFocus?.(e);
    };

    const handleBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
      e.currentTarget.style.borderColor = error
        ? '#EF4444'
        : 'var(--brand-border, #E2E8F0)';
      e.currentTarget.style.boxShadow = 'none';
      props.onBlur?.(e);
    };

    return (
      <div className={`themed-textarea-wrapper ${className}`}>
        {label && (
          <label
            htmlFor={textareaId}
            className="block mb-1.5 text-sm font-medium"
            style={{
              color: 'var(--brand-text, #0F172A)',
            }}
          >
            {label}
            {showRequired && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          rows={rows}
          className="themed-textarea"
          style={textareaStyles}
          onFocus={handleFocus}
          onBlur={handleBlur}
          {...props}
        />
        {helperText && (
          <p
            className="mt-1.5 text-sm"
            style={{
              color: error ? '#EF4444' : 'var(--brand-text-muted, #64748B)',
            }}
          >
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

ThemedTextarea.displayName = 'ThemedTextarea';

export default ThemedInput;
