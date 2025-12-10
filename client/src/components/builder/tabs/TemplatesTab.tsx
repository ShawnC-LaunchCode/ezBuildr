/**
 * TemplatesTab - Manage document templates (DOCX/PDF)
 * PR4: Full UI implementation with stubs
 */

import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import axios from "axios";
import { Upload, FileText, Trash2, RefreshCw, TestTube, AlertCircle } from "lucide-react";
import { BuilderLayout, BuilderLayoutHeader, BuilderLayoutContent } from "../layout/BuilderLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
  const [, navigate] = useLocation();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [templateKey, setTemplateKey] = useState("");
  const [workflowProjectId, setWorkflowProjectId] = useState<string | null>(null);

  // Fetch workflow to get projectId, then fetch templates
  const fetchTemplates = async () => {
    try {
      // Get workflow to get projectId
      const workflowResponse = await axios.get(`/api/workflows/${workflowId}`);
      const workflow = workflowResponse.data;
      const projectId = workflow.projectId;

      // Store projectId in state to show warning banner if null
      setWorkflowProjectId(projectId || null);

      if (!projectId) {
        console.warn("Workflow has no projectId");
        setTemplates([]);
        return;
      }

      // Fetch templates for this project
      const response = await axios.get(`/api/projects/${projectId}/templates`);
      const data = response.data;

      // Map API response to Template interface
      // API returns { items, nextCursor, hasMore } (paginated response)
      const mappedTemplates = (data.items || []).map((t: any) => ({
        id: t.id,
        name: t.name,
        key: t.id, // Use id as key for now
        type: t.type || "docx",
        lastUpdated: t.updatedAt || t.createdAt,
        fileSize: undefined, // API doesn't return file size
      }));

      setTemplates(mappedTemplates);
    } catch (error) {
      console.error("Error fetching templates:", error);
      toast({
        title: "Error",
        description: axios.isAxiosError(error)
          ? error.response?.data?.error?.message || error.response?.data?.message || error.message
          : "Failed to fetch templates",
        variant: "destructive",
      });
    }
  };

  // Upload template to project
  const handleUpload = async () => {
    if (!selectedFile) {
      toast({
        title: "Validation Error",
        description: "Please select a file",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);

    try {
      // Get workflow to get projectId
      const workflowResponse = await axios.get(`/api/workflows/${workflowId}`);
      const workflow = workflowResponse.data;
      const projectId = workflow.projectId;

      if (!projectId) {
        toast({
          title: "Cannot Upload Template",
          description: "This workflow is not associated with a project. Please create a new workflow within a project to use templates.",
          variant: "destructive",
        });
        setIsUploading(false);
        return;
      }

      // Upload template
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('name', templateKey || selectedFile.name.replace(/\.[^/.]+$/, ""));

      await axios.post(`/api/projects/${projectId}/templates`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

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
        description: axios.isAxiosError(error)
          ? error.response?.data?.error?.message || error.response?.data?.message || error.message
          : "Failed to upload template",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  // Delete template
  const handleDelete = async (templateId: string, templateName: string) => {
    try {
      await axios.delete(`/api/templates/${templateId}`);

      toast({
        title: "Success",
        description: `Template "${templateName}" deleted`,
      });

      setTemplates(templates.filter(t => t.id !== templateId));
    } catch (error) {
      console.error("Error deleting template:", error);
      toast({
        title: "Error",
        description: axios.isAxiosError(error)
          ? error.response?.data?.error?.message || error.response?.data?.message || error.message
          : "Failed to delete template",
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

  // Navigate to template test runner
  const handleTest = (templateId: string) => {
    navigate(`/workflows/${workflowId}/builder/templates/test/${templateId}`);
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
  useEffect(() => {
    fetchTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowId]);

  return (
    <BuilderLayout>
      <BuilderLayoutHeader>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Document Templates</h2>
            <div className="text-sm text-muted-foreground">
              Upload and manage document templates for this workflow
            </div>
          </div>

          <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
            <DialogTrigger asChild>
              <Button disabled={workflowProjectId === null}>
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
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      setSelectedFile(file);
                      // Auto-fill the display name with the filename (without extension)
                      if (file && !templateKey) {
                        const filename = file.name.replace(/\.[^/.]+$/, '');
                        setTemplateKey(filename);
                      }
                    }}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="key">Display Name</Label>
                  <Input
                    id="key"
                    placeholder="e.g., contract_v1, invoice"
                    value={templateKey}
                    onChange={(e) => setTemplateKey(e.target.value)}
                  />
                  <div className="text-xs text-muted-foreground">
                    Unique identifier for referencing this template
                  </div>
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
        {/* Warning banner when workflow is not in a project */}
        {workflowProjectId === null && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Project Required</AlertTitle>
            <AlertDescription className="flex items-center justify-between">
              <span>
                This workflow is not associated with a project. Templates must be uploaded to a project.
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/workflows/${workflowId}/builder?tab=settings`)}
                className="ml-4"
              >
                Go to Settings
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {templates.length === 0 && workflowProjectId !== null && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <FileText className="w-16 h-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No templates yet</h3>
            <div className="text-sm text-muted-foreground mb-4 max-w-sm">
              Upload your first document template to start generating documents from workflow data
            </div>
            <Button onClick={() => setUploadDialogOpen(true)}>
              <Upload className="w-4 h-4 mr-2" />
              Upload Template
            </Button>
          </div>
        )}

        {templates.length > 0 && (
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
