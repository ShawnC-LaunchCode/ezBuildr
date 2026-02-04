
import { useState, DragEvent } from 'react';

import { useToast } from "@/hooks/use-toast";
import { getAccessToken } from "@/lib/vault-api";

import { UploadedFile, ExtractTextResponse } from "./types";

interface UseFileUploadReturn {
    isDragging: boolean;
    uploading: boolean;
    contextFiles: UploadedFile[];
    setContextFiles: React.Dispatch<React.SetStateAction<UploadedFile[]>>;
    handleDragOver: (e: DragEvent) => void;
    handleDragLeave: (e: DragEvent) => void;
    handleDrop: (e: DragEvent) => Promise<void>;
}

export function useFileUpload(): UseFileUploadReturn {
    const [isDragging, setIsDragging] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [contextFiles, setContextFiles] = useState<UploadedFile[]>([]);
    const { toast } = useToast();

    const handleDragOver = (e: DragEvent): void => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: DragEvent): void => {
        e.preventDefault();
        // Prevent flickering: only disable if leaving the main container, not entering a child
        if (e.currentTarget.contains(e.relatedTarget as Node)) { return; }
        setIsDragging(false);
    };

    const handleDrop = async (e: DragEvent): Promise<void> => {
        e.preventDefault();
        setIsDragging(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length === 0) { return; }

        setUploading(true);
        const newContextFiles: UploadedFile[] = [];

        try {
            for (const file of files) {
                // Check type (MIME or Extension)
                const allowedTypes = [
                    'application/pdf',
                    'application/msword',
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    'text/plain',
                    'text/markdown'
                ];
                const allowedExtensions = ['.pdf', '.doc', '.docx', '.txt', '.md'];
                const isTypeValid = allowedTypes.includes(file.type);
                const isExtValid = allowedExtensions.some(ext => file.name.toLowerCase().endsWith(ext));

                if (!isTypeValid && !isExtValid) {
                    toast({ title: "Skipped File", description: `${file.name} is not a supported document type (PDF/Word/Txt).` });
                    continue;
                }

                const formData = new FormData();
                formData.append('file', file);

                try {
                    // Use fetch directly to handle FormData correctly (apiRequest forces JSON)
                    const token = getAccessToken();
                    const headers: Record<string, string> = {};
                    if (token) { headers['Authorization'] = `Bearer ${token}`; }

                    const res = await fetch('/api/ai/doc/extract-text', {
                        method: 'POST',
                        body: formData,
                        headers
                    });

                    if (!res.ok) {
                        const errData = await res.json().catch(() => ({})) as ExtractTextResponse;
                        throw new Error(errData.message ?? res.statusText);
                    }

                    const data = await res.json() as ExtractTextResponse;
                    if (data.text) {
                        newContextFiles.push({
                            name: file.name,
                            content: data.text
                        });
                    }
                } catch (err) {
                    console.error(err);
                    toast({ title: "Upload Failed", variant: "destructive", description: `Could not process ${file.name}` });
                }
            }
            setContextFiles(prev => [...prev, ...newContextFiles]);
        } finally {
            setUploading(false);
        }
    };

    return {
        isDragging,
        uploading,
        contextFiles,
        setContextFiles,
        handleDragOver,
        handleDragLeave,
        handleDrop
    };
}
