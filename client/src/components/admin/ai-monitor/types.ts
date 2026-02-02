export interface FeedbackStats {
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

export interface RecentFeedback {
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

export interface StatsApiResponse {
    stats: FeedbackStats;
}

export interface FeedbackApiResponse {
    feedback: RecentFeedback[];
}
