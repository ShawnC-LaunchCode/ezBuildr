/**
 * Final Documents Section Editor
 * Configure Final Documents blocks for document generation
 */
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { FileText, Eye, HelpCircle, CheckCircle, ChevronDown, ChevronRight, GitBranch } from "lucide-react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { LogicBuilder } from "@/components/logic";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ApiSection } from "@/lib/vault-api";
import { useUpdateSection } from "@/lib/vault-hooks";
import { useWorkflowBuilder } from "@/store/workflow-builder";

import {
  normalizeFinalDocumentsTemplateEntry,
  type FinalDocumentsTemplateEntry,
} from "@shared/finalDocumentsTemplates";
import { countConditions } from "@shared/types/conditions";
import type { ConditionExpression } from "@shared/types/conditions";

interface FinalDocumentsSectionEditorProps {
  section: ApiSection;
  workflowId: string;
}
interface WorkflowTemplate {
  id: string;
  name: string;
  description: string | null;
}

interface DocumentEntry {
  templateId: string;
  conditions: ConditionExpression | null;
}

/** Collapsed-by-default per-document condition editor, built on the shared
 * `LogicBuilder` (LU-5) — the same condition language and editor
 * steps/sections already use, so a document's "generate only when..." rule
 * is authored identically to a question's "show only when...". */
