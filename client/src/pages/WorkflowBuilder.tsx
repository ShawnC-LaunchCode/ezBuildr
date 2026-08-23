/**
 * Workflow Builder - Tabbed interface with Pages, Templates, Data Sources, Settings, Snapshots
 * PR1: Added tab-based navigation structure
 */
import { useQueryClient } from "@tanstack/react-query";
import {
  Eye,
  ChevronDown,
  ArrowLeft,
  Download,
  GitGraph,
  Link2,
  Sparkles,
  Share2,
  UserPlus,
  Users,
} from "lucide-react";

// Removed AdvancedModeBanner
// Tab components
// Versioning Imports
import { useState, useEffect, useMemo } from "react";

import type { ComponentType } from "react";
import { useLocation, useParams, useSearch } from "wouter";

import { ActivateToggle } from "@/components/builder/ActivateToggle";
import { AssignInterviewDialog } from "@/components/builder/AssignInterviewDialog";
import { ExportWorkflowDialog } from "@/components/builder/ExportWorkflowDialog";
import { ResourceAccessDialog } from "@/components/access/ResourceAccessDialog";
import { AiConversationPanel } from "@/components/builder/ai/AiConversationPanel";
import { CollectionsDrawer } from "@/components/builder/data-sources/CollectionsDrawer";
import {
  BuilderTabNav,
  isBuilderTab,
  type BuilderTab,
} from "@/components/builder/layout/BuilderTabNav";
import { BuilderModeToggle } from "@/components/builder/layout/BuilderModeToggle";
import { BuilderTabPanel } from "@/components/builder/layout/BuilderTabPanel";
import { ResizableBuilderLayout } from "@/components/builder/layout/ResizableBuilderLayout";
import { LogicInspectorPanel } from "@/components/builder/LogicInspectorPanel";
import { MapTab } from "@/components/builder/map/MapTab";
import { DataSourcesTab } from "@/components/builder/tabs/DataSourcesTab";
import { ReviewTab } from "@/components/builder/tabs/ReviewTab";
import { PagesTab } from "@/components/builder/tabs/PagesTab";
import { SettingsTab } from "@/components/builder/tabs/SettingsTab";
import { SnapshotsTab } from "@/components/builder/tabs/SnapshotsTab";
import { TemplatesTab } from "@/components/builder/tabs/TemplatesTab";
import { DiffViewer, type DiffTarget } from "@/components/builder/versioning/DiffViewer";
import { VersionBadge } from "@/components/builder/versioning/VersionBadge";
import { VersionHistoryPanel } from "@/components/builder/versioning/VersionHistoryPanel";
import {
  CollaborationProvider,
  useCollaboration,
} from "@/components/collab/CollaborationContext";
import { PresenceAvatars } from "@/components/collab/PresenceAvatars";
import FeedbackWidget from "@/components/FeedbackWidget";
import Sidebar from "@/components/layout/Sidebar";
import { PreviewRunner } from "@/components/preview/PreviewRunner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { type ApiWorkflowVersion, authAPI } from "@/lib/vault-api";
import {
  useVersions,
  useRestoreVersion,
  useWorkflow,
  useSetWorkflowMode,
} from "@/lib/vault-hooks";
import { useWorkflowBuilder } from "@/store/workflow-builder";
import { CURRENT_VERSION_ID } from "@shared/config";

