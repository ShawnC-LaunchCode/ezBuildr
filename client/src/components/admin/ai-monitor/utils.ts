export const getRatingColor = (rating: number) => {
    if (rating >= 4.5) { return 'text-green-600 dark:text-green-400'; }
    if (rating >= 3.5) { return 'text-blue-600 dark:text-blue-400'; }
    if (rating >= 2.5) { return 'text-yellow-600 dark:text-yellow-400'; }
    return 'text-red-600 dark:text-red-400';
};

export const getQualityColor = (score: number) => {
    if (score >= 80) { return 'text-green-600 dark:text-green-400'; }
    if (score >= 70) { return 'text-yellow-600 dark:text-yellow-400'; }
    return 'text-red-600 dark:text-red-400';
};

export const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export const formatDateTime = (date: Date | string) => {
    return new Date(date).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

export const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];
