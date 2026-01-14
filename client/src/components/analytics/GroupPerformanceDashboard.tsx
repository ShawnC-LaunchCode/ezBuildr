import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Loader2, Download, TrendingUp, Users, CheckCircle2, Clock } from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  LineChart,
  Line,
  CartesianGrid,
  ResponsiveContainer,
  Legend
} from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";


interface GroupStat {
  group: string;
  sent: number;
  completed: number;
  in_progress: number;
  not_started: number;
  completion_rate: number;
}

interface TrendData {
  day: string;
  completions: number;
}

interface SummaryStats {
  totalRecipients: number;
  totalCompleted: number;
  totalInProgress: number;
  totalNotStarted: number;
  overallCompletionRate: number;
  totalGroups: number;
}

interface GroupAnalyticsData {
  groups: GroupStat[];
  trend: TrendData[];
  summary: SummaryStats;
}

interface GroupPerformanceDashboardProps {
  surveyId: string;
}

export function GroupPerformanceDashboard({ surveyId }: GroupPerformanceDashboardProps) {
  const { data, isLoading, error } = useQuery<GroupAnalyticsData>({
    queryKey: [`/api/surveys/${surveyId}/analytics/groups`],
    enabled: !!surveyId,
    refetchInterval: 60000, // Refresh every 60 seconds
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="text-4xl mb-3">⚠️</div>
        <p className="text-lg font-medium">Failed to load group analytics</p>
        <p className="text-sm text-muted-foreground">Please try again later</p>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const { groups, trend, summary } = data;

  // Chart colors
  const colors = ["#3b82f6", "#16a34a", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899"];

  // Empty state
  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
        <div className="text-4xl mb-3">📊</div>
        <p className="text-lg font-medium">No group data available</p>
        <p className="text-sm mb-4">Recipients need to be organized into groups to see analytics.</p>
      </div>
    );
  }

  // Prepare pie chart data
  const pieData = groups.map(g => ({
    name: g.group,
    value: g.completed
  }));

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Overall Completion</p>
                  <p className="text-3xl font-bold text-green-600">{summary.overallCompletionRate}%</p>
                </div>
                <div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <CheckCircle2 className="h-6 w-6 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Recipients</p>
                  <p className="text-3xl font-bold">{summary.totalRecipients}</p>
                </div>
                <div className="h-12 w-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <Users className="h-6 w-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Completed</p>
                  <p className="text-3xl font-bold">{summary.totalCompleted}</p>
                </div>
                <div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <TrendingUp className="h-6 w-6 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.3 }}
        >
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">In Progress</p>
                  <p className="text-3xl font-bold">{summary.totalInProgress}</p>
                </div>
                <div className="h-12 w-12 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
                  <Clock className="h-6 w-6 text-yellow-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Charts Row 1: Pie Chart and Completion Rate */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Group Distribution</CardTitle>
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.open(`/api/surveys/${surveyId}/export?format=csv&scope=groups`, "_blank")}
            >
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                >
                  {pieData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Completion Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {groups.map((group, index) => (
                <div key={group.group} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{group.group}</span>
                    <span className="text-muted-foreground">{group.completion_rate}%</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                    <motion.div
                      className="h-full"
                      style={{ backgroundColor: colors[index % colors.length] }}
                      initial={{ width: 0 }}
                      animate={{ width: `${group.completion_rate}%` }}
                      transition={{ duration: 0.7, delay: index * 0.1 }}
                    />
                  </div>
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>✅ {group.completed}</span>
                    <span>🔄 {group.in_progress}</span>
                    <span>⏸️ {group.not_started}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2: Bar Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Completion by Group</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={groups}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="group" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="completed" fill="#16a34a" name="Completed" />
              <Bar dataKey="in_progress" fill="#3b82f6" name="In Progress" />
              <Bar dataKey="not_started" fill="#f59e0b" name="Not Started" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Charts Row 3: Trend Line Chart */}
      {trend.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Completion Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="completions"
                  stroke="#10b981"
                  strokeWidth={3}
                  name="Completions"
                  dot={{ fill: "#10b981", r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
