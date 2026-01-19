import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Plus, Sparkles, FileText, Calendar, MoreVertical, Pencil, FileEdit, Trash2, Share2, Users } from "lucide-react";
import React, { useMemo, useState } from "react";
import { useLocation } from "wouter";
import EditTemplateModal from "@/components/templates/EditTemplateModal";
import ShareTemplateModal from "@/components/templates/ShareTemplateModal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useTemplates, useTemplateSharing } from "@/hooks/useTemplates";
interface Template {
  id: string;
  name: string;
  description: string | null;
  content: any;
  creatorId: string;
  isSystem: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}
type SortOption = "recent" | "az";
type ViewFilter = "all" | "mine" | "shared";
export default function TemplatesPage() {
  const [, setLocation] = useLocation();
  const { list, remove } = useTemplates();
  const { listSharedWithMe } = useTemplateSharing();
  const { user } = useAuth();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortOption>("recent");
  const [viewFilter, setViewFilter] = useState<ViewFilter>("all");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [openAdd, setOpenAdd] = useState<{ open: boolean; templateId?: string }>({
    open: false,
  });
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [deletingTemplate, setDeletingTemplate] = useState<Template | null>(null);
  const [sharingTemplate, setSharingTemplate] = useState<Template | null>(null);
  // Loading state
  if (list.isLoading || (viewFilter === "shared" && listSharedWithMe.isLoading)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  // Get templates based on view filter
  const allTemplates: Template[] = list.data || [];
  const sharedTemplateIds = new Set((listSharedWithMe.data || []).map((s: any) => s.templateId));
  // Fetch full template data for shared templates
  const sharedTemplates = allTemplates.filter(t => sharedTemplateIds.has(t.id));
  const templates: Template[] =
    viewFilter === "all" ? allTemplates :
      viewFilter === "mine" ? allTemplates.filter(t => t.creatorId === user?.id && !t.isSystem) :
        viewFilter === "shared" ? sharedTemplates :
          allTemplates;
  // Extract all unique tags from templates
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    templates.forEach((t) => {
      if (t.tags && Array.isArray(t.tags)) {
        t.tags.forEach((tag) => tagSet.add(tag));
      }
    });
    return Array.from(tagSet).sort();
  }, [templates]);
  // Filter and sort templates
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let arr = templates.filter((t) => {
      // Search filter
      const matchesSearch =
        !q ||
        t.name?.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q);
      // Tag filter
      const matchesTags =
        selectedTags.length === 0 ||
        (t.tags &&
          selectedTags.some((selectedTag) => t.tags.includes(selectedTag)));
      return matchesSearch && matchesTags;
    });
    if (sort === "az") {
      arr = arr.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    } else if (sort === "recent") {
      arr = arr.sort(
        (a, b) =>
          new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
      );
    }
    return arr;
  }, [templates, query, sort, selectedTags]);
  // Separate system and user templates
  const systemTemplates = filtered.filter((t) => t.isSystem);
  const userTemplates = filtered.filter((t) => !t.isSystem);
  // Toggle tag selection
  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };
  // Clear all filters
  const clearFilters = () => {
    setSelectedTags([]);
    setQuery("");
  };
  // Handle template deletion
  const handleDeleteTemplate = async (template: Template) => {
    try {
      await remove.mutateAsync(template.id);
      toast({
        title: "Template deleted",
        description: `"${template.name}" has been removed from your library`,
      });
      setDeletingTemplate(null);
    } catch (error) {
      toast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Failed to delete template",
        variant: "destructive",
      });
    }
  };
  // Handle edit content (load into Survey Builder)
  const handleEditContent = (templateId: string) => {
    toast({
      title: "Feature coming soon",
      description: "Template content editing will be available in the Workflow Builder",
    });
    // TODO: Implement loading template into Survey Builder
    // setLocation(`/builder?templateId=${templateId}`);
  };
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header / Actions */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Templates</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Reusable sections you can drop into any workflow
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              placeholder="Search templates..."
              value={query}
              onChange={(e) => { void setQuery(e.target.value); }}
              className="w-full sm:w-[240px]"
              aria-label="Search templates"
            />
            <Select value={sort} onValueChange={(v: SortOption) => setSort(v)}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Recently added</SelectItem>
                <SelectItem value="az">A → Z</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {/* View Filter Pills */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-muted-foreground">View:</span>
          <Button
            variant={viewFilter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => { void setViewFilter("all"); }}
            className="h-8"
          >
            All Templates
          </Button>
          <Button
            variant={viewFilter === "mine" ? "default" : "outline"}
            size="sm"
            onClick={() => { void setViewFilter("mine"); }}
            className="h-8"
          >
            My Templates
          </Button>
          <Button
            variant={viewFilter === "shared" ? "default" : "outline"}
            size="sm"
            onClick={() => { void setViewFilter("shared"); }}
            className="h-8"
          >
            <Users className="w-3 h-3 mr-1.5" />
            Shared with Me
            {sharedTemplates.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-xs">
                {sharedTemplates.length}
              </Badge>
            )}
          </Button>
        </div>
        {/* Tag Filter Bar */}
        {allTags.length > 0 && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground">
                  Filter by tags:
                </span>
                {selectedTags.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearFilters}
                    className="h-7 text-xs"
                  >
                    Clear all
                  </Button>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {filtered.length} {filtered.length === 1 ? "template" : "templates"}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {allTags.map((tag) => (
                <Badge
                  key={tag}
                  variant={selectedTags.includes(tag) ? "default" : "outline"}
                  className="cursor-pointer hover:bg-primary/90 transition-colors"
                  onClick={() => { void toggleTag(tag); }}
                >
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        )}
        {/* CTA Card */}
        <Card className="border-dashed border-2 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950 dark:to-purple-950">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-blue-600" />
                  Save your current workflow as a template
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Capture a great section once, then reuse it everywhere
                </p>
              </div>
              <Button
                variant="secondary"
                onClick={() =>
                  toast({
                    title: "Open Survey Builder",
                    description:
                      "Use the 'Save as Template' button in the Workflow Builder toolbar",
                  })
                }
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Learn how
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Edits after insertion won't affect the original template. Each use creates an
              independent copy.
            </p>
          </CardContent>
        </Card>
        {/* Templates Grid */}
        {filtered.length === 0 ? (
          <EmptyState hasQuery={!!query} />
        ) : (
          <div className="space-y-6">
            {/* System Templates */}
            {systemTemplates.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  System Templates
                </h2>
                <TemplateGrid
                  templates={systemTemplates}
                  onAddToSurvey={(templateId) =>
                    toast({ title: "Feature coming soon", description: "Adding templates to workflows directly is coming soon." })
                  }
                  onEdit={setEditingTemplate}
                  onDelete={setDeletingTemplate}
                  onShare={setSharingTemplate}
                  onEditContent={handleEditContent}
                  currentUserId={user?.id}
                />
              </div>
            )}
            {/* User Templates */}
            {userTemplates.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  {viewFilter === "shared" ? "Shared with Me" : "My Templates"}
                </h2>
                <TemplateGrid
                  templates={userTemplates}
                  onAddToSurvey={(templateId) =>
                    toast({ title: "Feature coming soon", description: "Adding templates to workflows directly is coming soon." })
                  }
                  onEdit={setEditingTemplate}
                  onDelete={setDeletingTemplate}
                  onShare={setSharingTemplate}
                  onEditContent={handleEditContent}
                  currentUserId={user?.id}
                />
              </div>
            )}
          </div>
        )}
        {/* Add to Survey Dialog */}
        {/* Edit Template Modal */}
        <EditTemplateModal
          open={!!editingTemplate}
          onClose={() => setEditingTemplate(null)}
          template={editingTemplate}
        />
        {/* Delete Confirmation Dialog */}
        <AlertDialog
          open={!!deletingTemplate}
          onOpenChange={(open) => !open && setDeletingTemplate(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete template?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{deletingTemplate?.name}"? This action cannot be
                undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => { void deletingTemplate && handleDeleteTemplate(deletingTemplate); }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {/* Share Template Modal */}
        {sharingTemplate && (
          <ShareTemplateModal
            open={!!sharingTemplate}
            onOpenChange={(open) => !open && setSharingTemplate(null)}
            templateId={sharingTemplate.id}
            templateName={sharingTemplate.name}
          />
        )}
      </div>
    </div>
  );
}
// Template Grid Component
interface TemplateGridProps {
  templates: Template[];
  onAddToSurvey: (templateId: string) => void;
  onEdit: (template: Template) => void;
  onDelete: (template: Template) => void;
  onShare: (template: Template) => void;
  onEditContent: (templateId: string) => void;
  currentUserId?: string;
}
function TemplateGrid({
  templates,
  onAddToSurvey,
  onEdit,
  onDelete,
  onShare,
  onEditContent,
  currentUserId,
}: TemplateGridProps) {
  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
      <AnimatePresence>
        {templates.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            onAddToSurvey={onAddToSurvey}
            onEdit={onEdit}
            onDelete={onDelete}
            onShare={onShare}
            onEditContent={onEditContent}
            currentUserId={currentUserId}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
// Template Card Component
interface TemplateCardProps {
  template: Template;
  onAddToSurvey: (templateId: string) => void;
  onEdit: (template: Template) => void;
  onDelete: (template: Template) => void;
  onShare: (template: Template) => void;
  onEditContent: (templateId: string) => void;
  currentUserId?: string;
}
function TemplateCard({
  template,
  onAddToSurvey,
  onEdit,
  onDelete,
  onShare,
  onEditContent,
  currentUserId,
}: TemplateCardProps) {
  // Fetch shares for this template to show SHARED badge
  const { listShares } = useTemplateSharing(template.id);
  const hasShares = (listShares.data || []).length > 0;
  // Extract metadata from template content if available
  const pageCount = template.content?.pages?.length || 0;
  const questionCount =
    template.content?.pages?.reduce(
      (acc: number, page: any) => acc + (page.questions?.length || 0),
      0
    ) || 0;
  // Check if current user can edit this template
  const canEdit = currentUserId && template.creatorId === currentUserId;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
    >
      <Card className="h-full hover:shadow-lg transition-all duration-200 group">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2 flex-1 min-w-0">
              <FileText className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <span className="truncate">{template.name}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {template.isSystem && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                  SYSTEM
                </span>
              )}
              {hasShares && canEdit && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                  <Users className="w-3 h-3 mr-1" />
                  SHARED
                </span>
              )}
              {canEdit && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label="Template actions"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => { void onEdit(template); }}>
                      <Pencil className="w-4 h-4 mr-2" />
                      Edit details
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { void onEditContent(template.id); }}>
                      <FileEdit className="w-4 h-4 mr-2" />
                      Edit content
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => { void onShare(template); }}>
                      <Share2 className="w-4 h-4 mr-2" />
                      Share with team
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => { void onDelete(template); }}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground line-clamp-3 min-h-[3rem]">
            {template.description || "No description provided"}
          </p>
          {/* Tags */}
          {template.tags && template.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {template.tags.map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="text-xs px-2 py-0.5"
                >
                  {tag}
                </Badge>
              ))}
            </div>
          )}
          {/* Metadata */}
          <div className="flex items-center justify-between text-xs text-muted-foreground border-t pt-3">
            <div className="flex items-center gap-3">
              {pageCount > 0 && (
                <span className="flex items-center gap-1">
                  <FileText className="w-3 h-3" />
                  {pageCount} page{pageCount !== 1 ? "s" : ""}
                </span>
              )}
              {questionCount > 0 && (
                <span>
                  {questionCount} question{questionCount !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>
          {/* Created date */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Calendar className="w-3 h-3" />
            <span>
              {template.createdAt
                ? new Date(template.createdAt).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })
                : "—"}
            </span>
          </div>
          {/* Action Button */}
          <div className="flex justify-end pt-2">
            <Button
              size="sm"
              onClick={() => { void onAddToSurvey(template.id); }}
              className="gap-2"
            >
              <Plus className="w-3 h-3" />
              Add to workflow
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
// Empty State Component
interface EmptyStateProps {
  hasQuery: boolean;
}
function EmptyState({ hasQuery }: EmptyStateProps) {
  if (hasQuery) {
    return (
      <div className="min-h-[40vh] flex flex-col items-center justify-center text-center text-muted-foreground">
        <div className="text-4xl mb-3">🔍</div>
        <p className="font-medium text-lg">No templates found</p>
        <p className="text-sm">Try adjusting your search query</p>
      </div>
    );
  }
  return (
    <div className="min-h-[40vh] flex flex-col items-center justify-center text-center text-muted-foreground">
      <div className="text-6xl mb-4">🧩</div>
      <p className="font-medium text-lg mb-2">No templates yet</p>
      <p className="text-sm max-w-md">
        Create a template from any workflow using the "Save as Template" button in the
        Workflow Builder, then it will appear here for reuse.
      </p>
    </div>
  );
}