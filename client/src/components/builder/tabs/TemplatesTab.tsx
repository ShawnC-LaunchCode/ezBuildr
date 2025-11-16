/**
 * TemplatesTab - Manage document templates (DOCX/PDF)
 * PR4: Full UI implementation with stubs
 */

import { useState } from "react";
import { Upload, FileText, Trash2, RefreshCw, TestTube } from "lucide-react";
import { BuilderLayout, BuilderLayoutHeader, BuilderLayoutContent } from "../layout/BuilderLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
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

interface Template {
  id: string;
  name: string;
  key: string;
  type: "docx" | "pdf";
  lastUpdated: string;
  fileSize?: number;
}

interface TemplatesTabProps {
  workflowId: string;
}

export function TemplatesTab({ workflowId }: TemplatesTabProps) {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [templateKey, setTemplateKey] = useState("");

  // Stub: Fetch templates on mount
  // TODO: Replace with actual API call
  const fetchTemplates = async () => {
    try {
      // Stub implementation
      console.log("Fetching templates for workflow:", workflowId);
      // const response = await fetch(`/api/workflows/${workflowId}/templates`);
      // const data = await response.json();
      // setTemplates(data);

      // Mock data for development
      setTemplates([
        {
          id: "1",
          name: "Contract Template",
          key: "contract_v1",
          type: "docx",
          lastUpdated: new Date().toISOString(),
          fileSize: 45000,
        },
        {
          id: "2",
          name: "Invoice Template",
          key: "invoice",
          type: "pdf",
          lastUpdated: new Date(Date.now() - 86400000).toISOString(),
          fileSize: 32000,
        },
      ]);
    } catch (error) {
      console.error("Error fetching templates:", error);
      toast({
        title: "Error",
        description: "Failed to fetch templates",
        variant: "destructive",
      });
    }
  };

  // Stub: Upload template
  const handleUpload = async () => {
    if (!selectedFile || !templateKey) {
      toast({
        title: "Validation Error",
        description: "Please select a file and provide a template key",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);

    try {
      // Stub implementation
      console.log("Uploading template:", { file: selectedFile, key: templateKey });

      // TODO: Implement actual upload
      // const formData = new FormData();
      // formData.append('file', selectedFile);
      // formData.append('key', templateKey);
      // const response = await fetch(`/api/workflows/${workflowId}/templates`, {
      //   method: 'POST',
      //   body: formData,
      // });

      toast({
        title: "Success",
        description: `Template "${selectedFile.name}" uploaded successfully`,
      });

      setUploadDialogOpen(false);
      setSelectedFile(null);
      setTemplateKey("");
      fetchTemplates();
    } catch (error) {
      console.error("Error uploading template:", error);
      toast({
        title: "Error",
        description: "Failed to upload template",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  // Stub: Delete template
  const handleDelete = async (templateId: string, templateName: string) => {
    try {
      // Stub implementation
      console.log("Deleting template:", templateId);

      // TODO: Implement actual delete
      // await fetch(`/api/workflows/${workflowId}/templates/${templateId}`, {
      //   method: 'DELETE',
      // });

      toast({
        title: "Success",
        description: `Template "${templateName}" deleted`,
      });

      setTemplates(templates.filter(t => t.id !== templateId));
    } catch (error) {
      console.error("Error deleting template:", error);
      toast({
        title: "Error",
        description: "Failed to delete template",
        variant: "destructive",
      });
    }
  };

  // Stub: Replace template
  const handleReplace = async (templateId: string) => {
    console.log("Replace template:", templateId);
    toast({
      title: "Coming Soon",
      description: "Template replacement will be implemented soon",
    });
  };

  // Stub: Test template
  const handleTest = async (templateId: string) => {
    console.log("Test template:", templateId);
    toast({
      title: "Coming Soon",
      description: "Template testing will be implemented soon",
    });
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "Unknown size";
    const kb = bytes / 1024;
    return `${kb.toFixed(1)} KB`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + " at " + date.toLocaleTimeString();
  };

  // Load templates on mount
  useState(() => {
    fetchTemplates();
  });

  return (
    <BuilderLayout>
      <BuilderLayoutHeader>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Document Templates</h2>
            <p className="text-sm text-muted-foreground">
              Upload and manage document templates for this workflow
            </p>
          </div>

          <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Upload className="w-4 h-4 mr-2" />
                Upload Template
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Upload Document Template</DialogTitle>
                <DialogDescription>
                  Upload a DOCX or PDF template. Supported formats: .docx, .pdf
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="file">Template File</Label>
                  <Input
                    id="file"
                    type="file"
                    accept=".docx,.pdf"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="key">Template Key</Label>
                  <Input
                    id="key"
                    placeholder="e.g., contract_v1, invoice"
                    value={templateKey}
                    onChange={(e) => setTemplateKey(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Unique identifier for referencing this template
                  </p>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setUploadDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleUpload} disabled={isUploading}>
                  {isUploading ? "Uploading..." : "Upload"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </BuilderLayoutHeader>

      <BuilderLayoutContent>
        {templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <FileText className="w-16 h-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No templates yet</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-sm">
              Upload your first document template to start generating documents from workflow data
            </p>
            <Button onClick={() => setUploadDialogOpen(true)}>
              <Upload className="w-4 h-4 mr-2" />
              Upload Template
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((template) => (
              <Card key={template.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-base">{template.name}</CardTitle>
                      <CardDescription className="mt-1">
                        <code className="text-xs bg-muted px-1 py-0.5 rounded">
                          {template.key}
                        </code>
                      </CardDescription>
                    </div>
                    <Badge variant={template.type === "docx" ? "default" : "secondary"}>
                      {template.type.toUpperCase()}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <div>Last updated: {formatDate(template.lastUpdated)}</div>
                    <div>Size: {formatFileSize(template.fileSize)}</div>
                  </div>
                </CardContent>

                <CardFooter className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => handleReplace(template.id)}
                  >
                    <RefreshCw className="w-3 h-3 mr-1" />
                    Replace
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleTest(template.id)}
                  >
                    <TestTube className="w-3 h-3 mr-1" />
                    Test
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleDelete(template.id, template.name)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </BuilderLayoutContent>
    </BuilderLayout>
  );
}
