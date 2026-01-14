/**
 * Utility functions for formatting and extracting answer values
 *
 * Handles the conversion of jsonb answer values to readable strings,
 * accounting for various data structures used by different question types.
 */

/**
 * Safely extract text value from an answer
 * Handles the case where text values are stored as { text: "value" } objects
 *
 * @param value - The raw answer value (can be string, number, boolean, object, array, etc.)
 * @returns The extracted text value, or the original value if it's already a primitive
 */
export function extractTextValue(value: any): string {
  // Handle null/undefined
  if (value === null || value === undefined) {
    return '';
  }

  // If it's an object with a 'text' property, extract it
  if (typeof value === 'object' && !Array.isArray(value) && 'text' in value) {
    return String(value.text || '');
  }

  // For arrays, join with semicolons
  if (Array.isArray(value)) {
    return value.map(v => extractTextValue(v)).join('; ');
  }

  // For other objects (excluding Date), return empty string or convert to JSON
  if (typeof value === 'object' && !(value instanceof Date)) {
    // Check if it's a file upload object
    if ('files' in value) {
      return `${value.files?.length || 0} file(s)`;
    }
    // For other objects, return empty string to avoid [object Object]
    return '';
  }

  // For primitives (string, number, boolean, Date), convert to string
  return String(value);
}

/**
 * Format an answer value based on the question type
 *
 * @param value - The raw answer value
 * @param questionType - The type of question (short_text, multiple_choice, etc.)
 * @returns Formatted string representation of the answer
 */
export function formatAnswerValue(value: any, questionType: string): string {
  if (!value) {return '';}

  switch (questionType) {
    case 'short_text':
    case 'long_text':
      // Extract text from objects like { text: "answer" }
      return extractTextValue(value);

    case 'multiple_choice':
      // Handle array of selections
      if (Array.isArray(value)) {
        return value.map(v => extractTextValue(v)).join('; ');
      }
      return extractTextValue(value);

    case 'radio':
      // Single selection
      return extractTextValue(value);

    case 'yes_no':
      // Boolean or string representation
      if (typeof value === 'boolean') {
        return value ? 'Yes' : 'No';
      }
      if (typeof value === 'object' && 'text' in value) {
        return extractTextValue(value);
      }
      return value === 'Yes' || value === true || value === 'yes' ? 'Yes' : 'No';

    case 'date_time':
      // Date formatting
      if (typeof value === 'object' && 'text' in value) {
        return extractTextValue(value);
      }
      if (value instanceof Date) {
        return value.toISOString();
      }
      return String(value);

    case 'file_upload':
      // File upload metadata
      if (typeof value === 'object' && 'files' in value) {
        const fileCount = value.files?.length || 0;
        return `${fileCount} file(s)`;
      }
      return '';

    default:
      // Fallback for unknown types
      return extractTextValue(value);
  }
}
