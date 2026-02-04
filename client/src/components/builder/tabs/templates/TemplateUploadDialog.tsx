
import { useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface TemplateUploadDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onUpload: (file: File, name: string) => Promise<void>;
    isUploading: boolean;
    trigger?: React.ReactNode;
}

export function TemplateUploadDialog({
    open,
    onOpenChange,
    onUpload,
    isUploading,
    trigger
}: TemplateUploadDialogProps) {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [templateKey, setTemplateKey] = useState("");

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setSelectedFile(file);
            setTemplateKey(file.name.replace(/\.[^/.]+$/, ''));
        }
    };

    const handleUploadClick = async () => {
        if (selectedFile && templateKey) {
            await onUpload(selectedFile, templateKey);
            // Reset state after successful upload (assuming parent handles closing/error logic appropriately, 
            // or we reset here if we want to be clean for next time)
            setSelectedFile(null);
            setTemplateKey("");
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Upload Document Template</DialogTitle>
                    <DialogDescription>Supported formats: .docx, .pdf</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="file">Template File</Label>
                        <Input
                            id="file"
                            type="file"
                            accept=".docx,.pdf"
                            onChange={handleFileChange}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="key">Display Name</Label>
                        <Input
                            id="key"
                            value={templateKey}
                            onChange={(e) => setTemplateKey(e.target.value)}
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button
                        onClick={() => { void handleUploadClick(); }}
                        disabled={isUploading || !selectedFile || !templateKey}
                    >
                        {isUploading ? "Uploading..." : "Upload"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
