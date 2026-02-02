import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { FeedbackStats } from "./types";
import { getRatingColor, getQualityColor } from "./utils";

interface ProvidersTabProps {
    byProvider: FeedbackStats['byProvider'];
}

export function ProvidersTab({ byProvider }: ProvidersTabProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Performance by AI Provider</CardTitle>
                <CardDescription>Compare different AI providers and models</CardDescription>
            </CardHeader>
            <CardContent>
                {byProvider.length > 0 ? (
                    <div className="space-y-3">
                        {byProvider.map((provider) => (
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
    );
}
