/** Shared shapes for the code editor, importable without pulling in Monaco. */

/**
 * Which grammar the editor highlights. Structurally the `ScriptLanguage` values
 * the sandbox accepts, restated here so this module stays importable without
 * dragging shared/ (and Monaco) into a client bundle that only wants the types.
 */
export type CodeEditorLanguage = "javascript" | "python";

export interface CodeEditorMarker {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
    message: string;
    /** Monaco's MarkerSeverity: 8 = Error, 4 = Warning. */
    severity: number;
}

export const MARKER_SEVERITY_ERROR = 8;

export interface CodeEditorHandle {
    insertAtCursor: (text: string) => void;
    focus: () => void;
    /** Whether the caret is currently inside this editor. */
    isFocused: () => boolean;
}
