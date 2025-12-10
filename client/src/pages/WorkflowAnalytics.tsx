import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
// import { DateRangePicker } from "@/components/ui/date-range-picker"; // component not available
import { Loader2, RefreshCw, Download, BarChart2, GitMerge, Thermometer, Users } from "lucide-react";

// Types
interface AnalyticsOverview {
    totalRuns: number;
    completedRuns: number;
    completionRate: number;
    avgDuration: number;
    totalViews: number;
}

interface DropoffStep {
    stepId: string;
    stepTitle: string;
    views: number;
    dropoffs: number;
    dropoffRate: number;
}

export function WorkflowAnalytics() {
    const { id: workflowId } = useParams();
    const [timeRange, setTimeRange] = useState("30d");

    // Fetch Overview Data
    const { data: overview, isLoading: isLoadingOverview } = useQuery({
        queryKey: ["analytics", workflowId, "overview", timeRange],
        queryFn: async () => {
            const res = await fetch(`/api/analytics/workflow/${workflowId}/overview?range=${timeRange}`);
            if (!res.ok) throw new Error("Failed to fetch overview");
            return res.json() as Promise<AnalyticsOverview>;
        },
        enabled: !!workflowId,
    });

    // Fetch Dropoff Data
    const { data: dropoff, isLoading: isLoadingDropoff } = useQuery({
        queryKey: ["analytics", workflowId, "dropoff", timeRange],
        queryFn: async () => {
            const res = await fetch(`/api/analytics/workflow/${workflowId}/dropoff?range=${timeRange}`);
            if (!res.ok) throw new Error("Failed to fetch dropoff data");
            return res.json() as Promise<DropoffStep[]>;
        },
        enabled: !!workflowId,
    });

    if (!workflowId) return <div>Invalid Workflow ID</div>;

    return (
        <div className="container mx-auto p-8 space-y-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Analytics Dashboard</h1>
                    <p className="text-muted-foreground">
                        Insights and performance metrics for your workflow.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Select value={timeRange} onValueChange={setTimeRange}>
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Select time range" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="7d">Last 7 days</SelectItem>
                            <SelectItem value="30d">Last 30 days</SelectItem>
                            <SelectItem value="90d">Last 90 days</SelectItem>
                            <SelectItem value="all">All time</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button variant="outline" size="icon">
                        <RefreshCw className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon">
                        <Download className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <OverviewCard
                    title="Total Runs"
                    value={overview?.totalRuns}
                    icon={<Users className="h-4 w-4 text-muted-foreground" />}
                    loading={isLoadingOverview}
                />
                <OverviewCard
                    title="Completion Rate"
                    value={overview?.completionRate ? `${(overview.completionRate * 100).toFixed(1)}%` : undefined}
                    icon={<BarChart2 className="h-4 w-4 text-muted-foreground" />}
                    loading={isLoadingOverview}
                />
                <OverviewCard
                    title="Avg. Duration"
                    value={overview?.avgDuration ? `${Math.round(overview.avgDuration / 1000)}s` : undefined}
                    icon={<Thermometer className="h-4 w-4 text-muted-foreground" />}
                    loading={isLoadingOverview}
                />
                <OverviewCard
                    title="Total Views"
                    value={overview?.totalViews}
                    icon={<Users className="h-4 w-4 text-muted-foreground" />}
                    loading={isLoadingOverview}
                />
            </div>

            <Tabs defaultValue="funnel" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="funnel">Conversion Funnel</TabsTrigger>
                    <TabsTrigger value="heatmap">Block Heatmap</TabsTrigger>
                    <TabsTrigger value="network">Branching Network</TabsTrigger>
                </TabsList>

                <TabsContent value="funnel" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Drop-off Analysis</CardTitle>
                            <CardDescription>
                                See where users are abandoning the workflow.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="h-[400px]">
                            {isLoadingDropoff ? (
                                <div className="h-full flex items-center justify-center">
                                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {dropoff?.map((step, index) => (
                                        <div key={step.stepId} className="space-y-2">
                                            <div className="flex justify-between text-sm">
                                                <span>{step.stepTitle}</span>
                                                <span className="text-muted-foreground">{step.views} views ({step.dropoffRate}% drop-off)</span>
                                            </div>
                                            <div className="h-2 bg-secondary rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-primary"
                                                    style={{ width: `${100 - (index * 10)}%` }} // Placeholder visualization
                                                />
                                            </div>
                                        </div>
                                    ))}
                                    {!dropoff?.length && <div className="text-center text-muted-foreground">No data available</div>}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="heatmap">
                    <Card>
                        <CardHeader>
                            <CardTitle>Time on Block</CardTitle>
                            <CardDescription>Average time spent per block.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                                Heatmap Visualization Placeholder
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="network">
                    <Card>
                        <CardHeader>
                            <CardTitle>User Flow</CardTitle>
                            <CardDescription>Most common paths taken by users.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                                Sankey Diagram Placeholder
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}

function OverviewCard({ title, value, icon, loading }: { title: string, value: string | number | undefined, icon: React.ReactNode, loading: boolean }) {
    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                    {title}
                </CardTitle>
                {icon}
            </CardHeader>
            <CardContent>
                {loading ? (
                    <div className="h-8 w-24 bg-secondary animate-pulse rounded" />
                ) : (
                    <div className="text-2xl font-bold">{value ?? "-"}</div>
                )}
            </CardContent>
        </Card>
    );
}