function DocumentConditionRow({
  workflowId,
  conditions,
  onChange,
}: {
  workflowId: string;
  conditions: ConditionExpression | null;
  onChange: (conditions: ConditionExpression) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const conditionCount = conditions ? countConditions(conditions) : 0;
  const hasConditions = conditionCount > 0;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="border rounded-md bg-muted/20">
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full justify-between px-2 py-1.5 h-auto text-xs font-normal"
        >
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <GitBranch className="h-3.5 w-3.5" />
            Condition
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className={hasConditions ? "text-amber-600 font-medium" : "text-muted-foreground"}>
              {hasConditions ? `Conditional (${conditionCount})` : "Always generated"}
            </span>
            {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </span>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-2 pb-2 pt-1 border-t">
        <LogicBuilder
          workflowId={workflowId}
          elementType="document"
          value={conditions}
          onChange={onChange}
        />
      </CollapsibleContent>
    </Collapsible>
  );
}

export function FinalDocumentsSectionEditor({ section, workflowId }: FinalDocumentsSectionEditorProps) {
  const updateSectionMutation = useUpdateSection();
  const { mode } = useWorkflowBuilder();
  const isEasyMode = mode === 'easy';
  // Define config type locally if not available globally yet
  interface FinalDocumentsConfig {
    finalBlock?: boolean;
    templates?: FinalDocumentsTemplateEntry[];
    screenTitle?: string;
    markdownMessage?: string;
    advanced?: Record<string, unknown>;
  }

  // Get config from section or use defaults
  const config = (section.config ?? {
    finalBlock: true,
    templates: [],
    screenTitle: "Your Completed Documents",
    markdownMessage: "# Thank You!\n\nYour documents are ready for download below.",
    advanced: {}
  }) as FinalDocumentsConfig;

  // LU-5: `templates` entries are either the legacy bare template-id string
  // or the widened `{ templateId, conditions? }` object; normalize once on
  // read so the rest of this component only deals with one shape.
  const [documentEntries, setDocumentEntries] = useState<DocumentEntry[]>(() =>
    (config.templates ?? [])
      .map(normalizeFinalDocumentsTemplateEntry)
      .filter((entry): entry is DocumentEntry => entry !== null)
  );
  const [screenTitle, setScreenTitle] = useState(config.screenTitle ?? "Your Completed Documents");
  const [markdownMessage, setMarkdownMessage] = useState(config.markdownMessage ?? "# Thank You!\n\nYour documents are ready for download below.");
  // Fetch workflow to get projectId
  const { data: workflow } = useQuery({
    queryKey: ["workflow", workflowId],
    queryFn: async () => {
      const response = await axios.get<{ projectId: string | null }>(`/api/workflows/${workflowId}`);
      return response.data;
    },
  });
  // Fetch available templates for this project
  const { data: templatesData } = useQuery({
    queryKey: ["project-templates", workflow?.projectId],
    queryFn: async () => {
      if (!workflow?.projectId) { return { items: [] }; }
      const response = await axios.get<{ items: WorkflowTemplate[] }>(`/api/projects/${workflow.projectId}/templates`);
      return response.data;
    },
    enabled: !!workflow?.projectId,
  });
  // API returns paginated response: { items: [...], nextCursor, hasMore }
  const templates = templatesData?.items ?? [];
  // Update section config when values change
  const handleUpdate = (field: string, value: unknown) => {
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
  // Writes the smallest shape each entry needs: a bare id when there's no
  // condition (matches the legacy contract byte-for-byte), the widened
  // object only for documents that actually carry one.
  const commitDocumentEntries = (entries: DocumentEntry[]) => {
    setDocumentEntries(entries);
    const serialized: FinalDocumentsTemplateEntry[] = entries.map((entry) =>
      entry.conditions ? { templateId: entry.templateId, conditions: entry.conditions } : entry.templateId
    );
    handleUpdate("templates", serialized);
  };
  const handleTemplateToggle = (templateId: string) => {
    const isSelected = documentEntries.some((entry) => entry.templateId === templateId);
    const next = isSelected
      ? documentEntries.filter((entry) => entry.templateId !== templateId)
      : [...documentEntries, { templateId, conditions: null }];
    commitDocumentEntries(next);
  };
  const handleConditionChange = (templateId: string, conditions: ConditionExpression) => {
    commitDocumentEntries(
      documentEntries.map((entry) => (entry.templateId === templateId ? { ...entry, conditions } : entry))
    );
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
          <CardTitle>Final Documents</CardTitle>
          <CardDescription>
            {isEasyMode
              ? "Customize the final screen your client sees when they download their documents."
              : "Configure document generation and completion message for this workflow"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Screen Title - Hidden in Easy Mode */}
          {!isEasyMode && (
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
          )}
          {/* Message with Markdown Preview */}
          <div className="space-y-2">
            <Label>Completion Message</Label>
            {isEasyMode && <p className="text-xs text-muted-foreground -mt-1 mb-2">This text appears above the download links.</p>}
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
                {!isEasyMode && (
                  <p className="text-xs text-muted-foreground mt-2 inline-flex items-center gap-1">
                    Supports Markdown formatting
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-3.5 w-3.5 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>Markdown supported</TooltipContent>
                    </Tooltip>
                  </p>
                )}
              </TabsContent>
              <TabsContent value="preview" className="mt-2">
                <div className="border rounded-md p-4 min-h-[200px] prose prose-sm dark:prose-invert max-w-none bg-slate-50">
                  <div className="flex justify-center mb-4">
                    <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center text-green-600">
                      <CheckCircle className="w-6 h-6" />
                    </div>
                  </div>
                  <h2 className="text-center mt-0">{screenTitle}</h2>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {markdownMessage}
                  </ReactMarkdown>
                </div>
              </TabsContent>
            </Tabs>
          </div>
          {/* Template Selection */}
          <div className="space-y-2">
            <Label>Selected Documents</Label>
            {templates.length === 0 ? (
              <div className="border rounded-md p-4 text-center text-muted-foreground bg-muted/20">
                <p className="text-sm">No templates found.</p>
                <p className="text-xs mt-2">
                  Add templates in the project settings.
                </p>
              </div>
            ) : (
              <div className="border rounded-md p-4 space-y-3">
                {templates.map((template: WorkflowTemplate) => {
                  const entry = documentEntries.find((e) => e.templateId === template.id);
                  const isSelected = entry !== undefined;
                  return (
                    <div key={template.id} className="space-y-2">
                      <div className="flex items-start space-x-3">
                        <Checkbox
                          id={`template-${template.id}`}
                          checked={isSelected}
                          onCheckedChange={() => handleTemplateToggle(template.id)}
                        />
                        <div className="flex-1">
                          <label
                            htmlFor={`template-${template.id}`}
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                          >
                            {template.name}
                          </label>
                          {(!isEasyMode && template.description) && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {template.description}
                            </p>
                          )}
                        </div>
                      </div>
                      {/* Per-document condition. Deliberately NOT gated on
                          isEasyMode: unlike this file's pre-existing
                          easy/advanced split (screenTitle, Advanced
                          Options), conditional generation mirrors
                          VisibilityField.tsx's step-level "Conditional
                          Visibility", which is always available regardless
                          of mode -- the same LogicBuilder-based feature
                          should not be reachable only in one mode. */}
                      {isSelected && (
                        <div className="ml-7">
                          <DocumentConditionRow
                            workflowId={workflowId}
                            conditions={entry.conditions}
                            onChange={(conditions) => handleConditionChange(template.id, conditions)}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Select which document templates to generate. Optionally add a condition to generate a document only when it applies.
            </p>
          </div>
          {/* Advanced Options - Hidden in Easy Mode */}
          {!isEasyMode && (
            <div className="space-y-2">
              <Label>Advanced Options</Label>
              <div className="border rounded-md p-4 text-center text-muted-foreground">
                <p className="text-sm">No advanced options available yet</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
