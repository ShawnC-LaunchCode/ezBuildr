import { useQuery } from '@tanstack/react-query';
import { Loader2, Activity, Users, Star, Award, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { apiRequest } from '@/lib/queryClient';
import { cn } from '@/lib/utils';

// Import sub-components and shared types/utils
import { DistributionTab } from './ai-monitor/DistributionTab';
import { MonitorFilters } from './ai-monitor/MonitorFilters';
import { OperationsTab } from './ai-monitor/OperationsTab';
import { ProvidersTab } from './ai-monitor/ProvidersTab';
import { RecentFeedbackTab } from './ai-monitor/RecentFeedbackTab';
import { TrendsTab } from './ai-monitor/TrendsTab';
import { StatsApiResponse, FeedbackApiResponse } from './ai-monitor/types';
import { getRatingColor, getQualityColor } from './ai-monitor/utils';

export function AIPerformanceMonitor() {
  const [timeRange, setTimeRange] = useState('30');
  const [selectedOperationType, setSelectedOperationType] = useState<string | undefined>(undefined);

  // Fetch statistics
  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['/api/admin/ai-settings/feedback/stats', timeRange, selectedOperationType],
    queryFn: async () => {
      const params = new URLSearchParams({ days: timeRange });
      if (selectedOperationType) { params.append('operationType', selectedOperationType); }
      const res = await apiRequest('GET', `/api/admin/ai-settings/feedback/stats?${params.toString()}`);
      const data = await res.json() as StatsApiResponse;
      return data.stats;
    },
  });

  // Fetch recent feedback
  const { data: recentData, isLoading: recentLoading } = useQuery({
    queryKey: ['/api/admin/ai-settings/feedback/recent', selectedOperationType],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '20' });
      if (selectedOperationType) { params.append('operationType', selectedOperationType); }
      const res = await apiRequest('GET', `/api/admin/ai-settings/feedback/recent?${params.toString()}`);
      const data = await res.json() as FeedbackApiResponse;
      return data.feedback;
    },
  });

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
      <MonitorFilters
        timeRange={timeRange}
        setTimeRange={setTimeRange}
        selectedOperationType={selectedOperationType}
        setSelectedOperationType={setSelectedOperationType}
      />

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

        <TabsContent value="trends" className="space-y-4">
          <TrendsTab timeSeries={statsData.timeSeries} />
        </TabsContent>

        <TabsContent value="distribution" className="space-y-4">
          <DistributionTab statsData={statsData} ratingChartData={ratingChartData} />
        </TabsContent>

        <TabsContent value="operations" className="space-y-4">
          <OperationsTab byOperationType={statsData.byOperationType} />
        </TabsContent>

        <TabsContent value="providers" className="space-y-4">
          <ProvidersTab byProvider={statsData.byProvider} />
        </TabsContent>

        <TabsContent value="recent" className="space-y-4">
          <RecentFeedbackTab recentData={recentData} recentLoading={recentLoading} />
        </TabsContent>
      </Tabs>
    </div>
  );
}