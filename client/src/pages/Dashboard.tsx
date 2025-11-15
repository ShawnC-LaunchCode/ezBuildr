import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import type { DashboardStats, Survey, SurveyAnalytics, ResponseTrend, ActivityItem } from "@shared/schema";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import StatsCard from "@/components/ui/stats-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { SkeletonList } from "@/components/shared/SkeletonList";
import { QuickActionButton } from "@/components/shared/QuickActionButton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AnalyticsCharts } from "@/components/dashboard/AnalyticsCharts";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { SurveyManagement } from "@/components/dashboard/SurveyManagement";
import AIHeroCard from "@/components/AIHeroCard";
import { Link } from "wouter";
import {
  FileText, PlayCircle, TrendingUp, Percent, History,
  Home, PieChart, Settings, Zap, Plus,
  BarChart3, Download, Clock, ExternalLink, Sparkles, Wand2
} from "lucide-react";

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
      }).catch(() => {}); // Silent fail for analytics
    } catch {}
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

  const { data: surveys, isLoading: surveysLoading, refetch: refetchSurveys } = useQuery<Survey[]>({
    queryKey: ["/api/workflows"],
    retry: false,
  });

  const { data: analytics, isLoading: analyticsLoading } = useQuery<SurveyAnalytics[]>({
    queryKey: ["/api/dashboard/analytics"],
    retry: false,
  });

  const { data: trends, isLoading: trendsLoading } = useQuery<ResponseTrend[]>({
    queryKey: ["/api/dashboard/trends"],
    retry: false,
  });

  const { data: activity, isLoading: activityLoading } = useQuery<ActivityItem[]>({
    queryKey: ["/api/dashboard/activity"],
    retry: false,
  });

  const handleDataUpdate = () => {
    refetchStats();
    refetchSurveys();
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
          {/* AI Hero Card */}
          <AIHeroCard
            onAIClick={() => track("ai_workflow_entry_clicked", { source: "dashboard_hero" })}
            onBlankClick={() => track("new_workflow_blank_clicked", { source: "dashboard_hero" })}
          />

          {/* Enhanced Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 sm:gap-6">
            <StatsCard
              title="Total Workflows"
              value={stats?.totalSurveys ?? 0}
              icon={FileText}
              iconColor="text-primary"
              change={`${stats?.draftSurveys ?? 0} drafts`}
              changeLabel="pending"
              isLoading={statsLoading}
            />

            <StatsCard
              title="Active Workflows"
              value={stats?.activeSurveys ?? 0}
              icon={PlayCircle}
              iconColor="text-success"
              change={`${stats?.closedSurveys ?? 0} archived`}
              changeLabel="total"
              isLoading={statsLoading}
            />

            <StatsCard
              title="Total Runs"
              value={stats?.totalResponses ?? 0}
              icon={TrendingUp}
              iconColor="text-foreground"
              change={`${stats?.avgResponsesPerSurvey ?? 0}/workflow`}
              changeLabel="average"
              isLoading={statsLoading}
            />
            
            <StatsCard
              title="Completion Rate"
              value={`${stats?.completionRate ?? 0}%`}
              icon={Percent}
              iconColor="text-warning"
              change={stats?.totalResponses && stats.totalResponses > 0 ? "good" : "no data"}
              changeLabel="performance"
              isLoading={statsLoading}
            />

            <StatsCard
              title="Recent Activity"
              value={stats?.recentActivity?.length ?? 0}
              icon={History}
              iconColor="text-accent"
              change="today"
              changeLabel="events"
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
              {/* Quick Actions & Recent Surveys */}
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
                    <QuickActionButton
                      href="/ai-survey"
                      icon={Wand2}
                      iconColor="text-indigo-600"
                      iconBgColor="bg-indigo-50"
                      label="Generate with AI"
                      testId="button-quick-ai-workflow"
                      onClick={() => track("ai_workflow_entry_clicked", { source: "quick_actions" })}
                    />

                    <QuickActionButton
                      href="/workflows/new"
                      icon={Plus}
                      iconColor="text-primary"
                      iconBgColor="bg-primary/10"
                      label="Create New Workflow"
                      testId="button-quick-create-workflow"
                      onClick={() => track("new_workflow_blank_clicked", { source: "quick_actions" })}
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
                    {surveysLoading ? (
                      <SkeletonList count={3} showAvatar />
                    ) : surveys && surveys.length > 0 ? (
                      <div className="space-y-2 sm:space-y-3">
                        {surveys.slice(0, 4).map((survey) => {
                          // Determine target URL based on workflow status
                          const targetUrl = survey.status === 'draft'
                            ? `/builder/${survey.id}`
                            : `/workflows/${survey.id}/results`;

                          return (
                            <Link key={survey.id} href={targetUrl}>
                              <div className="flex items-center justify-between p-2 sm:p-3 border border-border rounded-lg hover:bg-accent/50 transition-colors cursor-pointer" data-testid={`card-recent-workflow-${survey.id}`}>
                                <div className="flex items-center space-x-2 sm:space-x-3 min-w-0 flex-1">
                                  <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                                    <FileText className="h-4 w-4 text-primary" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <h4 className="font-medium text-sm sm:text-base text-foreground line-clamp-1" data-testid={`text-recent-workflow-title-${survey.id}`}>
                                      {survey.title}
                                    </h4>
                                    <p className="text-xs text-muted-foreground">
                                      {survey.updatedAt ? new Date(survey.updatedAt).toLocaleDateString() : 'N/A'}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center space-x-1 sm:space-x-2 flex-shrink-0">
                                  <StatusBadge status={survey.status} />
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
              <SurveyManagement
                surveys={surveys || []}
                isLoading={surveysLoading}
                onSurveyUpdate={handleDataUpdate}
              />
            </TabsContent>

            <TabsContent value="activity" className="space-y-4 sm:space-y-6">
              <ActivityFeed
                activities={activity || []}
                isLoading={activityLoading}
              />
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}