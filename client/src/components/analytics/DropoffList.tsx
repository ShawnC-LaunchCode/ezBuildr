import { Users, UserMinus } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { analyticsAPI, ApiDropoffStep } from '../../lib/vault-api';

interface Props {
    workflowId: string;
    versionId: string;
    className?: string;
}

export const DropoffList: React.FC<Props> = ({ workflowId, versionId, className }) => {
    const [funnel, setFunnel] = useState<ApiDropoffStep[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadFunnel();
    }, [workflowId, versionId]);

    const loadFunnel = async () => {
        try {
            setLoading(true);
            const data = await analyticsAPI.getDropoff(workflowId, versionId);
            setFunnel(data);
        } catch (err) {
            console.error("Failed to load dropoff funnel", err);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {return <div className="p-4 text-center text-gray-400 animate-pulse">Loading funnel...</div>;}
    if (!funnel || funnel.length === 0) {return <div className="p-4 text-center text-gray-500">No dropoff data available</div>;}

    const maxViews = Math.max(...funnel.map(s => s.views), 1);

    return (
        <div className={`bg-white rounded-xl border border-gray-100 shadow-sm p-6 ${className || ''}`}>
            <h3 className="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-2">
                <Users className="text-blue-500" size={20} />
                User Flow & Dropoff
            </h3>

            <div className="space-y-6">
                {funnel.map((step, index) => {
                    const isLast = index === funnel.length - 1;
                    const dropoffSeverity = step.dropoffRate > 20 ? 'high' : step.dropoffRate > 10 ? 'med' : 'low';
                    const barColor = dropoffSeverity === 'high' ? 'bg-red-500' : 'bg-blue-500';

                    return (
                        <div key={step.stepId} className="relative">
                            {/* Step Info */}
                            <div className="flex justify-between items-end mb-2">
                                <div className="flex flex-col">
                                    <span className="font-medium text-gray-800 text-sm truncate max-w-[200px]" title={step.stepTitle}>
                                        {step.stepTitle}
                                    </span>
                                </div>
                                <div className="flex flex-col items-end">
                                    <span className="text-sm font-bold text-gray-900">{step.views}</span>
                                    <span className="text-xs text-gray-400">views</span>
                                </div>
                            </div>

                            {/* Visualization Bar */}
                            <div className="h-3 bg-gray-50 rounded-full overflow-hidden w-full flex">
                                <div
                                    className={`h-full ${barColor} opacity-90 transition-all duration-500`}
                                    style={{ width: `${(step.views / maxViews) * 100}%` }}
                                />
                            </div>

                            {/* Dropoff Indicator */}
                            {step.dropoffs > 0 && (
                                <div className="flex justify-end mt-1">
                                    <div className={`flex items-center gap-1 text-xs ${dropoffSeverity === 'high' ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                                        <UserMinus size={12} />
                                        <span>{step.dropoffs} left here ({Math.round(step.dropoffRate)}%)</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
