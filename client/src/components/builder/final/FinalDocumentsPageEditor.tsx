/**
 * Final Documents Page Editor
 * Configure Final Documents blocks for document generation
 */
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { CheckCircle, ChevronDown, ChevronRight, Download, Eye, FileText, GitBranch, HelpCircle } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ApiPage } from "@/lib/vault-api";
import { useUpdatePage, useWorkflowMode } from "@/lib/vault-hooks";

import {
  normalizeFinalDocumentsTemplateEntry,
  type FinalDocumentsTemplateEntry,
  type NormalizedFinalDocumentsTemplateEntry,
} from "@shared/finalDocumentsTemplates";
import { countConditions } from "@shared/types/conditions";
import type { ConditionExpression } from "@shared/types/conditions";
import type { FinalDocumentOutputFormat } from "@shared/types/stepConfigs";

interface FinalDocumentsPageEditorProps {
  page: ApiPage;
  workflowId: string;
}
interface WorkflowTemplate {
  id: string;
  name: string;
  description: string | null;
}

interface DocumentEntry {
  templateId: string;
  title: string | null;
  conditions: ConditionExpression | null;
  pinnedVersionId?: string | null;
}

/** Collapsed-by-default per-document condition editor, built on the shared
 * `LogicBuilder` (LU-5) — the same condition language and editor
 * steps/pages already use, so a document's "generate only when..." rule
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

export function TemplateVersionSelector({
  templateId,
  value,
  onChange
}: {
  templateId: string;
  value: string | null;
  onChange: (val: string | null) => void;
}) {
  const { data: versions, isLoading } = useQuery({
    queryKey: ['template', templateId, 'versions'],
    queryFn: async () => {
      const res = await axios.get<{ versions: Array<{ id: string, versionNumber: number, createdAt: string, notes: string | null }> }>(`/api/templates/${templateId}/versions`);
      return res.data.versions;
    }
  });

  return (
    <div className="space-y-1.5 pt-2 border-t mt-2">
      <Label className="text-xs text-muted-foreground flex items-center justify-between">
        Version Pinning
      </Label>
      <Select
        value={value ?? "latest"}
        onValueChange={(val) => onChange(val === "latest" ? null : val)}
        disabled={isLoading || !versions?.length}
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder="Follow Latest" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="latest">Follow Latest</SelectItem>
          {versions?.map((v) => (
            <SelectItem key={v.id} value={v.id}>
              v{v.versionNumber} ({new Date(v.createdAt).toLocaleDateString()})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function CompletionMessageEditor({
  isEasyMode,
  screenTitle,
  markdownMessage,
  onChange,
  onBlur,
}: {
  isEasyMode: boolean;
  screenTitle: string;
  markdownMessage: string;
  onChange: (value: string) => void;
  onBlur: () => void;
}) {
  return (
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
            onChange={(event) => onChange(event.target.value)}
            onBlur={onBlur}
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
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdownMessage}</ReactMarkdown>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function OutputDeliveryOptions({
  outputFormats,
  showDocuments,
  redirectUrl,
  onFormatToggle,
  onShowDocumentsChange,
  onRedirectChange,
  onRedirectBlur,
}: {
  outputFormats: FinalDocumentOutputFormat[];
  showDocuments: boolean;
  redirectUrl: string;
  onFormatToggle: (format: FinalDocumentOutputFormat) => void;
  onShowDocumentsChange: (checked: boolean) => void;
  onRedirectChange: (value: string) => void;
  onRedirectBlur: () => void;
}) {
  return (
    <>
      <div className="space-y-2">
        <Label>Output formats</Label>
        <div className="grid gap-3 rounded-md border p-4">
          {(['docx', 'pdf'] as const).map((format) => (
            <label
              key={format}
              htmlFor={`output-format-${format}`}
              className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-muted/40"
            >
              <Checkbox
                id={`output-format-${format}`}
                checked={outputFormats.includes(format)}
                disabled={outputFormats.length === 1 && outputFormats.includes(format)}
                onCheckedChange={() => onFormatToggle(format)}
              />
              <span>
                <span className="block text-sm font-medium uppercase">{format}</span>
                <span className="block text-xs text-muted-foreground">
                  {format === 'docx' ? 'Editable Microsoft Word document' : 'Ready-to-share PDF document'}
                </span>
              </span>
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Select one or both formats. PDF conversion preserves the DOCX output if conversion is unavailable.
        </p>
      </div>
      <div className="space-y-3">
        <Label>Delivery</Label>
        <div className="space-y-4 rounded-md border p-4">
          <div className="flex items-start gap-3">
            <Checkbox
              id="showDocuments"
              checked={showDocuments}
              onCheckedChange={(checked) => onShowDocumentsChange(checked === true)}
            />
            <div className="space-y-1">
              <Label htmlFor="showDocuments" className="cursor-pointer">Show secure download links</Label>
              <p className="text-xs text-muted-foreground">
                Generated files are served from the configured storage provider through the run&apos;s authenticated download endpoint.
              </p>
            </div>
          </div>
          <div className="space-y-2 border-t pt-4">
            <Label htmlFor="redirectUrl">Redirect after completion</Label>
            <Input
              id="redirectUrl"
              type="url"
              value={redirectUrl}
              onChange={(event) => onRedirectChange(event.target.value)}
              onBlur={onRedirectBlur}
              placeholder="https://example.com/next"
            />
            <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              Optional. Leave blank to keep participants on the download page.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * An empty output-title field means "follow the template's own name", so it
 * normalizes back to null rather than freezing today's template name in.
 *
 * `changed` is measured against the *persisted* title rather than the local
 * `documentEntries`: the change handler has already written the typed text
 * into local state by the time blur fires, so comparing there would report
 * every real edit as a no-op.
 */
