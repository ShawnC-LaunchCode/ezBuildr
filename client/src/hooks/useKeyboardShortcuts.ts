import { useEffect, useCallback } from "react";

export interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  description: string;
  action: () => void;
}

interface UseKeyboardShortcutsOptions {
  shortcuts: KeyboardShortcut[];
  enabled?: boolean;
}

/**
 * Hook for managing keyboard shortcuts in the survey builder
 * Supports Ctrl/Cmd modifiers and prevents conflicts with browser shortcuts
 */
export function useKeyboardShortcuts({
  shortcuts,
  enabled = true,
}: UseKeyboardShortcutsOptions) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) {return;}

      // Don't trigger shortcuts when typing in inputs, textareas, or contenteditable
      const target = event.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        // Exception: Allow Ctrl+S even in inputs
        if (!(event.key === "s" && (event.ctrlKey || event.metaKey))) {
          return;
        }
      }

      for (const shortcut of shortcuts) {
        const ctrlPressed = event.ctrlKey || event.metaKey; // metaKey for Mac Cmd
        const shiftPressed = event.shiftKey;
        const altPressed = event.altKey;

        const keyMatches = event.key.toLowerCase() === shortcut.key.toLowerCase();
        const ctrlMatches = shortcut.ctrl ? ctrlPressed : !ctrlPressed;
        const shiftMatches = shortcut.shift ? shiftPressed : !shiftPressed;
        const altMatches = shortcut.alt ? altPressed : !altPressed;

        if (keyMatches && ctrlMatches && shiftMatches && altMatches) {
          event.preventDefault();
          event.stopPropagation();
          shortcut.action();
          break;
        }
      }
    },
    [shortcuts, enabled]
  );

  useEffect(() => {
    // MEMORY LEAK FIX: Always add/remove listener regardless of enabled flag
    // The enabled check is handled inside handleKeyDown callback
    // This prevents listeners from staying attached when enabled switches to false
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]); // Removed 'enabled' from deps since we always add/remove now
}

/**
 * Utility to get platform-specific modifier key name
 */
export function getModifierKey(): string {
  return navigator.platform.toLowerCase().includes("mac") ? "⌘" : "Ctrl";
}

/**
 * Utility to format shortcut for display
 */
export function formatShortcut(shortcut: KeyboardShortcut): string {
  const parts: string[] = [];
  const modKey = getModifierKey();

  if (shortcut.ctrl) {parts.push(modKey);}
  if (shortcut.shift) {parts.push("Shift");}
  if (shortcut.alt) {parts.push("Alt");}
  parts.push(shortcut.key.toUpperCase());

  return parts.join(" + ");
}
