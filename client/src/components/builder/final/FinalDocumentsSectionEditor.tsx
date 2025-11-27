/**
 * Final Documents Section Editor
 * Configure Final Documents blocks for document generation
 */

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Eye } from "lucide-react";
import { useUpdateSection } from "@/lib/vault-hooks";
import type { ApiSection } from "@/lib/vault-api";

interface FinalDocumentsSectionEditorProps {
  section: ApiSection;
  workflowId: string;
}

interface WorkflowTemplate {
  id: string;
  name: string;
  description: string | null;
}

export function FinalDocumentsSectionEditor({ section, workflowId }: FinalDocumentsSectionEditorProps) {
  const updateSectionMutation = useUpdateSection();

  // Get config from section or use defaults
  const config = section.config as any || {
    finalBlock: true,
    templates: [],
    screenTitle: "Your Completed Documents",
    markdownMessage: "# Thank You!\n\nYour documents are ready for download below.",
    advanced: {}
  };

  const [selectedTemplates, setSelectedTemplates] = useState<string[]>(config.templates || []);
  const [screenTitle, setScreenTitle] = useState(config.screenTitle || "Your Completed Documents");
  const [markdownMessage, setMarkdownMessage] = useState(config.markdownMessage || "# Thank You!\n\nYour documents are ready for download below.");

  // Fetch workflow to get projectId
  const { data: workflow } = useQuery({
    queryKey: ["workflow", workflowId],
    queryFn: async () => {
      const response = await axios.get(`/api/workflows/${workflowId}`);
      return response.data;
    },
  });

  // Fetch available templates for this project
  const { data: templatesData } = useQuery({
    queryKey: ["project-templates", workflow?.projectId],
    queryFn: async () => {
      if (!workflow?.projectId) return { items: [] };
      const response = await axios.get(`/api/projects/${workflow.projectId}/templates`);
      return response.data;
    },
    enabled: !!workflow?.projectId,
  });

  // API returns paginated response: { items: [...], nextCursor, hasMore }
  const templates = templatesData?.items || [];

  // Update section config when values change
  const handleUpdate = (field: string, value: any) => {
    const newConfig = {
      ...config,
      [field]: value
    };

    updateSectionMutation.mutate({
      id: section.id,
      workflowId,
      config: newConfig
    });
  };

  const handleTemplateToggle = (templateId: string) => {
    const newSelection = selectedTemplates.includes(templateId)
      ? selectedTemplates.filter(id => id !== templateId)
      : [...selectedTemplates, templateId];

    setSelectedTemplates(newSelection);
    handleUpdate("templates", newSelection);
  };

  const handleScreenTitleChange = (value: string) => {
    setScreenTitle(value);
  };

  const handleScreenTitleBlur = () => {
    handleUpdate("screenTitle", screenTitle);
  };

  const handleMarkdownChange = (value: string) => {
    setMarkdownMessage(value);
  };

  const handleMarkdownBlur = () => {
    handleUpdate("markdownMessage", markdownMessage);
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Final Documents Configuration</CardTitle>
          <CardDescription>
            Configure document generation and completion message for this workflow
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Screen Title */}
          <div className="space-y-2">
            <Label htmlFor="screenTitle">Screen Title</Label>
            <Input
              id="screenTitle"
              value={screenTitle}
              onChange={(e) => handleScreenTitleChange(e.target.value)}
              onBlur={handleScreenTitleBlur}
              placeholder="Your Completed Documents"
            />
            <p className="text-xs text-muted-foreground">
              The heading shown to users when they reach this section
            </p>
          </div>

          {/* Message with Markdown Preview */}
          <div className="space-y-2">
            <Label>Completion Message</Label>
            <Tabs defaultValue="edit" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="edit">
                  <FileText className="w-4 h-4 mr-2" />
                  Edit
                </TabsTrigger>
                <TabsTrigger value="preview">
                  <Eye className="w-4 h-4 mr-2" />
                  Preview
                </TabsTrigger>
              </TabsList>
              <TabsContent value="edit" className="mt-2">
                <Textarea
                  value={markdownMessage}
                  onChange={(e) => handleMarkdownChange(e.target.value)}
                  onBlur={handleMarkdownBlur}
                  rows={8}
                  placeholder="# Thank You!&#10;&#10;Your documents are ready for download below."
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Supports Markdown formatting (headings, bold, italic, lists, etc.)
                </p>
              </TabsContent>
              <TabsContent value="preview" className="mt-2">
                <div className="border rounded-md p-4 min-h-[200px] prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {markdownMessage}
                  </ReactMarkdown>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {/* Template Selection */}
          <div className="space-y-2">
            <Label>Document Templates to Generate</Label>
            {templates.length === 0 ? (
              <div className="border rounded-md p-4 text-center text-muted-foreground">
                <p className="text-sm">No templates found for this workflow.</p>
                <p className="text-xs mt-2">
                  Go to the Templates tab to add document templates.
                </p>
              </div>
            ) : (
              <div className="border rounded-md p-4 space-y-3">
                {templates.map((template) => (
                  <div key={template.id} className="flex items-start space-x-3">
                    <Checkbox
                      id={`template-${template.id}`}
                      checked={selectedTemplates.includes(template.id)}
                      onCheckedChange={() => handleTemplateToggle(template.id)}
                    />
                    <div className="flex-1">
                      <label
                        htmlFor={`template-${template.id}`}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                      >
                        {template.name}
                      </label>
                      {template.description && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {template.description}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Select which document templates to generate when the workflow is completed
            </p>
          </div>

          {/* Advanced Options Placeholder */}
          <div className="space-y-2">
            <Label>Advanced Options</Label>
            <div className="border rounded-md p-4 text-center text-muted-foreground">
              <p className="text-sm">No advanced options available yet</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