// eslint-disable-next-line max-lines-per-function, complexity
export default function WorkflowBuilder() {
  const { id: workflowId } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const search = useSearch();
  const queryClient = useQueryClient();
  const { user, isLoading: authLoading } = useAuth();
  const { data: workflow, isLoading } = useWorkflow(workflowId);
  const workflowMode = workflow
    ? { mode: workflow.modeOverride ?? "easy" }
    : undefined;
  const modeLoading = isLoading;
  const { data: versions } = useVersions(workflowId);

  const restoreMutation = useRestoreVersion();
  const setWorkflowModeMutation = useSetWorkflowMode();
  // State
  const searchParams = useMemo(() => new URLSearchParams(search), [search]);
  const [collectionsDrawerOpen, setCollectionsDrawerOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const [diffBaseVersion, setDiffBaseVersion] = useState<DiffTarget | null>(
    null,
  );
  const [diffTargetVersion, setDiffTargetVersion] = useState<DiffTarget | null>(
    null,
  );
  const [aiPanelOpen, setAiPanelOpen] = useState(
    searchParams.get("aiPanel") === "true",
  );
  const [logicPanelOpen, setLogicPanelOpen] = useState(false);
  const [collabToken, setCollabToken] = useState<string | null>(null);
  // Fetch collaboration token
  useEffect(() => {
    const fetchToken = async () => {
      try {
        const { token } = await authAPI.getToken();
        setCollabToken(token);
      } catch (error) {
        // Fallback to session (will fail on newer server, but keeps old behavior if something is weird)
        setCollabToken("session");
      }
    };
    void fetchToken();
  }, []);
  // ... existing state ...
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [launchingPreview] = useState(false);
  // searchParams hoisted above
  const requestedTab = searchParams.get("tab");
  const requestedPageId = searchParams.get("pageId");
  const requestedStepId = searchParams.get("stepId");
  const requestedBlockId = searchParams.get("blockId");
  const requestedPanel = searchParams.get("panel");
  const [activeTab, setActiveTab] = useState<BuilderTab>(
    isBuilderTab(requestedTab) ? requestedTab : "pages",
  );
  const selectPage = useWorkflowBuilder(state => state.selectPage);
  const selectStep = useWorkflowBuilder(state => state.selectStep);
  const selectBlock = useWorkflowBuilder(state => state.selectBlock);

  useEffect(() => {
    if (isBuilderTab(requestedTab)) {
      setActiveTab(requestedTab);
    }
    if (requestedStepId) {
      selectStep(requestedStepId);
    } else if (requestedBlockId) {
      selectBlock(requestedBlockId);
    } else if (requestedPageId) {
      selectPage(requestedPageId);
    }
    if (requestedPanel === "logic") {
      setLogicPanelOpen(true);
    }
  }, [
    requestedBlockId,
    requestedPanel,
    requestedPageId,
    requestedStepId,
    requestedTab,
    selectBlock,
    selectPage,
    selectStep,
  ]);
  const mode = workflowMode?.mode ?? "easy";

  // Sort versions to find latest published
  const versionsArray = Array.isArray(versions) ? versions : [];
  const latestPublished = versionsArray
    .filter((v) => !v.isDraft)
    .sort((a, b) => b.versionNumber - a.versionNumber)[0];
  // Determine label: "Draft" or "vX" (if we were viewing history, but we are always editing draft here)
  // Label is the version being edited only — the word "Draft" belongs to the
  // status pill, and having it in both places read as one duplicated control.
  const versionLabel =
    latestPublished !== undefined
      ? `v${latestPublished.versionNumber}+`
      : "v1";
  const handleDiff = (version: ApiWorkflowVersion) => {
    // Diff the selected version against the current draft. When no draft row
    // has been saved yet, compare against the workflow's live state, which the
    // server serializes on demand for CURRENT_VERSION_ID.
    const draftVersion = versionsArray.find((v) => v.isDraft);
    setDiffBaseVersion({ id: version.id, label: `v${version.versionNumber}` });
    setDiffTargetVersion(
      draftVersion !== undefined
        ? { id: draftVersion.id, label: `v${draftVersion.versionNumber} (draft)` }
        : { id: CURRENT_VERSION_ID, label: "current draft" },
    );
    setDiffOpen(true);
  };
  // Memoize collaborative user to prevent WebSocket reconnects
  // This MUST be before any early returns to comply with Rules of Hooks
  const collabUser = useMemo(
    () => ({
      id: user?.id
        ? String(user.id)
        : `anon-${Math.random().toString(36).substr(2, 5)}`,
      name: user?.firstName ?? "Guest User",
      color: `#${Math.floor(Math.random() * 16777215)
        .toString(16)
        .padStart(6, "0")}`,
      email: user?.email,
    }),
    [user?.id, user?.firstName, user?.email],
  );
  // ... Render ...
  if (isLoading || modeLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Skeleton className="h-12 w-64" />
      </div>
    );
  }
  if (!workflow) {
    return (
      <div className="h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Workflow not found</p>
      </div>
    );
  }
  if (isPreviewMode) {
    return (
      <PreviewRunner
        workflowId={workflowId}
        onExit={() => setIsPreviewMode(false)}
      />
    );
  }
  // Only enable collaboration when we have the token AND the user is loaded with a tenantId
  // This prevents the "default-tenant" race condition
  const isCollabReady = !!collabToken && !authLoading && !!user?.tenantId;

  return (
    <CollaborationProvider
      config={{
        workflowId: workflowId,
        tenantId: user?.tenantId ?? "",
        token: collabToken ?? "",
        enabled: isCollabReady,
        user: collabUser,
      }}
    >
      <>
        <CollabSync mode={mode} />
        <ResizableBuilderLayout
          workflowId={workflowId}
          rightPanelOpen={aiPanelOpen}
          onRightPanelToggle={setAiPanelOpen}
          leftPanel={<Sidebar className="w-full border-r-0 h-full" />}
          centerPanel={
            <div className="flex h-full min-h-0 flex-col bg-background">
              {/* Header */}
              <div className="sticky top-0 z-10 bg-background">
                <div className="border-b bg-card px-3 py-2 lg:px-4">
                  {/* flex-wrap with no breakpoint: this row lives inside the
                      centre panel, whose width is the viewport minus whichever
                      side panels are open, so no viewport media query can
                      describe when it fits. Wrapping only engages when the
                      controls genuinely do not fit, which also keeps the
                      state cluster stays beside the title it describes. */}
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => navigate("/workflows")}
                          className="size-8 shrink-0"
                          aria-label="Back to workflows"
                        >
                          <ArrowLeft className="size-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">Back to workflows</TooltipContent>
                    </Tooltip>
                    <h1
                      className="min-w-0 shrink truncate text-base font-semibold tracking-tight"
                      title={workflow.title}
                    >
                      {workflow.title}
                    </h1>
                    <ToolbarDivider />
                    {/* State cluster: publish status, then the version it edits */}
                    <ActivateToggle
                      workflowId={workflowId}
                      currentStatus={workflow.status}
                      onStatusChange={(_s) => {
                        void queryClient.invalidateQueries({
                          queryKey: ["workflows"],
                        });
                      }}
                    />
                    <VersionBadge
                      versionLabel={versionLabel}
                      isDraft={true}
                      onClick={() => setHistoryOpen(true)}
                    />
                    {/* Mode Selector — the current mode is now readable
                        without opening anything, which also retires the
                        separate indigo "Advanced" pill this used to duplicate. */}
                    <BuilderModeToggle
                      mode={mode}
                      disabled={setWorkflowModeMutation.isPending}
                      onChange={(next) => {
                        setWorkflowModeMutation.mutate({
                          workflowId: workflowId,
                          modeOverride: next,
                        });
                      }}
                    />
                    {/* Everything after this is pushed to the trailing edge */}
                    <div className="ml-auto flex shrink-0 items-center gap-1.5">
                      {/* Presence */}
                      <div className="hidden 2xl:block">
                        <CollabHeader />
                      </div>
                      <Button
                        size="sm"
                        onClick={() => setIsPreviewMode(true)}
                        disabled={launchingPreview}
                        className="h-8 gap-1.5 px-2.5 text-xs"
                      >
                        <Eye className="size-3.5" /> Preview
                      </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8 gap-1.5 px-2.5 text-xs">
                          <Share2 className="size-3.5" /> Share
                          <ChevronDown className="size-3.5 opacity-60" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-64">
                        <DropdownMenuItem onClick={() => setActiveTab("settings")}>
                          <Link2 className="w-4 h-4 mr-2" />
                          <div>
                            <div>Participant link</div>
                            <div className="text-xs text-muted-foreground">Publish and copy the interview URL</div>
                          </div>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setAssignOpen(true)}>
                          <UserPlus className="w-4 h-4 mr-2" />
                          <div>
                            <div>Assign interview</div>
                            <div className="text-xs text-muted-foreground">Send work to a client or team member</div>
                          </div>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setShareOpen(true)}>
                          <Users className="w-4 h-4 mr-2" />
                          <div>
                            <div>Team access</div>
                            <div className="text-xs text-muted-foreground">Control who can view or edit</div>
                          </div>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setExportOpen(true)}>
                          <Download className="w-4 h-4 mr-2" />
                          <div>
                            <div>Download a copy</div>
                            <div className="text-xs text-muted-foreground">Export the design as a portable file</div>
                          </div>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                      {/* Panel toggles: one segmented group, not two more
                          outline buttons competing with the real actions. */}
                      <div className="ml-1 flex items-center rounded-md border border-input p-0.5">
                        <PanelToggleButton
                          label="Logic"
                          icon={GitGraph}
                          pressed={logicPanelOpen}
                          onClick={() => setLogicPanelOpen(!logicPanelOpen)}
                        />
                        <div aria-hidden="true" className="mx-0.5 h-4 w-px bg-border" />
                        <PanelToggleButton
                          label="AI Assist"
                          icon={Sparkles}
                          pressed={aiPanelOpen}
                          onClick={() => setAiPanelOpen(!aiPanelOpen)}
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <BuilderTabNav
                  activeTab={activeTab}
                  onTabChange={setActiveTab}
                />
              </div>
              {/* Content */}
              <BuilderTabPanel activeTab={activeTab} tab="pages">
                {activeTab === "pages" && (
                  <PagesTab workflowId={workflowId} mode={mode} />
                )}
              </BuilderTabPanel>
              <BuilderTabPanel activeTab={activeTab} tab="map">
                {activeTab === "map" && (
                  <MapTab workflowId={workflowId} />
                )}
              </BuilderTabPanel>
              <BuilderTabPanel activeTab={activeTab} tab="templates">
                {activeTab === "templates" && (
                  <TemplatesTab workflowId={workflowId} />
                )}
              </BuilderTabPanel>
              <BuilderTabPanel activeTab={activeTab} tab="data-sources">
                {activeTab === "data-sources" && (
                  <DataSourcesTab
                    workflowId={workflowId}
                    onCollectionsClick={() => setCollectionsDrawerOpen(true)}
                  />
                )}
              </BuilderTabPanel>
              <BuilderTabPanel activeTab={activeTab} tab="review">
                {activeTab === "review" && (
                  <ReviewTab workflowId={workflowId} />
                )}
              </BuilderTabPanel>
              <BuilderTabPanel activeTab={activeTab} tab="snapshots">
                {activeTab === "snapshots" && (
                  <SnapshotsTab workflowId={workflowId} />
                )}
              </BuilderTabPanel>
              <BuilderTabPanel activeTab={activeTab} tab="settings">
                {activeTab === "settings" && (
                  <SettingsTab workflowId={workflowId} />
                )}
              </BuilderTabPanel>
              <CollectionsDrawer
                open={collectionsDrawerOpen}
                onOpenChange={setCollectionsDrawerOpen}
                workflowId={workflowId}
              />
              <ResourceAccessDialog
                open={shareOpen}
                onOpenChange={setShareOpen}
                resourceType="workflow"
                resourceId={workflowId}
                resourceName={workflow.title}
                ownerType={workflow.ownerType}
                ownerUuid={workflow.ownerUuid}
              />
              <AssignInterviewDialog
                open={assignOpen}
                onOpenChange={setAssignOpen}
                workflowId={workflowId}
                tenantId={user?.tenantId ?? undefined}
              />
              <ExportWorkflowDialog
                open={exportOpen}
                onOpenChange={setExportOpen}
                workflowId={workflowId}
                workflowTitle={workflow.title}
              />
              {/* Versioning Components */}
              <VersionHistoryPanel
                workflowId={workflowId}
                isOpen={historyOpen}
                onClose={() => setHistoryOpen(false)}
                onRestore={(v) => {
                  void restoreMutation.mutateAsync({
                    workflowId: workflowId,
                    versionId: v.id,
                  });
                }}
                onDiff={handleDiff}
              />
              <DiffViewer
                workflowId={workflowId}
                version1={diffBaseVersion}
                version2={diffTargetVersion}
                isOpen={diffOpen}
                onClose={() => setDiffOpen(false)}
              />
              <LogicInspectorPanel
                workflowId={workflowId}
                currentWorkflow={workflow}
                isOpen={logicPanelOpen}
                onClose={() => setLogicPanelOpen(false)}
              />
              <FeedbackWidget className="absolute bottom-6 right-6" />
            </div>
          }
          rightPanel={
            // The panel drives the server-side ops pipeline, which reads the
            // workflow itself — no client-shaped workflow payload needed.
            <AiConversationPanel
              workflowId={workflowId}
              initialPrompt={searchParams.get("prompt") ?? undefined}
            />
          }
        />
      </>
    </CollaborationProvider>
  );
}
/** 1px hairline separating toolbar clusters — one treatment, used everywhere. */
function ToolbarDivider() {
  return <div aria-hidden="true" className="mx-1.5 h-5 w-px shrink-0 bg-border" />;
}

/**
 * Icon-only toggle for a side panel. Icon-only keeps the toolbar on one row at
 * ~1150px of centre panel; the label survives in the tooltip and aria-label,
 * and `aria-pressed` reports on/off to assistive tech (the old variant swap
 * conveyed it by colour alone).
 */
function PanelToggleButton(props: {
  label: string;
  icon: ComponentType<{ className?: string }>;
  pressed: boolean;
  onClick: () => void;
}) {
  const { label, pressed, onClick } = props;
  const Icon = props.icon;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-pressed={pressed}
          aria-label={label}
          onClick={onClick}
          className={cn(
            "size-7 rounded-sm",
            pressed && "bg-accent text-accent-foreground",
          )}
        >
          <Icon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {pressed ? `Hide ${label}` : `Show ${label}`}
      </TooltipContent>
    </Tooltip>
  );
}

function CollabHeader() {
  const { users } = useCollaboration();
  return <PresenceAvatars users={users} />;
}
function CollabSync({ mode }: { mode: "easy" | "advanced" }) {
  const { updateMode } = useCollaboration();
  useEffect(() => {
    void updateMode(mode);
  }, [mode, updateMode]);
  return null;
}
