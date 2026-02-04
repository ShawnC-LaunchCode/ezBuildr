import { AlertCircle, Loader2 } from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

import { PageDimension, PdfField } from './PdfMappingEditor.types';

// Set worker source for react-pdf
// Use local worker to avoid CSP issues with CDN
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
).toString();

interface PdfCanvasProps {
    templateId: string;
    loading: boolean;
    error: string | null;
    numPages: number;
    scale: number;
    pageDimensions: Record<number, PageDimension>;
    fields: PdfField[];
    mapping: Record<string, string>;
    selectedField: string | null;
    onDocumentLoadSuccess: (data: { numPages: number }) => void;
    onPageLoadSuccess: (page: any, index: number) => void;
    setSelectedField: (field: string | null) => void;
}

export function PdfCanvas({
    templateId,
    loading,
    error,
    numPages,
    scale,
    pageDimensions,
    fields,
    mapping,
    selectedField,
    onDocumentLoadSuccess,
    onPageLoadSuccess,
    setSelectedField
}: PdfCanvasProps) {
    const getFieldsForPage = (pageIndex: number) => {
        return fields.filter(f => f.pageIndex === pageIndex);
    };

    if (error) {
        return (
            <Alert variant="destructive" className="h-fit m-4">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
            </Alert>
        );
    }

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-full">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                <span className="mt-2 text-sm text-muted-foreground">Loading PDF...</span>
            </div>
        );
    }

    return (
        <Document
            file={`/api/templates/${templateId}/download`}
            onLoadSuccess={onDocumentLoadSuccess}
            className="flex flex-col gap-4"
            loading={<Loader2 className="w-8 h-8 animate-spin" />}
        >
            {Array.from(new Array(numPages), (_, index) => (
                <div key={`page_container_${index}`} className="relative shadow-md">
                    <Page
                        key={`page_${index}`}
                        pageNumber={index + 1}
                        scale={scale}
                        onLoadSuccess={(page) => onPageLoadSuccess(page, index)}
                        renderTextLayer={false}
                        renderAnnotationLayer={false}
                    />
                    {/* Overlays */}
                    {pageDimensions[index] && getFieldsForPage(index).map(field => {
                        if (!field.rect) {
                            console.warn(`Field ${field.name} has no rect`);
                            return null;
                        }
                        // Coordinate Mapping
                        const view = pageDimensions[index].view;
                        const xMin = view[0];
                        const viewMaxY = view[3];
                        // Calculate dimensions in PDF space
                        const fieldX = field.rect.x;
                        const fieldY = field.rect.y;
                        const fieldW = field.rect.width;
                        const fieldH = field.rect.height;
                        // Canvas X = (Field X - View X Min) * Scale
                        const x = (fieldX - xMin) * scale;
                        const w = fieldW * scale;
                        const h = fieldH * scale;
                        // Canvas Y: Y_from_top = View_Max_Y - (Field_Y_Bottom + Field_H)
                        const y = (viewMaxY - (fieldY + fieldH)) * scale;
                        const isMapped = !!mapping[field.name];
                        const isSelected = selectedField === field.name;
                        // Define colors based on state
                        let borderColor = '#3b82f6'; // Blue (Unmapped)
                        let bgColor = 'rgba(59, 130, 246, 0.2)';
                        if (isSelected) {
                            borderColor = '#9333ea'; // Purple (Selected)
                            bgColor = 'rgba(147, 51, 234, 0.3)';
                        } else if (isMapped) {
                            borderColor = '#eab308'; // Yellow (Mapped)
                            bgColor = 'rgba(234, 179, 8, 0.2)';
                        }
                        return (
                            <div
                                key={field.name}
                                title={field.name}
                                onClick={() => { setSelectedField(field.name); }}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        setSelectedField(field.name);
                                    }
                                }}
                                style={{
                                    position: 'absolute',
                                    left: x,
                                    top: y,
                                    width: w,
                                    height: h,
                                    border: `2px solid ${borderColor}`,
                                    backgroundColor: bgColor,
                                    cursor: 'pointer',
                                    zIndex: 10
                                }}
                            />
                        );
                    })}
                </div>
            ))}
        </Document>
    );
}
