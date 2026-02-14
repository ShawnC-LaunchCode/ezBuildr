/**
 * Stage 17: Themed Button Component
 *
 * Branded button for intake portals using tenant branding CSS variables
 */

import { Loader2 } from 'lucide-react';
import React, { ButtonHTMLAttributes, forwardRef } from 'react';

export interface ThemedButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Button variant */
  variant?: 'primary' | 'secondary' | 'accent' | 'outline' | 'ghost';

  /** Button size */
  size?: 'sm' | 'md' | 'lg';

  /** Full width button */
  fullWidth?: boolean;

  /** Loading state */
  isLoading?: boolean;
}

/**
 * Themed button component
 *
 * Uses CSS variables from BrandingProvider:
 * - --brand-primary (primary variant)
 * - --brand-accent (accent variant)
 * - --brand-surface-hover (secondary variant)
 * - --brand-border (outline variant)
 * - --brand-text (text color)
 */
const ThemedButton = forwardRef<HTMLButtonElement, ThemedButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      fullWidth = false,
      isLoading = false,
      className = '',
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    // Size classes
    const sizeClasses = {
      sm: 'px-3 py-1.5 text-sm',
      md: 'px-4 py-2 text-base',
      lg: 'px-6 py-3 text-lg',
    };

    // Base styles
    const baseStyles = {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: '500',
      borderRadius: '0.375rem',
      transition: 'all 0.2s',
      cursor: disabled ?? isLoading ? 'not-allowed' : 'pointer',
      opacity: disabled ?? isLoading ? '0.6' : '1',
      width: fullWidth ? '100%' : 'auto',
    };

    // Variant styles
    const getVariantStyles = () => {
      switch (variant) {
        case 'primary':
          return {
            backgroundColor: 'var(--brand-primary, #3B82F6)',
            color: 'var(--brand-primary-contrast, #FFFFFF)',
            border: 'none',
          };

        case 'secondary':
          return {
            backgroundColor: 'var(--brand-surface-hover, #F1F5F9)',
            color: 'var(--brand-text, #0F172A)',
            border: 'none',
          };

        case 'accent':
          return {
            backgroundColor: 'var(--brand-accent, #10B981)',
            color: 'var(--brand-accent-contrast, #FFFFFF)',
            border: 'none',
          };

        case 'outline':
          return {
            backgroundColor: 'transparent',
            color: 'var(--brand-text, #0F172A)',
            border: '1px solid var(--brand-border, #E2E8F0)',
          };

        case 'ghost':
          return {
            backgroundColor: 'transparent',
            color: 'var(--brand-text, #0F172A)',
            border: 'none',
          };

        default:
          return {};
      }
    };

    const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (disabled ?? isLoading) {
        return;
      }

      const target = e.currentTarget;
      if (variant === 'primary') {
        target.style.backgroundColor = 'var(--brand-primary-dark, #2563EB)';
      } else if (variant === 'accent') {
        target.style.backgroundColor = 'var(--brand-accent-dark, #059669)';
      } else if (variant === 'secondary') {
        target.style.backgroundColor = 'var(--brand-surface-active, #E2E8F0)';
      } else if (variant === 'outline' || variant === 'ghost') {
        target.style.backgroundColor = 'var(--brand-surface-hover, #F1F5F9)';
      }
    };

    const handleMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (disabled ?? isLoading) {
        return;
      }

      const target = e.currentTarget;
      const variantStyles = getVariantStyles();
      target.style.backgroundColor = variantStyles.backgroundColor ?? '';
    };

    return (
      <button
        ref={ref}
        className={`themed-button ${sizeClasses[size]} ${className}`}
        style={{
          ...baseStyles,
          ...getVariantStyles(),
        }}
        disabled={disabled ?? isLoading}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        {...props}
      >
        {isLoading && (
          <Loader2 className="animate-spin -ml-1 mr-2 h-4 w-4" />
        )}
        {children}
      </button>
    );
  }
);

ThemedButton.displayName = 'ThemedButton';

export default ThemedButton;
