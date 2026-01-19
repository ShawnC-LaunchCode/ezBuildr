import { useQuery } from '@tanstack/react-query';
import { Loader2, Star, Award, Activity, Users, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import React, { useState } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { apiRequest } from '@/lib/queryClient';
import { cn } from '@/lib/utils';
interface FeedbackStats {
  totalFeedback: number;
  avgRating: number;
  avgQualityScore: number;
  qualityPassRate: number;
  ratingDistribution: Record<string, number>;
  byOperationType: Array<{
    operationType: string;
    count: number;
    avgRating: number;
    avgQualityScore: number | null;
  }>;
  byProvider: Array<{
    provider: string;
    count: number;
    avgRating: number;
    avgQualityScore: number | null;
  }>;
  timeSeries: Array<{
    date: string;
    count: number;
    avgRating: number;
    avgQualityScore: number | null;
  }>;
  period: string;
}
interface RecentFeedback {
  id: string;
  workflowId: string | null;
  userId: string | null;
  operationType: string;
  rating: number;
  comment: string | null;
  aiProvider: string | null;
  aiModel: string | null;
  qualityScore: number | null;
  qualityPassed: boolean | null;
  issuesCount: number | null;
  requestDescription: string | null;
  createdAt: Date;
}
const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];
export function AIPerformanceMonitor() {
  const [timeRange, setTimeRange] = useState('30');
  const [selectedOperationType, setSelectedOperationType] = useState<string | undefined>(undefined);
  // Fetch statistics
  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['/api/admin/ai-settings/feedback/stats', timeRange, selectedOperationType],
    queryFn: async () => {
      const params = new URLSearchParams({ days: timeRange });
      if (selectedOperationType) {params.append('operationType', selectedOperationType);}
      const res = await apiRequest('GET', `/api/admin/ai-settings/feedback/stats?${params}`);
      const data = await res.json();
      return data.stats as FeedbackStats;
    },
  });
  // Fetch recent feedback
  const { data: recentData, isLoading: recentLoading } = useQuery({
    queryKey: ['/api/admin/ai-settings/feedback/recent', selectedOperationType],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '20' });
      if (selectedOperationType) {params.append('operationType', selectedOperationType);}
      const res = await apiRequest('GET', `/api/admin/ai-settings/feedback/recent?${params}`);
      const data = await res.json();
      return data.feedback as RecentFeedback[];
    },
  });
  const getRatingColor = (rating: number) => {
    if (rating >= 4.5) {return 'text-green-600 dark:text-green-400';}
    if (rating >= 3.5) {return 'text-blue-600 dark:text-blue-400';}
    if (rating >= 2.5) {return 'text-yellow-600 dark:text-yellow-400';}
    return 'text-red-600 dark:text-red-400';
  };
  const getQualityColor = (score: number) => {
    if (score >= 80) {return 'text-green-600 dark:text-green-400';}
    if (score >= 70) {return 'text-yellow-600 dark:text-yellow-400';}
    return 'text-red-600 dark:text-red-400';
  };
  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  const formatDateTime = (date: Date | string) => {
    return new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  if (statsLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!statsData) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <Activity className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>No feedback data available</p>
      </div>
    );
  }
  // Prepare rating distribution data for pie chart
  const ratingChartData = Object.entries(statsData.ratingDistribution)
    .reverse()
    .map(([rating, count]) => ({
      name: `${rating} Stars`,
      value: count,
      rating: parseInt(rating),
    }));
  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex items-center gap-4">
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select time range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="365">Last year</SelectItem>
          </SelectContent>
        </Select>
        <Select value={selectedOperationType || 'all'} onValueChange={(v) => setSelectedOperationType(v === 'all' ? undefined : v)}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All operations" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All operations</SelectItem>
            <SelectItem value="generation">Generation</SelectItem>
            <SelectItem value="revision">Revision</SelectItem>
            <SelectItem value="suggestion">Suggestion</SelectItem>
            <SelectItem value="logic">Logic</SelectItem>
            <SelectItem value="optimization">Optimization</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {/* Overview Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Feedback</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statsData.totalFeedback}</div>
            <p className="text-xs text-muted-foreground">{statsData.period}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Rating</CardTitle>
            <Star className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={cn('text-2xl font-bold', getRatingColor(statsData.avgRating))}>
              {statsData.avgRating.toFixed(1)} / 5.0
            </div>
            <div className="flex items-center gap-1 mt-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className={cn(
                    'h-3 w-3',
                    i < Math.round(statsData.avgRating)
                      ? 'fill-yellow-400 text-yellow-400'
                      : 'text-gray-300 dark:text-gray-600'
                  )}
                />
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Quality Score</CardTitle>
            <Award className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={cn('text-2xl font-bold', getQualityColor(statsData.avgQualityScore))}>
              {statsData.avgQualityScore.toFixed(0)} / 100
            </div>
            <p className="text-xs text-muted-foreground">Automated validation</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Quality Pass Rate</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={cn('text-2xl font-bold', statsData.qualityPassRate >= 70 ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400')}>
              {statsData.qualityPassRate.toFixed(0)}%
            </div>
            <p className="text-xs text-muted-foreground">Score ≥ 70</p>
          </CardContent>
        </Card>
      </div>
      {/* Charts */}
      <Tabs defaultValue="trends" className="space-y-4">
        <TabsList>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="distribution">Rating Distribution</TabsTrigger>
          <TabsTrigger value="operations">By Operation</TabsTrigger>
          <TabsTrigger value="providers">By Provider</TabsTrigger>
          <TabsTrigger value="recent">Recent Feedback</TabsTrigger>
        </TabsList>
        {/* Trends Tab */}
        <TabsContent value="trends" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Performance Trends</CardTitle>
              <CardDescription>Daily average ratings and quality scores over time</CardDescription>
            </CardHeader>
            <CardContent>
              {statsData.timeSeries.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={statsData.timeSeries}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tickFormatter={formatDate} />
                    <YAxis yAxisId="left" domain={[0, 5]} />
                    <YAxis yAxisId="right" orientation="right" domain={[0, 100]} />
                    <Tooltip
                      labelFormatter={formatDate}
                      formatter={(value: number, name: string) => {
                        if (name === 'avgRating') {return [value.toFixed(1), 'Avg Rating'];}
                        if (name === 'avgQualityScore') {return [value?.toFixed(0) || 'N/A', 'Avg Quality'];}
                        return [value, name];
                      }}
                    />
                    <Legend />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="avgRating"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      name="Avg Rating (1-5)"
                      dot={{ fill: '#f59e0b' }}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="avgQualityScore"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      name="Avg Quality (0-100)"
                      dot={{ fill: '#3b82f6' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  No trend data available
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        {/* Distribution Tab */}
        <TabsContent value="distribution" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Rating Distribution</CardTitle>
              <CardDescription>Breakdown of user ratings</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={ratingChartData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {ratingChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-3">
                  {Object.entries(statsData.ratingDistribution)
                    .reverse()
                    .map(([rating, count]) => {
                      const percentage = statsData.totalFeedback > 0
                        ? (count / statsData.totalFeedback) * 100
                        : 0;
                      return (
                        <div key={rating} className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <Star className={cn('h-4 w-4', parseInt(rating) >= 4 ? 'fill-yellow-400 text-yellow-400' : 'text-gray-400')} />
                              <span>{rating} Stars</span>
                            </div>
                            <span className="text-muted-foreground">{count} ({percentage.toFixed(0)}%)</span>
                          </div>
                          <div className="w-full bg-muted rounded-full h-2">
                            <div
                              className={cn('h-2 rounded-full', parseInt(rating) >= 4 ? 'bg-green-500' : parseInt(rating) === 3 ? 'bg-yellow-500' : 'bg-red-500')}
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        {/* Operations Tab */}
        <TabsContent value="operations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Performance by Operation Type</CardTitle>
              <CardDescription>Compare AI performance across different operations</CardDescription>
            </CardHeader>
            <CardContent>
              {statsData.byOperationType.length > 0 ? (
                <div className="space-y-4">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={statsData.byOperationType}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="operationType" />
                      <YAxis yAxisId="left" domain={[0, 5]} />
                      <YAxis yAxisId="right" orientation="right" domain={[0, 100]} />
                      <Tooltip
                        formatter={(value: number, name: string) => {
                          if (name === 'avgRating') {return [value.toFixed(1), 'Avg Rating'];}
                          if (name === 'avgQualityScore') {return [value?.toFixed(0) || 'N/A', 'Avg Quality'];}
                          return [value, name];
                        }}
                      />
                      <Legend />
                      <Bar yAxisId="left" dataKey="avgRating" fill="#f59e0b" name="Avg Rating (1-5)" />
                      <Bar yAxisId="right" dataKey="avgQualityScore" fill="#3b82f6" name="Avg Quality (0-100)" />
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="space-y-2">
                    {statsData.byOperationType.map((op) => (
                      <div key={op.operationType} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <div className="flex items-center gap-3">
                          <Badge variant="outline" className="capitalize">{op.operationType}</Badge>
                          <span className="text-sm text-muted-foreground">{op.count} submissions</span>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <div className="flex items-center gap-1">
                            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                            <span className={getRatingColor(op.avgRating)}>{op.avgRating.toFixed(1)}</span>
                          </div>
                          {op.avgQualityScore !== null && (
                            <div className="flex items-center gap-1">
                              <Award className="h-3 w-3 text-blue-500" />
                              <span className={getQualityColor(op.avgQualityScore)}>{op.avgQualityScore.toFixed(0)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  No operation data available
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        {/* Providers Tab */}
        <TabsContent value="providers" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Performance by AI Provider</CardTitle>
              <CardDescription>Compare different AI providers and models</CardDescription>
            </CardHeader>
            <CardContent>
              {statsData.byProvider.length > 0 ? (
                <div className="space-y-3">
                  {statsData.byProvider.map((provider) => (
                    <div key={provider.provider} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col">
                          <span className="font-medium capitalize">{provider.provider}</span>
                          <span className="text-sm text-muted-foreground">{provider.count} submissions</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground mb-1">Rating</div>
                          <div className={cn('text-lg font-semibold', getRatingColor(provider.avgRating))}>
                            {provider.avgRating.toFixed(1)}
                          </div>
                        </div>
                        {provider.avgQualityScore !== null && (
                          <div className="text-center">
                            <div className="text-xs text-muted-foreground mb-1">Quality</div>
                            <div className={cn('text-lg font-semibold', getQualityColor(provider.avgQualityScore))}>
                              {provider.avgQualityScore.toFixed(0)}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-muted-foreground">
                  No provider data available
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        {/* Recent Feedback Tab */}
        <TabsContent value="recent" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Feedback</CardTitle>
              <CardDescription>Latest user feedback submissions</CardDescription>
            </CardHeader>
            <CardContent>
              {recentLoading ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : recentData && recentData.length > 0 ? (
                <div className="space-y-3">
                  {recentData.map((feedback) => (
                    <div key={feedback.id} className="p-4 border rounded-lg space-y-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="capitalize">{feedback.operationType}</Badge>
                          {feedback.aiProvider && (
                            <Badge variant="secondary" className="text-xs capitalize">{feedback.aiProvider}</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star
                                key={i}
                                className={cn(
                                  'h-3 w-3',
                                  i < feedback.rating
                                    ? 'fill-yellow-400 text-yellow-400'
                                    : 'text-gray-300 dark:text-gray-600'
                                )}
                              />
                            ))}
                          </div>
                          {feedback.qualityScore !== null && (
                            <Badge
                              variant={feedback.qualityPassed ? 'default' : 'destructive'}
                              className="text-xs"
                            >
                              {feedback.qualityScore}/100
                            </Badge>
                          )}
                        </div>
                      </div>
                      {feedback.requestDescription && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          "{feedback.requestDescription}"
                        </p>
                      )}
                      {feedback.comment && (
                        <p className="text-sm bg-muted p-2 rounded italic">
                          "{feedback.comment}"
                        </p>
                      )}
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDateTime(feedback.createdAt)}
                        </span>
                        {feedback.issuesCount !== null && feedback.issuesCount > 0 && (
                          <span className="flex items-center gap-1">
                            <AlertCircle className="h-3 w-3 text-yellow-500" />
                            {feedback.issuesCount} issues
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-muted-foreground">
                  No recent feedback available
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}