/** Shared shapes for the code editor, importable without pulling in Monaco. */

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
