import { Star, Award } from "lucide-react";
import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Bar } from "recharts";

import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";


import { FeedbackStats } from "./types";
import { getRatingColor, getQualityColor } from "./utils";

interface OperationsTabProps {
    byOperationType: FeedbackStats['byOperationType'];
}

export function OperationsTab({ byOperationType }: OperationsTabProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Performance by Operation Type</CardTitle>
                <CardDescription>Compare AI performance across different operations</CardDescription>
            </CardHeader>
            <CardContent>
                {byOperationType.length > 0 ? (
                    <div className="space-y-4">
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={byOperationType}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="operationType" />
                                <YAxis yAxisId="left" domain={[0, 5]} />
                                <YAxis yAxisId="right" orientation="right" domain={[0, 100]} />
                                <Tooltip
                                    formatter={(value: number, name: string) => {
                                        if (name === 'avgRating') { return [value.toFixed(1), 'Avg Rating']; }
                                        if (name === 'avgQualityScore') { return [value?.toFixed(0) || 'N/A', 'Avg Quality']; }
                                        return [value, name];
                                    }}
                                />
                                <Legend />
                                <Bar yAxisId="left" dataKey="avgRating" fill="#f59e0b" name="Avg Rating (1-5)" />
                                <Bar yAxisId="right" dataKey="avgQualityScore" fill="#3b82f6" name="Avg Quality (0-100)" />
                            </BarChart>
                        </ResponsiveContainer>
                        <div className="space-y-2">
                            {byOperationType.map((op) => (
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
    );
}
