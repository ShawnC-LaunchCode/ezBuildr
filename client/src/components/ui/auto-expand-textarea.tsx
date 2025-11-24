/**
 * AutoExpandTextarea - Single-line input that expands as content grows
 *
 * Starts as a single line and automatically grows to accommodate more content.
 * Shrinks back when content is removed.
 */

import * as React from "react";
import { cn } from "@/lib/utils";

interface AutoExpandTextareaProps
  extends Omit<React.ComponentProps<"textarea">, "rows"> {
  /** Minimum number of rows (default: 1) */
  minRows?: number;
  /** Maximum number of rows before scrolling (default: 5) */
  maxRows?: number;
}

const AutoExpandTextarea = React.forwardRef<
  HTMLTextAreaElement,
  AutoExpandTextareaProps
>(({ className, minRows = 1, maxRows = 5, onChange, value, ...props }, ref) => {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const combinedRef = useCombinedRefs(ref, textareaRef);

  // Calculate line height based on font size (approximate)
  const lineHeight = 20; // Roughly matches md:text-sm
  const padding = 16; // py-2 = 8px * 2

  const minHeight = minRows * lineHeight + padding;
  const maxHeight = maxRows * lineHeight + padding;

  const adjustHeight = React.useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Reset height to allow shrinking
    textarea.style.height = `${minHeight}px`;

    // Calculate new height based on scrollHeight
    const newHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight);
    textarea.style.height = `${newHeight}px`;

    // Show scrollbar only if content exceeds maxHeight
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [minHeight, maxHeight]);

  // Adjust height on mount and value change
  React.useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    adjustHeight();
    onChange?.(e);
  };

  return (
    <textarea
      ref={combinedRef}
      value={value}
      onChange={handleChange}
      rows={minRows}
      className={cn(
        "flex w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm resize-none transition-[height] duration-100",
        className
      )}
      style={{
        minHeight: `${minHeight}px`,
        maxHeight: `${maxHeight}px`,
      }}
      {...props}
    />
  );
});

AutoExpandTextarea.displayName = "AutoExpandTextarea";

// Helper hook to combine refs
function useCombinedRefs<T>(
  ...refs: (React.ForwardedRef<T> | React.RefObject<T> | null)[]
): React.RefCallback<T> {
  return React.useCallback((element: T) => {
    refs.forEach((ref) => {
      if (!ref) return;
      if (typeof ref === "function") {
        ref(element);
      } else {
        (ref as React.MutableRefObject<T | null>).current = element;
      }
    });
  }, refs);
}

export { AutoExpandTextarea };
