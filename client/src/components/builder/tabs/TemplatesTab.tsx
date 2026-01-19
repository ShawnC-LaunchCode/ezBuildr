/**
 * TemplatesTab - Manage document templates (DOCX/PDF)
 * PR4: Full UI implementation with stubs
 */
import axios from "axios";
import { Upload, FileText, Trash2, TestTube, AlertCircle, CheckCircle, ExternalLink , Edit } from "lucide-react";
import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { type ApiWorkflowVariable } from "@/lib/vault-api";
import { useWorkflow, useProjects, useWorkflowVariables } from "@/lib/vault-hooks";
import { DocumentTemplateEditor } from "@/pages/visual-builder/components/DocumentTemplateEditor";
import { BuilderLayout, BuilderLayoutHeader, BuilderLayoutContent } from "../layout/BuilderLayout";
import { PdfMappingEditor } from "../templates/PdfMappingEditor";
interface Template {
  id: string;
  name: string;
  key: string;
  type: "docx" | "pdf";
  lastUpdated: string;
  fileSize?: number;
  variables?: string[];
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
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  // Fetch workflow for project context
  const { data: workflow } = useWorkflow(workflowId);
  // Fetch variables for variable analysis
  const { data: variables } = useWorkflowVariables(workflowId);
  // Fetch projects to find fallback
  const { data: projects } = useProjects();
  const workflowVariables = (variables || []).map((v: ApiWorkflowVariable) => ({
    id: v.key,
    alias: v.alias || null,
    text: v.label
  }));
  // console.log("TemplatesTab: Computed workflowVariables", workflowVariables);
  const workflowVariableAliases = new Set(workflowVariables.map(v => v.alias).filter((a): a is string => !!a));
  // Fetch templates for this project
  const fetchTemplates = async () => {
    try {
      if (!workflowProjectId) {return;}
      const response = await axios.get(`/api/projects/${workflowProjectId}/templates`);
      const data = response.data;
      const mappedTemplates = (data.items || []).map((t: any) => ({
        id: t.id,
        name: t.name,
        key: t.id,
        type: t.type || "docx",
        lastUpdated: t.updatedAt || t.createdAt,
        fileSize: t.fileSize,
        // Mock variables if backend doesn't return them yet, for UX demonstration
        variables: t.variables || ["clientName", "matterDate", "unmatched_variable"]
      }));
      setTemplates(mappedTemplates);
    } catch (error) {
      console.error("Error fetching templates:", error);
    }
  };
  useEffect(() => {
    if (workflow?.projectId) {
      setWorkflowProjectId(workflow.projectId);
    } else if (projects && projects.length > 0) {
      // Fallback: Use the first project (Default Project) if workflow is unfiled
      setWorkflowProjectId(projects[0].id);
    }
  }, [workflow?.projectId, projects]);
  useEffect(() => {
    if (workflowProjectId) {
      fetchTemplates();
    }
  }, [workflowProjectId]);
  // Helper to check variable status
  const getVariableStatus = (templateVars: string[]) => {
    const missing = templateVars.filter(v => !workflowVariableAliases.has(v));
    const matched = templateVars.filter(v => workflowVariableAliases.has(v));
    return { missing, matched, total: templateVars.length };
  };
  // Handle template upload
  const handleUpload = async () => {
    if (!selectedFile || !templateKey || !workflowProjectId) {
      toast({
        title: "Missing information",
        description: "Please select a file and provide a display name.",
        variant: "destructive",
      });
      return;
    }
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("name", templateKey);
      await axios.post(`/api/projects/${workflowProjectId}/templates`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast({
        title: "Template uploaded",
        description: `${templateKey} has been uploaded successfully.`,
      });
      setUploadDialogOpen(false);
      setSelectedFile(null);
      setTemplateKey("");
      fetchTemplates();
    } catch (error: any) {
      console.error("Upload error:", error);
      toast({
        title: "Upload failed",
        description: error.response?.data?.message || "Failed to upload template",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };
  // Handle template test
  const handleTest = async (templateId: string) => {
    try {
      toast({
        title: "Testing template",
        description: "Generating test document...",
      });
      const response = await axios.post(`/api/templates/${templateId}/test`, {
        workflowId,
      });
      if (response.data?.url) {
        window.open(response.data.url, "_blank");
        toast({
          title: "Test successful",
          description: "Test document generated and opened.",
        });
      }
    } catch (error: any) {
      console.error("Test error:", error);
      toast({
        title: "Test failed",
        description: error.response?.data?.message || "Failed to test template",
        variant: "destructive",
      });
    }
  };
  // Handle template deletion
  const handleDelete = async (templateId: string, templateName: string) => {
    if (!confirm(`Are you sure you want to delete "${templateName}"?`)) {
      return;
    }
    try {
      await axios.delete(`/api/templates/${templateId}`);
      toast({
        title: "Template deleted",
        description: `${templateName} has been deleted.`,
      });
      fetchTemplates();
    } catch (error: any) {
      console.error("Delete error:", error);
      toast({
        title: "Delete failed",
        description: error.response?.data?.message || "Failed to delete template",
        variant: "destructive",
      });
    }
  };
  const renderTemplateGrid = (type: 'docx' | 'pdf') => {
    const filteredTemplates = templates.filter(t => t.type === type);
    if (filteredTemplates.length === 0 && workflowProjectId) {
      return (
        <div className="flex flex-col items-center justify-center h-64 text-center border-2 border-dashed rounded-lg bg-slate-50/50">
          <FileText className="w-10 h-10 text-muted-foreground mb-4 opacity-50" />
          <p className="text-sm text-muted-foreground font-medium">No {type === 'docx' ? 'Word' : 'PDF'} templates uploaded.</p>
          <p className="text-xs text-muted-foreground mt-1">Upload a {type === 'docx' ? '.docx' : '.pdf'} file to get started.</p>
        </div>
      );
    }
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredTemplates.map((template) => {
          const { missing, matched, total } = getVariableStatus(template.variables || []);
          const hasMissing = missing.length > 0;
          return (
            <Card key={template.id} className="flex flex-col hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start gap-4">
                  <div className="min-w-0">
                    <CardTitle className="text-base truncate leading-tight" title={template.name}>{template.name}</CardTitle>
                    <CardDescription className="font-mono text-[10px] mt-1 text-slate-400 truncate">{template.key}</CardDescription>
                  </div>
                  <Badge variant="secondary" className="shrink-0 text-[10px] px-1.5 py-0 h-5 font-normal text-slate-500">
                    {template.type.toUpperCase()}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex-1 space-y-4">
                {/* Variable Analysis Feedback */}
                <div className="rounded-md bg-slate-50 p-3 text-xs space-y-2 border border-slate-100">
                  <div className="flex items-center justify-between font-medium">
                    <span className="text-slate-500">Variables</span>
                    {hasMissing ? (
                      <span className="text-amber-600 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {missing.length} missing
                      </span>
                    ) : (
                      <span className="text-emerald-600 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" />
                        {matched.length}/{total} matched
                      </span>
                    )}
                  </div>
                  {/* Progress Bar */}
                  <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className={cn("h-full transition-all", hasMissing ? "bg-amber-500" : "bg-emerald-500")}
                      style={{ width: `${total > 0 ? (matched.length / total) * 100 : 100}%` }}
                    />
                  </div>
                  {hasMissing && (
                    <div className="pt-2 border-t border-slate-200/50 mt-2">
                      <p className="font-semibold text-amber-700 mb-1.5">Create these variables:</p>
                      <div className="flex flex-wrap gap-1">
                        {missing.slice(0, 3).map(v => (
                          <code key={v} className="bg-white text-amber-700 px-1 py-0.5 rounded border border-amber-200 shadow-sm text-[10px]">
                            {v}
                          </code>
                        ))}
                        {missing.length > 3 && <span className="text-amber-600 text-[10px] self-center">+{missing.length - 3}</span>}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
              <CardFooter className="pt-0 flex gap-2 justify-end border-t bg-slate-50/30 p-3">
                <Button size="sm" variant="default" className="h-7 text-xs px-3 shadow-sm" onClick={() => { void setEditingTemplate(template); }}>
                  <Edit className="w-3 h-3 mr-1.5" />
                  {template.type === 'pdf' ? 'Map Fields' : 'Preview'}
                </Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { void handleTest(template.id); }} title="Test Generation">
                  <TestTube className="w-3.5 h-3.5 text-slate-500" />
                </Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 hover:bg-destructive/10 hover:text-destructive text-slate-400" onClick={() => { void handleDelete(template.id, template.name); }} title="Delete Template">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    );
  };
  return (
    <BuilderLayout>
      <BuilderLayoutHeader>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Document Templates</h2>
            <div className="text-sm text-muted-foreground">
              Upload and manage document templates. We'll check if your workflow collects the required data.
            </div>
          </div>
          {/* Upload Dialog Trigger */}
          <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
            <DialogTrigger asChild>
              <Button disabled={!workflowProjectId}>
                <Upload className="w-4 h-4 mr-2" />
                Upload Template
              </Button>
            </DialogTrigger>
            {/* ... Dialog Content same as before ... */}
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Upload Document Template</DialogTitle>
                <DialogDescription>Supported formats: .docx, .pdf</DialogDescription>
              </DialogHeader>
              {/* Simplified upload form for brevity in replacement, assuming inner content is preserved if I was careful? 
                   Wait, I am replacing the WHOLE return? No, start line 39. 
                   I need to be careful. I'll stick to replacing specific blocks to avoid deleting the dialog content logic.
               */}
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="file">Template File</Label>
                  <Input id="file" type="file" accept=".docx,.pdf" onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) { setSelectedFile(file); setTemplateKey(file.name.replace(/\.[^/.]+$/, '')); }
                  }} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="key">Display Name</Label>
                  <Input id="key" value={templateKey} onChange={(e) => { void setTemplateKey(e.target.value); }} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { void setUploadDialogOpen(false); }}>Cancel</Button>
                <Button onClick={() => { void handleUpload(); }} disabled={isUploading}>{isUploading ? "Uploading..." : "Upload"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </BuilderLayoutHeader>
      <BuilderLayoutContent>
        <div className="space-y-12">
          {/* Word Templates Section */}
          <section className="space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-lg font-semibold tracking-tight">Word Templates</h3>
              <div className="flex items-center gap-4">
                <a
                  href="#"
                  className="text-sm text-primary hover:underline flex items-center gap-1"
                  onClick={(e) => { e.preventDefault(); toast({ description: "Word add-in coming soon" }); }}
                >
                  Use Word add-in <ExternalLink className="w-3 h-3" />
                </a>
                <Button
                  size="sm"
                  variant="default"
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={() => {
                    setTemplateKey("");
                    setSelectedFile(null);
                    setUploadDialogOpen(true);
                  }}
                >
                  Create online
                </Button>
              </div>
            </div>
            {renderTemplateGrid('docx')}
          </section>
          {/* PDF Templates Section */}
          <section className="space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-lg font-semibold tracking-tight">PDF Templates</h3>
              <Button
                size="sm"
                variant="default"
                className="bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => {
                  setTemplateKey("");
                  setSelectedFile(null);
                  setUploadDialogOpen(true);
                }}
              >
                Upload
              </Button>
            </div>
            {renderTemplateGrid('pdf')}
          </section>
          {/* Email Templates Section (Placeholder) */}
          <section className="space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-lg font-semibold tracking-tight">Email Templates</h3>
              <Button
                size="sm"
                variant="default"
                className="bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => { void toast({ description: "Email templates coming soon" }); }}
              >
                Create
              </Button>
            </div>
            <div className="flex flex-col items-center justify-center h-24 text-center border-2 border-dashed rounded-lg bg-slate-50/50">
              <p className="text-sm text-muted-foreground font-medium">You have no email templates</p>
            </div>
          </section>
        </div>
      </BuilderLayoutContent>
      {/* Editors */}
      {editingTemplate && editingTemplate.type === 'docx' && (
        <DocumentTemplateEditor
          templateId={editingTemplate.id}
          isOpen={true}
          onClose={() => setEditingTemplate(null)}
          workflowVariables={Array.from(workflowVariableAliases)}
        />
      )}
      {editingTemplate && editingTemplate.type === 'pdf' && workflowProjectId && (
        <PdfMappingEditor
          templateId={editingTemplate.id}
          isOpen={true}
          onClose={() => setEditingTemplate(null)}
          workflowVariables={workflowVariables}
          projectId={workflowProjectId}
        />
      )}
    </BuilderLayout>
  );
}