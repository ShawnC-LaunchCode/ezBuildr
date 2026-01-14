import { Activity, CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { analyticsAPI, ApiAnalyticsHealth } from '../../lib/vault-api';

interface Props {
    workflowId: string;
    versionId?: string;
    className?: string;
}

export const WorkflowHealthPanel: React.FC<Props> = ({ workflowId, versionId, className }) => {
    const [stats, setStats] = useState<ApiAnalyticsHealth | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadStats();
    }, [workflowId, versionId]);

    const loadStats = async () => {
        try {
            setLoading(true);
            const data = await analyticsAPI.getHealth(workflowId, versionId);
            setStats(data);
        } catch (err) {
            console.error("Failed to load health stats", err);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {return <div className="p-4 text-center text-gray-500 animate-pulse">Loading insights...</div>;}
    if (!stats) {return <div className="p-4 text-center text-gray-500">No insights available</div>;}

    return (
        <div className={`grid grid-cols-2 sm:grid-cols-4 gap-4 ${className || ''}`}>
            <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex flex-col items-center justify-center text-center">
                <div className="p-2 bg-blue-50 rounded-full mb-2">
                    <Activity size={20} className="text-blue-600" />
                </div>
                <div className="text-2xl font-bold text-gray-900">{stats.totalRuns}</div>
                <div className="text-xs text-gray-500 font-medium uppercase tracking-wide">Total Runs</div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex flex-col items-center justify-center text-center">
                <div className="p-2 bg-green-50 rounded-full mb-2">
                    <CheckCircle size={20} className="text-green-600" />
                </div>
                <div className="text-2xl font-bold text-gray-900">{Math.round(stats.completionRate)}%</div>
                <div className="text-xs text-gray-500 font-medium uppercase tracking-wide">Completion</div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex flex-col items-center justify-center text-center">
                <div className="p-2 bg-purple-50 rounded-full mb-2">
                    <Clock size={20} className="text-purple-600" />
                </div>
                <div className="text-2xl font-bold text-gray-900">{Math.round(stats.avgTimeMs / 1000)}s</div>
                <div className="text-xs text-gray-500 font-medium uppercase tracking-wide">Avg Time</div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex flex-col items-center justify-center text-center">
                <div className={`p-2 rounded-full mb-2 ${stats.errorRate > 10 ? 'bg-red-50' : 'bg-gray-50'}`}>
                    <AlertTriangle size={20} className={stats.errorRate > 10 ? 'text-red-600' : 'text-gray-400'} />
                </div>
                <div className={`text-2xl font-bold ${stats.errorRate > 10 ? 'text-red-600' : 'text-gray-900'}`}>
                    {Math.round(stats.errorRate)}%
                </div>
                <div className="text-xs text-gray-500 font-medium uppercase tracking-wide">Error Rate</div>
            </div>
        </div>
    );
};
