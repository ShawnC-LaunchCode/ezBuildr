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

export type MappingMode = 'variable' | 'excel' | 'constant' | 'template';

export interface PageDimension {
    width: number;
    height: number;
    view: number[];
}
