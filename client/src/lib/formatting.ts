/**
 * Formatting utilities for common data display patterns
 */

/**
 * Format bytes to human-readable file size
 * @example
 * formatFileSize(1024) => "1 KB"
 * formatFileSize(1536000) => "1.5 MB"
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) {return '0 Bytes';}
  if (bytes < 0) {return 'Invalid size';}

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  if (i >= sizes.length) {
    return `${(bytes / Math.pow(k, sizes.length - 1)).toFixed(2)  } ${  sizes[sizes.length - 1]}`;
  }

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))  } ${  sizes[i]}`;
}

/**
 * Format percentage with specified decimal places
 * @example
 * formatPercentage(0.856) => "85.6%"
 * formatPercentage(0.856, 0) => "86%"
 */
export function formatPercentage(value: number, decimals: number = 1): string {
  if (isNaN(value) || value < 0 || value > 1) {
    return 'N/A';
  }
  return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * Format large numbers with K/M/B suffix
 * @example
 * formatLargeNumber(1500) => "1.5K"
 * formatLargeNumber(1500000) => "1.5M"
 */
export function formatLargeNumber(num: number): string {
  if (num >= 1000000000) {
    return `${(num / 1000000000).toFixed(1)}B`;
  } else if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  } else if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toString();
}

/**
 * Format date to relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const seconds = Math.floor((now.getTime() - d.getTime()) / 1000);

  if (seconds < 60) {return 'just now';}
  if (seconds < 3600) {return `${Math.floor(seconds / 60)}m ago`;}
  if (seconds < 86400) {return `${Math.floor(seconds / 3600)}h ago`;}
  if (seconds < 604800) {return `${Math.floor(seconds / 86400)}d ago`;}
  return d.toLocaleDateString();
}
