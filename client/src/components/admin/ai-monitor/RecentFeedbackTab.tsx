import { Loader2, Star, Clock, AlertCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { RecentFeedback } from "./types";
import { formatDateTime } from "./utils";

interface RecentFeedbackTabProps {
    recentData: RecentFeedback[] | undefined;
    recentLoading: boolean;
}

export function RecentFeedbackTab({ recentData, recentLoading }: RecentFeedbackTabProps) {
    return (
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
                                        &ldquo;{feedback.requestDescription}&rdquo;
                                    </p>
                                )}
                                {feedback.comment && (
                                    <p className="text-sm bg-muted p-2 rounded italic">
                                        &ldquo;{feedback.comment}&rdquo;
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
    );
}
