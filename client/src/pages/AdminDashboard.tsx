import { useQuery } from "@tanstack/react-query";
import { Users, FileText, BarChart, CheckCircle, Shield, TrendingUp, Database, Trash2 } from "lucide-react";
import React, { useEffect } from "react";

import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
interface AdminStats {
  totalUsers: number;
  adminUsers: number;
  creatorUsers: number;
  totalWorkflows: number;
  activeWorkflows: number;
  draftWorkflows: number;
  archivedWorkflows: number;
  totalRuns: number;
  completedRuns: number;
  inProgressRuns: number;
}
export default function AdminDashboard() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const { data: stats, isLoading: statsLoading, error } = useQuery<AdminStats>({
    queryKey: ["/api/admin/stats"],
    enabled: !!isAuthenticated,
    retry: false,
  });
  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You must be logged in to access this page",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/";
      }, 500);
    }
  }, [isAuthenticated, authLoading, toast]);
  // Show error if access denied (not admin)
  useEffect(() => {
    if (error) {
      toast({
        title: "Access Denied",
        description: "You must be an admin to access this page",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/";
      }, 1000);
    }
  }, [error, toast]);
  if (authLoading || !isAuthenticated || error) {
    return null;
  }
  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header
          title="Admin Dashboard"
          description="System-wide statistics and management"
        />
        <div className="flex-1 overflow-auto p-6 space-y-6">
          {/* Admin Badge */}
          <Card className="bg-gradient-to-r from-purple-500 to-indigo-600 text-white">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold mb-2">Admin Panel</h2>
                  <p className="text-white/90">
                    Logged in as: {user?.firstName} {user?.lastName} ({user?.email})
                  </p>
                </div>
                <Shield className="h-16 w-16 text-white/20" />
              </div>
            </CardContent>
          </Card>
          {/* Stats Grid */}
          {statsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="p-6">
                    <div className="h-20 bg-muted rounded"></div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : stats ? (
            <>
              {/* User Stats */}
              <div>
                <h3 className="text-lg font-semibold mb-4">User Statistics</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Total Users
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <div className="text-3xl font-bold">{stats.totalUsers}</div>
                        <Users className="h-8 w-8 text-primary" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Admin Users
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <div className="text-3xl font-bold text-purple-600">{stats.adminUsers}</div>
                        <Shield className="h-8 w-8 text-purple-600" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Creator Users
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <div className="text-3xl font-bold text-blue-600">{stats.creatorUsers}</div>
                        <Users className="h-8 w-8 text-blue-600" />
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
  // Platform Stats
              <div>
                <h3 className="text-lg font-semibold mb-4">Workflow Statistics</h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <Card className="border-indigo-200 bg-indigo-50/50">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Lifetime Workflows
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <div className="text-3xl font-bold text-indigo-600">{stats.totalWorkflows}</div>
                        <Database className="h-8 w-8 text-indigo-600" />
                      </div>
                      <div className="text-xs text-muted-foreground mt-2">
                        Total created (including deleted)
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Active Workflows
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <div className="text-3xl font-bold text-green-600">{stats.activeWorkflows}</div>
                        <TrendingUp className="h-8 w-8 text-green-600" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Draft Workflows
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <div className="text-3xl font-bold text-yellow-600">{stats.draftWorkflows}</div>
                        <FileText className="h-8 w-8 text-yellow-600" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Archived Workflows
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <div className="text-3xl font-bold text-gray-600">{stats.archivedWorkflows}</div>
                        <Trash2 className="h-8 w-8 text-gray-600" />
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
              {/* Run Stats */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Run Statistics</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Total Runs
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <div className="text-3xl font-bold">{stats.totalRuns}</div>
                        <BarChart className="h-8 w-8 text-primary" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Completed Runs
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <div className="text-3xl font-bold text-green-600">{stats.completedRuns}</div>
                        <CheckCircle className="h-8 w-8 text-green-600" />
                      </div>
                      <div className="text-sm text-muted-foreground mt-2">
                        {stats.totalRuns > 0
                          ? `${((stats.completedRuns / stats.totalRuns) * 100).toFixed(1)}% completion rate`
                          : 'No runs yet'}
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        In Progress
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <div className="text-3xl font-bold text-blue-600">{stats.inProgressRuns}</div>
                        <TrendingUp className="h-8 w-8 text-blue-600" />
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </>
          ) : (
            <Card>
              <CardContent className="p-12 text-center">
                <p className="text-muted-foreground">No statistics available</p>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}