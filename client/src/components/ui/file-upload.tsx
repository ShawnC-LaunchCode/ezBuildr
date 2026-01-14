import { Upload, X, File, Image, FileText, Download } from "lucide-react";
import React, { useState, useRef, useCallback } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { formatFileSize } from "@/lib/formatting";

import type { FileUploadConfig } from "@shared/schema";
// Define FileMetadata locally if not exported from schema
interface FileMetadata {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
}

interface FileUploadProps {
  config?: FileUploadConfig;
  onFilesUploaded?: (files: FileMetadata[]) => void;
  onFileRemoved?: (fileId: string) => void;
  initialFiles?: FileMetadata[];
  disabled?: boolean;
  answerId?: string;
}

export function FileUpload({
  config,
  onFilesUploaded,
  onFileRemoved,
  initialFiles = [],
  disabled = false,
  answerId
}: FileUploadProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedFiles, setUploadedFiles] = useState<FileMetadata[]>(initialFiles);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const validateFile = (file: File): string | null => {
    if (!config) {return null;}

    // Check file size
    if (config.maxFileSize && file.size > config.maxFileSize) {
      return `File "${file.name}" exceeds maximum size of ${formatFileSize(config.maxFileSize)}`;
    }

    // Check file type
    if (config.acceptedTypes && config.acceptedTypes.length > 0) {
      const isAccepted = config.acceptedTypes.some(type => {
        if (type.includes('*')) {
          const [category] = type.split('/');
          return file.type.startsWith(`${category  }/`);
        }

        if (type.startsWith('.')) {
          return file.name.toLowerCase().endsWith(type.toLowerCase());
        }

        return file.type === type;
      });

      if (!isAccepted) {
        return `File type "${file.type}" is not allowed`;
      }
    }

    // Check max files
    if (config.maxFiles && uploadedFiles.length >= config.maxFiles) {
      return `Maximum ${config.maxFiles} files allowed`;
    }

    return null;
  };

  const uploadFiles = useCallback(async (files: File[]) => {
    if (!answerId) {
      toast({
        title: "Error",
        description: "Answer ID is required for file upload",
        variant: "destructive",
      });
      return;
    }

    const validFiles: File[] = [];
    const errors: string[] = [];

    // Validate all files first
    for (const file of files) {
      const error = validateFile(file);
      if (error) {
        errors.push(error);
      } else {
        validFiles.push(file);
      }
    }

    if (errors.length > 0) {
      toast({
        title: "Upload Errors",
        description: errors.join("; "),
        variant: "destructive",
      });
    }

    if (validFiles.length === 0) {return;}

    setUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      validFiles.forEach(file => formData.append('files', file));
      formData.append('answerId', answerId);

      if (config) {
        formData.append('questionConfig', JSON.stringify(config));
      }

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const result = await response.json();

      if (result.success && result.files) {
        const newFiles = [...uploadedFiles, ...result.files];
        setUploadedFiles(newFiles);
        onFilesUploaded?.(result.files);

        toast({
          title: "Upload Successful",
          description: `${result.files.length} file(s) uploaded successfully`,
        });
      }

      if (result.errors && result.errors.length > 0) {
        toast({
          title: "Upload Warnings",
          description: result.errors.join("; "),
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Upload Failed",
        description: "Failed to upload files. Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }, [answerId, config, uploadedFiles, onFilesUploaded, toast]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      uploadFiles(Array.from(files));
    }
    // Reset input value to allow selecting the same file again
    event.target.value = '';
  };

  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setDragOver(false);

    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) {
      uploadFiles(files);
    }
  }, [uploadFiles]);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setDragOver(false);
  }, []);

  const handleFileRemove = async (fileId: string) => {
    try {
      const response = await fetch(`/api/files/${fileId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setUploadedFiles(prev => prev.filter(f => f.id !== fileId));
        onFileRemoved?.(fileId);

        toast({
          title: "File Removed",
          description: "File has been removed successfully",
        });
      } else {
        throw new Error('Failed to remove file');
      }
    } catch (error) {
      console.error('Remove error:', error);
      toast({
        title: "Remove Failed",
        description: "Failed to remove file. Please try again.",
        variant: "destructive",
      });
    }
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) {return <Image className="h-4 w-4" />;}
    if (mimeType.includes('pdf')) {return <FileText className="h-4 w-4" />;}
    return <File className="h-4 w-4" />;
  };

  const maxFiles = config?.maxFiles || 5;
  const canUploadMore = uploadedFiles.length < maxFiles && !disabled;

  return (
    <div className="space-y-4" data-testid="file-upload-component">
      {/* Upload Area */}
      {canUploadMore && (
        <Card
          className={`border-2 border-dashed transition-colors cursor-pointer ${dragOver
              ? 'border-primary bg-primary/10'
              : 'border-muted-foreground/25 hover:border-primary/50'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => !disabled && fileInputRef.current?.click()}
          data-testid="file-upload-dropzone"
        >
          <CardContent className="flex flex-col items-center justify-center py-8 px-4">
            <Upload className="h-8 w-8 text-muted-foreground mb-4" />
            <div className="text-center">
              <p className="text-sm font-medium text-foreground mb-1">
                {dragOver ? 'Drop files here' : 'Click to upload or drag and drop'}
              </p>
              <p className="text-xs text-muted-foreground">
                {config?.acceptedTypes?.length
                  ? `Accepted: ${config.acceptedTypes.join(', ')}`
                  : 'All file types accepted'
                }
              </p>
              {config?.maxFileSize && (
                <p className="text-xs text-muted-foreground">
                  Max size: {formatFileSize(config.maxFileSize)}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple={config?.allowMultiple !== false}
        accept={config?.acceptedTypes?.join(',')}
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled}
        data-testid="file-upload-input"
      />

      {/* Upload Progress */}
      {uploading && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground">Uploading...</span>
            <span className="text-sm text-muted-foreground">{uploadProgress}%</span>
          </div>
          <Progress value={uploadProgress} className="w-full" />
        </div>
      )}

      {/* Uploaded Files List */}
      {uploadedFiles.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-foreground">
              Uploaded Files ({uploadedFiles.length}/{maxFiles})
            </h4>
          </div>

          <div className="space-y-2">
            {uploadedFiles.map((file) => (
              <div
                key={file.id}
                className="flex items-center justify-between p-3 bg-muted rounded-lg"
                data-testid={`uploaded-file-${file.id}`}
              >
                <div className="flex items-center space-x-3 flex-1 min-w-0">
                  {getFileIcon(file.mimeType)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {file.originalName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(file.size)} • {file.mimeType}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window.open(`/api/files/${file.id}/download`, '_blank')}
                    data-testid={`button-download-${file.id}`}
                  >
                    <Download className="h-4 w-4" />
                  </Button>

                  {!disabled && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleFileRemove(file.id)}
                      className="text-destructive hover:text-destructive"
                      data-testid={`button-remove-${file.id}`}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* File Configuration Display */}
      {config && (
        <div className="flex flex-wrap gap-2">
          {config.required && <Badge variant="destructive">Required</Badge>}
          {config.allowMultiple && <Badge variant="outline">Multiple files</Badge>}
          <Badge variant="outline">{maxFiles} max files</Badge>
          {config.maxFileSize && (
            <Badge variant="outline">Max: {formatFileSize(config.maxFileSize)}</Badge>
          )}
        </div>
      )}
    </div>
  );
}