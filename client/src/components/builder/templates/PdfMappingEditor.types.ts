export interface PdfField {
    name: string;
    type: string;
    pageIndex: number;
    rect?: { x: number; y: number; width: number; height: number };
    value?: string;
    options?: string[];
    isReadOnly?: boolean;
}

export interface WorkflowVariable {
    id: string;
    alias: string | null;
    text: string;
}

/** Minimal shape `MappingSidebar` needs from a mappable field — satisfied by
 * both `PdfField` (PDF form fields) and DOCX placeholder info. */
export interface MappableField {
    name: string;
}

/** Matches `MappingBinding['type']` (shared/types/documentMapping.ts) plus
 * `'unmapped'` for "no binding selected yet" — a UI-only state. */
export type MappingMode = 'unmapped' | 'variable' | 'constant' | 'formula' | 'datavault';

export interface PageDimension {
    width: number;
    height: number;
    view: number[];
}