function resolveTitleUpdate(
  templates: FinalDocumentsTemplateEntry[] | undefined,
  templateId: string,
  title: string
): { normalized: string | null; changed: boolean } {
  const normalized = title.trim() === '' ? null : title.trim();
  const persisted = (templates ?? [])
    .map((entry) => normalizeFinalDocumentsTemplateEntry(entry))
    .find((entry) => entry?.templateId === templateId)?.title ?? null;
  return { normalized, changed: persisted !== normalized };
}


function TemplateSelectionList({
  templates,
  documentEntries,
  isEasyMode,
  workflowId,
  onTemplateToggle,
  onDocumentTitleChange,
  onDocumentTitleBlur,
  onConditionChange,
  onVersionPinChange,
}: {
  templates: WorkflowTemplate[];
  documentEntries: DocumentEntry[];
  isEasyMode: boolean;
  workflowId: string;
  onTemplateToggle: (templateId: string) => void;
  onDocumentTitleChange: (templateId: string, title: string) => void;
  onDocumentTitleBlur: (templateId: string, title: string) => void;
  onConditionChange: (templateId: string, conditions: ConditionExpression) => void;
  onVersionPinChange: (templateId: string, versionId: string | null) => void;
}) {
  return (
    <div className="border rounded-md p-4 space-y-3">
      {templates.map((template) => {
        const entry = documentEntries.find((e) => e.templateId === template.id);
        const isSelected = entry !== undefined;
        return (
          <div key={template.id} className="space-y-2">
            <div className="flex items-start space-x-3">
              <Checkbox
                id={`template-${template.id}`}
                checked={isSelected}
                onCheckedChange={() => onTemplateToggle(template.id)}
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
            {isSelected && (
              <div className="ml-7 space-y-2 rounded-md border bg-muted/10 p-3">
                <div className="space-y-1.5">
                  <Label htmlFor={`document-title-${template.id}`} className="text-xs">
                    Output title
                  </Label>
                  <Input
                    id={`document-title-${template.id}`}
                    value={entry.title ?? ''}
                    onChange={(event) => onDocumentTitleChange(template.id, event.target.value)}
                    onBlur={(event) => onDocumentTitleBlur(template.id, event.target.value)}
                    placeholder={template.name}
                    className="h-9"
                  />
                  <p className="text-xs text-muted-foreground">
                    Used in the generated file name.
                  </p>
                </div>
                <DocumentConditionRow
                  workflowId={workflowId}
                  conditions={entry.conditions}
                  onChange={(conditions) => onConditionChange(template.id, conditions)}
                />
                <TemplateVersionSelector
                  templateId={template.id}
                  value={entry.pinnedVersionId ?? null}
                  onChange={(val) => onVersionPinChange(template.id, val)}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function FinalDocumentsPageEditor({ page, workflowId }: FinalDocumentsPageEditorProps) {
  const updatePageMutation = useUpdatePage();
  // O-10: mode is server-owned and per-workflow. This used to read a global
  // zustand copy that was never written, so it was permanently "easy" and the
  // Advanced branches below were unreachable. `?? 'easy'` while the query
  // loads keeps the simpler surface from flashing into Advanced.
  const { data: modeData } = useWorkflowMode(workflowId);
  const isEasyMode = (modeData?.mode ?? 'easy') === 'easy';
  // Define config type locally if not available globally yet
  interface FinalDocumentsConfig {
    finalBlock?: boolean;
    templates?: FinalDocumentsTemplateEntry[];
    screenTitle?: string;
    markdownMessage?: string;
    outputFormats?: FinalDocumentOutputFormat[];
    showDocuments?: boolean;
    redirectUrl?: string;
  }

  // Get config from page or use defaults
  const config = (page.config ?? {
    finalBlock: true,
    templates: [],
    screenTitle: "Your Completed Documents",
    markdownMessage: "# Thank You!\n\nYour documents are ready for download below.",
    outputFormats: ['docx'],
    showDocuments: true,
  }) as FinalDocumentsConfig;
  const [draftConfig, setDraftConfig] = useState<FinalDocumentsConfig>(config);

  // LU-5: `templates` entries are either the legacy bare template-id string
  // or the widened `{ templateId, conditions? }` object; normalize once on
  // read so the rest of this component only deals with one shape.
  const [documentEntries, setDocumentEntries] = useState<DocumentEntry[]>(() =>
    ((config.templates as unknown[]) ?? [])
      .map(normalizeFinalDocumentsTemplateEntry)
      .filter((entry): entry is NormalizedFinalDocumentsTemplateEntry => entry !== null)
  );
  const [screenTitle, setScreenTitle] = useState(config.screenTitle ?? "Your Completed Documents");
  const [markdownMessage, setMarkdownMessage] = useState(config.markdownMessage ?? "# Thank You!\n\nYour documents are ready for download below.");
  const [outputFormats, setOutputFormats] = useState<FinalDocumentOutputFormat[]>(
    config.outputFormats?.length ? config.outputFormats : ['docx']
  );
  const [showDocuments, setShowDocuments] = useState(config.showDocuments !== false);
  const [redirectUrl, setRedirectUrl] = useState(config.redirectUrl ?? '');
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
  // Update page config when values change
  const handleUpdate = (field: string, value: unknown) => {
    const newConfig = {
      ...draftConfig,
      [field]: value
    };
    setDraftConfig(newConfig);
    updatePageMutation.mutate({
      id: page.id,
      workflowId,
      config: newConfig
    });
  };
  // Writes the smallest shape each entry needs: a bare id when there's no
  // condition (matches the legacy contract byte-for-byte), the widened
  // object only for documents that actually carry one.
  const commitDocumentEntries = (entries: DocumentEntry[]) => {
    setDocumentEntries(entries);
    const serialized: FinalDocumentsTemplateEntry[] = entries.map((entry) => {
      const title = entry.title?.trim();
      const hasTitle = title !== undefined && title !== '';
      if (entry.conditions !== null || hasTitle) {
        return {
          templateId: entry.templateId,
          ...(hasTitle ? { title } : {}),
          ...(entry.conditions !== null ? { conditions: entry.conditions } : {}),
        };
      }
      return entry.templateId;
    });
    handleUpdate("templates", serialized);
  };
  const handleTemplateToggle = (templateId: string) => {
    const isSelected = documentEntries.some((entry) => entry.templateId === templateId);
    const next = isSelected
      ? documentEntries.filter((entry) => entry.templateId !== templateId)
      : [...documentEntries, { templateId, title: null, conditions: null, pinnedVersionId: null }];
    handleUpdate('templates', next as FinalDocumentsTemplateEntry[]);
  };
  const handleVersionPinChange = (templateId: string, versionId: string | null) => {
    const next = documentEntries.map(e => 
      e.templateId === templateId ? { ...e, pinnedVersionId: versionId } : e
    );
    setDraftConfig({ ...draftConfig, templates: next as FinalDocumentsTemplateEntry[] });
    handleUpdate('templates', next as FinalDocumentsTemplateEntry[]);
  };
  const handleDocumentTitleChange = (templateId: string, title: string) => {
    setDocumentEntries((entries) =>
      entries.map((entry) => (entry.templateId === templateId ? { ...entry, title } : entry))
    );
  };
  const handleDocumentTitleBlur = (templateId: string, title: string) => {
    const { normalized, changed } = resolveTitleUpdate(draftConfig.templates, templateId, title);
    const next = documentEntries.map((entry) =>
      entry.templateId === templateId ? { ...entry, title: normalized } : entry
    );
    if (changed) { commitDocumentEntries(next); } else { setDocumentEntries(next); }
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
  const handleFormatToggle = (format: FinalDocumentOutputFormat) => {
    const next = outputFormats.includes(format)
      ? outputFormats.filter((current) => current !== format)
      : [...outputFormats, format];
    if (next.length === 0) { return; }
    setOutputFormats(next);
    handleUpdate('outputFormats', next);
  };
  const handleShowDocumentsChange = (checked: boolean) => {
    setShowDocuments(checked);
    handleUpdate('showDocuments', checked);
  };
  const handleRedirectBlur = () => {
    const normalizedUrl = redirectUrl.trim();
    handleUpdate('redirectUrl', normalizedUrl === '' ? undefined : normalizedUrl);
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
          <div className="space-y-2">
            <Label htmlFor="screenTitle">Completion page title</Label>
            <Input
              id="screenTitle"
              value={screenTitle}
              onChange={(e) => handleScreenTitleChange(e.target.value)}
              onBlur={handleScreenTitleBlur}
              placeholder="Your Completed Documents"
            />
            <p className="text-xs text-muted-foreground">
              The heading participants see above their generated documents.
            </p>
          </div>
          <CompletionMessageEditor
            isEasyMode={isEasyMode}
            screenTitle={screenTitle}
            markdownMessage={markdownMessage}
            onChange={handleMarkdownChange}
            onBlur={handleMarkdownBlur}
          />
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
              <TemplateSelectionList
                templates={templates}
                documentEntries={documentEntries}
                isEasyMode={isEasyMode}
                workflowId={workflowId}
                onTemplateToggle={handleTemplateToggle}
                onDocumentTitleChange={handleDocumentTitleChange}
                onDocumentTitleBlur={handleDocumentTitleBlur}
                onConditionChange={handleConditionChange}
                onVersionPinChange={handleVersionPinChange}
              />
            )}
            <p className="text-xs text-muted-foreground">
              Select which document templates to generate. Optionally add a condition to generate a document only when it applies.
            </p>
          </div>
          <OutputDeliveryOptions
            outputFormats={outputFormats}
            showDocuments={showDocuments}
            redirectUrl={redirectUrl}
            onFormatToggle={handleFormatToggle}
            onShowDocumentsChange={handleShowDocumentsChange}
            onRedirectChange={setRedirectUrl}
            onRedirectBlur={handleRedirectBlur}
          />
        </CardContent>
      </Card>
    </div>
  );
}
