import { useQuery } from "@tanstack/react-query";
import {
  FileText, PlayCircle, TrendingUp, Percent, History,
  Home, PieChart, Settings, Zap, Plus,
  BarChart3, Download, Clock, ExternalLink, Sparkles, Wand2, Database
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { Link } from "wouter";

import AIHeroCard from "@/components/AIHeroCard";
import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import { QuickActionButton } from "@/components/shared/QuickActionButton";
import { SkeletonList } from "@/components/shared/SkeletonList";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import StatsCard from "@/components/ui/stats-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

import type { Workflow } from "@shared/schema";

interface DashboardStats {
  totalWorkflows: number;
  draftWorkflows: number;
  activeWorkflows: number;
  archivedWorkflows: number;
  totalRuns: number;
  completedRuns: number;
  inProgressRuns: number;
}

export default function Dashboard() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");

  // Analytics tracking helper
  const track = (name: string, props?: Record<string, any>) => {
    try {
      fetch("/api/analytics/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ event: name, data: props || {} })
      }).catch(() => { }); // Silent fail for analytics
    } catch { }
  };

  // Redirect to home if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/";
      }, 500);
      return;
    }
  }, [isAuthenticated, isLoading, toast]);

  // Comprehensive dashboard data queries
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
    retry: false,
  });

  const { data: workflows, isLoading: workflowsLoading, refetch: refetchWorkflows } = useQuery<Workflow[]>({
    queryKey: ["/api/workflows"],
    retry: false,
  });

  const handleDataUpdate = () => {
    refetchStats();
    refetchWorkflows();
  };

  if (isLoading || !isAuthenticated) {
    return null;
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />

      <main className="flex-1 flex flex-col overflow-hidden">
        <Header
          title="Dashboard"
          description="Workflow automation platform analytics and management"
        />

        <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
          {/* AI Availability Banner */}
          <div className="bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/20">
                <Sparkles className="h-4 w-4 text-indigo-500" />
              </span>
              <div>
                <h3 className="font-medium text-foreground">AI Generated Workflows Coming Soon</h3>
                <p className="text-sm text-muted-foreground">Full AI generation capabilities will be available in early January.</p>
              </div>
            </div>
            <Link href="/workflows/new">
              <Button variant="outline" size="sm" className="hidden sm:flex">
                Get Ready
              </Button>
            </Link>
          </div>

          {/* AI Hero Card */}
          <AIHeroCard
            onAIClick={() => track("ai_workflow_entry_clicked", { source: "dashboard_hero" })}
            onBlankClick={() => track("new_workflow_blank_clicked", { source: "dashboard_hero" })}
          />

          {/* Enhanced Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 sm:gap-6">
            <StatsCard
              title="Total Workflows"
              value={stats?.totalWorkflows ?? 0}
              icon={FileText}
              iconColor="text-primary"
              change={`${stats?.draftWorkflows ?? 0} drafts`}
              changeLabel="pending"
              isLoading={statsLoading}
            />

            <StatsCard
              title="Active Workflows"
              value={stats?.activeWorkflows ?? 0}
              icon={PlayCircle}
              iconColor="text-success"
              change={`${stats?.archivedWorkflows ?? 0} archived`}
              changeLabel="total"
              isLoading={statsLoading}
            />

            <StatsCard
              title="Total Runs"
              value={stats?.totalRuns ?? 0}
              icon={TrendingUp}
              iconColor="text-foreground"
              change={`${stats?.completedRuns ?? 0}  completed`}
              changeLabel="volume"
              isLoading={statsLoading}
            />

            <StatsCard
              title="In Progress"
              value={stats?.inProgressRuns ?? 0}
              icon={History}
              iconColor="text-accent"
              change="currently"
              changeLabel="rurnning"
              isLoading={statsLoading}
            />
          </div>

          {/* Comprehensive Dashboard Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4 sm:space-y-6">
            <TabsList className="grid w-full grid-cols-3 h-auto">
              <TabsTrigger value="overview" data-testid="tab-overview" className="text-xs sm:text-sm px-2 sm:px-4 py-2">
                <Home className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Overview</span>
                <span className="sm:hidden">Home</span>
              </TabsTrigger>
              <TabsTrigger value="management" data-testid="tab-management" className="text-xs sm:text-sm px-2 sm:px-4 py-2">
                <Settings className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Management</span>
                <span className="sm:hidden">Manage</span>
              </TabsTrigger>
              <TabsTrigger value="activity" data-testid="tab-activity" className="text-xs sm:text-sm px-2 sm:px-4 py-2">
                <History className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                Activity
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4 sm:space-y-6">
              {/* Quick Actions & Recent Workflows */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                {/* Quick Actions */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <Zap className="mr-2 h-4 w-4 text-primary" />
                      Quick Actions
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 sm:space-y-3">
                    <div className="opacity-50 pointer-events-none grayscale">
                      <QuickActionButton
                        href="#"
                        icon={Wand2}
                        iconColor="text-indigo-600"
                        iconBgColor="bg-indigo-50"
                        label="Generate (Coming Soon)"
                        testId="button-quick-ai-workflow"
                      />
                    </div>

                    <QuickActionButton
                      href="/workflows/new"
                      icon={Plus}
                      iconColor="text-primary"
                      iconBgColor="bg-primary/10"
                      label="Create New Workflow"
                      testId="button-quick-create-workflow"
                      onClick={() => { void track("new_workflow_blank_clicked", { source: "quick_actions" }); }}
                    />

                    <QuickActionButton
                      href="/workflows"
                      icon={Settings}
                      iconColor="text-success"
                      iconBgColor="bg-success/10"
                      label="Manage Workflows"
                      testId="button-quick-manage-workflows"
                    />

                    <QuickActionButton
                      href="/runs"
                      icon={BarChart3}
                      iconColor="text-foreground"
                      iconBgColor="bg-accent"
                      label="View All Runs"
                      testId="button-quick-view-runs"
                    />

                    <QuickActionButton
                      icon={Download}
                      iconColor="text-warning"
                      iconBgColor="bg-warning/10"
                      label="Export Data"
                      testId="button-quick-export-data"
                    />
                  </CardContent>
                </Card>

                {/* Recent Workflows */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center">
                        <Clock className="mr-2 h-4 w-4 text-primary" />
                        Recent Workflows
                      </CardTitle>
                      <Link href="/workflows" className="text-sm text-primary hover:text-primary/80 font-medium">
                        View all
                      </Link>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {workflowsLoading ? (
                      <SkeletonList count={3} showAvatar />
                    ) : workflows && workflows.length > 0 ? (
                      <div className="space-y-2 sm:space-y-3">
                        {workflows.slice(0, 4).map((workflow) => {
                          const targetUrl = workflow.status === 'draft'
                            ? `/builder/${workflow.id}`
                            : `/workflows/${workflow.id}/results`;

                          return (
                            <Link key={workflow.id} href={targetUrl}>
                              <div className="flex items-center justify-between p-2 sm:p-3 border border-border rounded-lg hover:bg-accent/50 transition-colors cursor-pointer" data-testid={`card-recent-workflow-${workflow.id}`}>
                                <div className="flex items-center space-x-2 sm:space-x-3 min-w-0 flex-1">
                                  <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                                    <FileText className="h-4 w-4 text-primary" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <h4 className="font-medium text-sm sm:text-base text-foreground line-clamp-1" data-testid={`text-recent-workflow-title-${workflow.id}`}>
                                      {workflow.title}
                                    </h4>
                                    <p className="text-xs text-muted-foreground">
                                      {workflow.updatedAt ? new Date(workflow.updatedAt).toLocaleDateString() : 'N/A'}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center space-x-1 sm:space-x-2 flex-shrink-0">
                                  <StatusBadge status={workflow.status} />
                                  <ExternalLink className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground hidden sm:block" />
                                </div>
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-6">
                        <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-3">
                          <FileText className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <h4 className="font-medium text-foreground mb-2">No workflows yet</h4>
                        <p className="text-sm text-muted-foreground mb-4">Create your first workflow to get started</p>
                        <Link href="/workflows/new">
                          <Button size="sm" data-testid="button-create-first-workflow">
                            <Plus className="mr-2 h-4 w-4" />
                            Create Workflow
                          </Button>
                        </Link>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>


            <TabsContent value="management" className="space-y-4 sm:space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Workflow Management</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8">
                    <Settings className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground mb-4">Advanced workflow management features coming soon</p>
                    <Link href="/workflows">
                      <Button>Go to Workflows</Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="activity" className="space-y-4 sm:space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Activity Feed</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8">
                    <History className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">Activity tracking for workflows coming soon</p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}