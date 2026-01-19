import axios from 'axios';
import DOMPurify from 'dompurify';
import { Loader2, FileEdit } from 'lucide-react';
import mammoth from 'mammoth';
import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { AIAssistPanel } from './AIAssistPanel';
interface DocumentTemplateEditorProps {
    templateId: string;
    isOpen: boolean;
    onClose: () => void;
    workflowVariables: any[];
}
export function DocumentTemplateEditor({ templateId, isOpen, onClose, workflowVariables }: DocumentTemplateEditorProps) {
    const [htmlContent, setHtmlContent] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);
    const [fileBuffer, setFileBuffer] = useState<ArrayBuffer | undefined>(undefined);
    const [fileName, setFileName] = useState<string>('');
    // Fetch Template File
    // Note: Assuming an API exists to get the raw file or we reuse the upload buffer if new
    // For this mock, we'll try to fetch from a hypothetical download endpoint
    useEffect(() => {
        if (isOpen && templateId) {
            fetchTemplate();
        }
    }, [isOpen, templateId]);
    const fetchTemplate = async () => {
        setIsLoading(true);
        try {
            // Hypothetical endpoint to get file
            const response = await fetch(`/api/templates/${templateId}/download`);
            if (response.ok) {
                const buffer = await response.arrayBuffer();
                setFileBuffer(buffer);
                // Extract filename from header or default
                const disposition = response.headers.get('content-disposition');
                const name = disposition ? disposition.split('filename=')[1] : 'template.docx';
                setFileName(name.replace(/"/g, ''));
                if (name.endsWith('.docx')) {
                    const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
                    setHtmlContent(result.value);
                } else if (name.endsWith('.pdf')) {
                    // Create a Blob URL for PDF preview
                    const blob = new Blob([buffer], { type: 'application/pdf' });
                    const url = URL.createObjectURL(blob);
                    setHtmlContent(url); // We'll use this as the src
                } else {
                    setHtmlContent("<p>Preview not available for this file type.</p>");
                }
            }
        } catch (e) {
            console.error("Failed to load template", e);
        } finally {
            setIsLoading(false);
        }
    };
    const handleApplyMapping = (mapping: any) => {
        console.log("Applying mapping", mapping);
        // TODO: Persist mapping to backend
    };
    // SECURITY FIX: Sanitize HTML content to prevent XSS attacks
    const sanitizedHtml = useMemo(() => {
        if (!htmlContent || fileName.endsWith('.pdf')) {
            return htmlContent;
        }
        return DOMPurify.sanitize(htmlContent, {
            ALLOWED_TAGS: [
                'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                'ul', 'ol', 'li', 'strong', 'em', 'u', 'br',
                'table', 'thead', 'tbody', 'tr', 'td', 'th',
                'div', 'span', 'a', 'img', 'blockquote', 'pre', 'code'
            ],
            ALLOWED_ATTR: ['class', 'style', 'href', 'src', 'alt', 'title'],
            FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'link', 'form', 'input'],
            FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur']
        });
    }, [htmlContent, fileName]);
    return (
        <Dialog open={isOpen} onOpenChange={(val) => !val && onClose()}>
            <DialogContent className="max-w-[90vw] h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
                <div className="flex flex-1 overflow-hidden">
                    {/* Main Preview Area */}
                    <div className="flex-1 flex flex-col min-w-0 bg-gray-100 dark:bg-gray-950/50">
                        <div className="border-b bg-white dark:bg-zinc-900 p-4 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <FileEdit className="w-5 h-5 text-blue-600" />
                                <h2 className="font-semibold">{fileName || 'Document Editor'}</h2>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => { void onClose(); }}>Close</Button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-8 flex justify-center">
                            {isLoading ? (
                                <Loader2 className="animate-spin w-8 h-8 text-muted-foreground mt-10" />
                            ) : (
                                fileName.endsWith('.pdf') ? (
                                    <iframe
                                        src={htmlContent}
                                        className="w-full h-full min-h-[800px] shadow-lg"
                                        title="PDF Preview"
                                    />
                                ) : (
                                    <div
                                        className="bg-white shadow-lg p-10 min-h-[800px] w-[800px] prose dark:prose-invert max-w-none"
                                        dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
                                    />
                                )
                            )}
                        </div>
                    </div>
                    {/* AI Assist Sidebar */}
                    <AIAssistPanel
                        templateId={templateId}
                        fileBuffer={fileBuffer}
                        fileName={fileName}
                        onApplyMapping={handleApplyMapping}
                        workflowVariables={workflowVariables}
                    />
                </div>
            </DialogContent>
        </Dialog>
    );
}