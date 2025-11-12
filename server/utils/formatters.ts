/**
 * Template Formatters
 * Helper functions for formatting values in DOCX templates
 */

/**
 * Convert string to uppercase
 */
export function upper(s: string | null | undefined): string {
  return s?.toUpperCase?.() ?? '';
}

/**
 * Convert string to lowercase
 */
export function lower(s: string | null | undefined): string {
  return s?.toLowerCase?.() ?? '';
}

/**
 * Format number as currency
 * @param n - Number to format
 * @param c - Currency code (default: USD)
 */
export function currency(n: number | null | undefined, c: string = 'USD'): string {
  if (n === null || n === undefined || isNaN(n)) {
    return '$0.00';
  }

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: c,
    }).format(n);
  } catch (error) {
    // Fallback for invalid currency codes
    return `${c} ${n.toFixed(2)}`;
  }
}

/**
 * Format ISO date string
 * @param iso - ISO date string
 * @param format - Format type ('short', 'long', 'iso') - default: 'short'
 */
export function date(
  iso: string | Date | null | undefined,
  format: 'short' | 'long' | 'iso' = 'short'
): string {
  if (!iso) {
    return '';
  }

  try {
    const d = typeof iso === 'string' ? new Date(iso) : iso;

    if (isNaN(d.getTime())) {
      return '';
    }

    switch (format) {
      case 'long':
        return d.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
      case 'iso':
        return d.toISOString().split('T')[0];
      case 'short':
      default:
        return d.toLocaleDateString('en-US', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        });
    }
  } catch (error) {
    return '';
  }
}

/**
 * Convert boolean to Yes/No
 */
export function yesno(b: boolean | null | undefined): string {
  return b ? 'Yes' : 'No';
}

/**
 * Capitalize first letter of each word
 */
export function titleCase(s: string | null | undefined): string {
  if (!s) return '';

  return s
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Format number with thousand separators
 */
export function number(n: number | null | undefined, decimals: number = 0): string {
  if (n === null || n === undefined || isNaN(n)) {
    return '0';
  }

  return n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format percentage
 */
export function percent(n: number | null | undefined, decimals: number = 0): string {
  if (n === null || n === undefined || isNaN(n)) {
    return '0%';
  }

  return `${n.toFixed(decimals)}%`;
}

/**
 * Export all formatters as a single object for use in templates
 */
export const formatters = {
  upper,
  lower,
  currency,
  date,
  yesno,
  titleCase,
  number,
  percent,
};
