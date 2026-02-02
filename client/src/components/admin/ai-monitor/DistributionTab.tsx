import { Star } from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { FeedbackStats } from "./types";
import { COLORS } from "./utils";

interface DistributionTabProps {
    statsData: FeedbackStats;
    ratingChartData: Array<{ name: string; value: number; rating: number }>;
}

export function DistributionTab({ statsData, ratingChartData }: DistributionTabProps) {
    return (
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
                                {ratingChartData.map((_entry, index) => (
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
                                const ratingNum = Number(rating);
                                const percentage = statsData.totalFeedback > 0
                                    ? (count / statsData.totalFeedback) * 100
                                    : 0;
                                return (
                                    <div key={rating} className="space-y-1">
                                        <div className="flex items-center justify-between text-sm">
                                            <div className="flex items-center gap-2">
                                                <Star className={cn('h-4 w-4', ratingNum >= 4 ? 'fill-yellow-400 text-yellow-400' : 'text-gray-400')} />
                                                <span>{rating} Stars</span>
                                            </div>
                                            <span className="text-muted-foreground">{count} ({percentage.toFixed(0)}%)</span>
                                        </div>
                                        <div className="w-full bg-muted rounded-full h-2">
                                            <div
                                                className={cn('h-2 rounded-full', ratingNum >= 4 ? 'bg-green-500' : ratingNum === 3 ? 'bg-yellow-500' : 'bg-red-500')}
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
    );
}
