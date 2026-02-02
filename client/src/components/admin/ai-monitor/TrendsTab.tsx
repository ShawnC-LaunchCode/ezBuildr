import { ResponsiveContainer, LineChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Line } from "recharts";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

import { FeedbackStats } from "./types";
import { formatDate } from "./utils";

interface TrendsTabProps {
    timeSeries: FeedbackStats['timeSeries'];
}

export function TrendsTab({ timeSeries }: TrendsTabProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Performance Trends</CardTitle>
                <CardDescription>Daily average ratings and quality scores over time</CardDescription>
            </CardHeader>
            <CardContent>
                {timeSeries.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={timeSeries}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="date" tickFormatter={formatDate} />
                            <YAxis yAxisId="left" domain={[0, 5]} />
                            <YAxis yAxisId="right" orientation="right" domain={[0, 100]} />
                            <Tooltip
                                labelFormatter={formatDate}
                                formatter={(value: number, name: string) => {
                                    if (name === 'avgRating') { return [value.toFixed(1), 'Avg Rating']; }
                                    if (name === 'avgQualityScore') { return [value?.toFixed(0) ?? 'N/A', 'Avg Quality']; }
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
    );
}
