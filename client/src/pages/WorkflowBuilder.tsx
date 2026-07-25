/**
 * Workflow Builder - Tabbed interface with Sections, Templates, Data Sources, Settings, Snapshots
 * PR1: Added tab-based navigation structure
 */
import { useQueryClient } from "@tanstack/react-query";
import {
  Eye,
  ChevronDown,
  ArrowLeft,
  Database,
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
import { useParams, useLocation } from "wouter";

import { ActivateToggle } from "@/components/builder/ActivateToggle";
import { AssignInterviewDialog } from "@/components/builder/AssignInterviewDialog";
import { ResourceAccessDialog } from "@/components/access/ResourceAccessDialog";
import { AiConversationPanel } from "@/components/builder/ai/AiConversationPanel";
import { CollectionsDrawer } from "@/components/builder/data-sources/CollectionsDrawer";
import { IntakeProvider } from "@/components/builder/IntakeContext";
import {
  BuilderTabNav,
  type BuilderTab,
} from "@/components/builder/layout/BuilderTabNav";
import { ResizableBuilderLayout } from "@/components/builder/layout/ResizableBuilderLayout";
import { LogicInspectorPanel } from "@/components/builder/LogicInspectorPanel";
import { AssignmentTab } from "@/components/builder/tabs/AssignmentTab";
import { DataSourcesTab } from "@/components/builder/tabs/DataSourcesTab";
import { ReviewTab } from "@/components/builder/tabs/ReviewTab";
import { SectionsTab } from "@/components/builder/tabs/SectionsTab";
import { SettingsTab } from "@/components/builder/tabs/SettingsTab";
import { SnapshotsTab } from "@/components/builder/tabs/SnapshotsTab";
import { TemplatesTab } from "@/components/builder/tabs/TemplatesTab";
import { DiffViewer } from "@/components/builder/versioning/DiffViewer";
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
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { type ApiWorkflowVersion, authAPI } from "@/lib/vault-api";
import {
  useVersions,
  useRestoreVersion,
  useWorkflow,
  useSetWorkflowMode,
} from "@/lib/vault-hooks";
// eslint-disable-next-line max-lines-per-function, complexity
export default function WorkflowBuilder() {
  const { id: workflowId } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
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
  const { toast } = useToast();
  // State
  const searchParams = new URLSearchParams(window.location.search);
  const [collectionsDrawerOpen, setCollectionsDrawerOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const [diffBaseVersion, setDiffBaseVersion] =
    useState<ApiWorkflowVersion | null>(null);
  const [diffTargetVersion, setDiffTargetVersion] =
    useState<ApiWorkflowVersion | null>(null);
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
  const [activeTab, setActiveTab] = useState<BuilderTab>(
    (searchParams.get("tab") as BuilderTab) ?? "sections",
  );
  const mode = workflowMode?.mode ?? "easy";

  // Sort versions to find latest published
  const versionsArray = Array.isArray(versions) ? versions : [];
  const latestPublished = versionsArray
    .filter((v) => !v.isDraft)
    .sort((a, b) => b.versionNumber - a.versionNumber)[0];
  // Determine label: "Draft" or "vX" (if we were viewing history, but we are always editing draft here)
  const versionLabel =
    latestPublished !== undefined
      ? `Draft (v${latestPublished.versionNumber} +)`
      : "Draft (v1)";
  const handleDiff = (version: ApiWorkflowVersion) => {
    // Diff selected version against CURRENT Draft (which implicitly is the 'latest' state in DB tables)
    const draftVersion = versionsArray.find((v) => v.isDraft);
    if (!draftVersion) {
      toast({
        title: "Error",
        description: "Could not find current draft version.",
      });
      return;
    }
    setDiffBaseVersion(version);
    setDiffTargetVersion(draftVersion);
    setDiffOpen(true);
  };
  // Memoize collaborative user to prevent WebSocket reconnects
  // This MUST be before any early returns to comply with Rules of Hooks
  /* eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- existing logic */
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
      <IntakeProvider workflowId={workflowId}>
        <CollabSync mode={mode} />
        <ResizableBuilderLayout
          workflowId={workflowId}
          rightPanelOpen={aiPanelOpen}
          onRightPanelToggle={setAiPanelOpen}
          leftPanel={<Sidebar className="w-full border-r-0 h-full" />}
          centerPanel={
            <div className="h-screen flex flex-col bg-background">
              {/* Header */}
              <div className="sticky top-0 z-10 bg-background">
                <div className="border-b px-3 py-3 lg:px-6 bg-card">
                  <div className="flex min-w-0 flex-wrap items-center gap-2 lg:gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate("/workflows")}
                      className="shrink-0"
                    >
                      <ArrowLeft className="w-4 h-4 mr-2" /> Back
                    </Button>
                    <h1 className="min-w-0 max-w-[20rem] truncate text-xl font-semibold" title={workflow.title}>
                      {workflow.title}
                    </h1>
                    {!!(
                      workflow.intakeConfig as
                        { isIntake?: boolean } | undefined
                    )?.isIntake && (
                      <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium border border-emerald-200">
                        <Database className="w-3 h-3" />
                        <span>Intake</span>
                      </div>
                    )}
                    {mode === "advanced" && (
                      <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-medium border border-indigo-200">
                        <Sparkles className="w-3 h-3" />
                        <span>Advanced</span>
                      </div>
                    )}
                    {/* Presence */}
                    <div className="ml-1 hidden border-l pl-3 xl:block">
                      <CollabHeader />
                    </div>
                    {/* Version Badge */}
                    <div className="ml-1 border-l pl-3">
                      <VersionBadge
                        versionLabel={versionLabel}
                        isDraft={true}
                        onClick={() => setHistoryOpen(true)}
                      />
                    </div>
                    {/* Mode Selector */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm">
                          {mode === "easy" ? "Easy Mode" : "Advanced Mode"}
                          <ChevronDown className="w-4 h-4 ml-2" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuItem
                          onClick={() => {
                            void setWorkflowModeMutation.mutate({
                              workflowId: workflowId,
                              modeOverride: "easy",
                            });
                          }}
                        >
                          Switch to Easy Mode
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            void setWorkflowModeMutation.mutate({
                              workflowId: workflowId,
                              modeOverride: "advanced",
                            });
                          }}
                        >
                          Switch to Advanced Mode
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <div className="ml-1 border-l pl-3">
                      <ActivateToggle
                        workflowId={workflowId}
                        currentStatus={workflow.status}

                        onStatusChange={(_s) => {
                          void queryClient.invalidateQueries({
                            queryKey: ["workflows"],
                          });
                        }}
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsPreviewMode(true)}
                      disabled={launchingPreview}
                    >
                      <Eye className="w-4 h-4 mr-2" /> Preview
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Share2 className="w-4 h-4 mr-2" /> Share
                          <ChevronDown className="w-4 h-4 ml-2" />
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
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Button
                      variant={aiPanelOpen ? "secondary" : "outline"}
                      size="sm"
                      onClick={() => setAiPanelOpen(!aiPanelOpen)}
                    >
                      <Sparkles className="w-4 h-4 mr-2" /> AI Assist
                    </Button>
                  </div>
                </div>
                <BuilderTabNav
                  workflowId={workflowId}
                  activeTab={activeTab}
                  onTabChange={setActiveTab}
                  isIntake={
                    !!(
                      workflow.intakeConfig as
                        { isIntake?: boolean } | undefined
                    )?.isIntake
                  }
                />
              </div>
              {/* Content */}
              <div className="flex-1 flex flex-col overflow-hidden relative">
                {activeTab === "sections" && (
                  <SectionsTab workflowId={workflowId} mode={mode} />
                )}
                {activeTab === "templates" && (
                  <TemplatesTab workflowId={workflowId} />
                )}
                {activeTab === "data-sources" && (
                  <DataSourcesTab
                    workflowId={workflowId}
                    onCollectionsClick={() => setCollectionsDrawerOpen(true)}
                  />
                )}
                {activeTab === "review" && (
                  <ReviewTab workflowId={workflowId} />
                )}
                {activeTab === "snapshots" && (
                  <SnapshotsTab workflowId={workflowId} />
                )}
                {activeTab === "settings" && (
                  <SettingsTab workflowId={workflowId} />
                )}
                {activeTab === "assignment" && (
                  <AssignmentTab workflowId={workflowId} />
                )}
              </div>
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
      </IntakeProvider>
    </CollaborationProvider>
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
