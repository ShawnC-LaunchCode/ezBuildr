/**
 * TemplatesTab - Manage document templates (DOCX/PDF)
 * PR4: Full UI implementation with stubs
 */
import axios from "axios";
import { ExternalLink, FileText, Upload } from "lucide-react";
import { useState, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { type ApiWorkflowVariable } from "@/lib/vault-api";
import { useWorkflow, useProjects, useWorkflowVariables } from "@/lib/vault-hooks";
import { DocumentTemplateEditor } from "@/pages/visual-builder/components/DocumentTemplateEditor";

import { BuilderLayout, BuilderLayoutHeader, BuilderLayoutContent } from "../layout/BuilderLayout";
import { PdfMappingEditor } from "../templates/PdfMappingEditor";

import { Template, TemplateCard } from "./templates/TemplateCard";
import { TemplateUploadDialog } from "./templates/TemplateUploadDialog";

interface TemplatesTabProps {
  workflowId: string;
}

export function TemplatesTab({ workflowId }: TemplatesTabProps) {
  const { toast } = useToast();
  // const [, navigate] = useLocation(); // Unused
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [workflowProjectId, setWorkflowProjectId] = useState<string | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);

  // Fetch workflow for project context
  const { data: workflow } = useWorkflow(workflowId);
  // Fetch variables for variable analysis
  const { data: variables } = useWorkflowVariables(workflowId);
  // Fetch projects to find fallback
  const { data: projects } = useProjects();

  const workflowVariables = (variables ?? []).map((v: ApiWorkflowVariable) => ({
    id: v.key,
    alias: v.alias ?? null,
    text: v.label
  }));

  const workflowVariableAliases = new Set(workflowVariables.map(v => v.alias).filter((a): a is string => !!a));

  // Fetch templates for this project
  const fetchTemplates = async () => {
    try {
      if (!workflowProjectId) return;
      const response = await axios.get(`/api/projects/${workflowProjectId}/templates`);
      const data = response.data;
      const mappedTemplates = (data.items ?? []).map((t: any) => ({
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
      void fetchTemplates();
    }
  }, [workflowProjectId]);

  // Handle template upload
  const handleUpload = async (file: File, name: string) => {
    if (!workflowProjectId) {
      toast({
        title: "Missing information",
        description: "No project context found. Please save the workflow to a project first.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", name);

      await axios.post(`/api/projects/${workflowProjectId}/templates`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      toast({
        title: "Template uploaded",
        description: `${name} has been uploaded successfully.`,
      });
      setUploadDialogOpen(false);
      void fetchTemplates();
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
      void fetchTemplates();
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
        {filteredTemplates.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            workflowVariableAliases={workflowVariableAliases}
            onEdit={setEditingTemplate}
            onTest={handleTest}
            onDelete={handleDelete}
          />
        ))}
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
          <TemplateUploadDialog
            open={uploadDialogOpen}
            onOpenChange={setUploadDialogOpen}
            onUpload={handleUpload}
            isUploading={isUploading}
            trigger={
              <Button>
                <Upload className="w-4 h-4 mr-2" />
                Upload Template
              </Button>
            }
          />
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
                onClick={() => { toast({ description: "Email templates coming soon" }); }}
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