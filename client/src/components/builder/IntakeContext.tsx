
import { useQuery } from '@tanstack/react-query';
import React, { createContext, useContext, useMemo } from 'react';

import { variableAPI, workflowAPI, type ApiWorkflowVariable, type ApiWorkflow } from '@/lib/vault-api';
import { useWorkflow } from '@/lib/vault-hooks';

interface IntakeContextType {
    upstreamWorkflowId: string | null;
    upstreamWorkflow: ApiWorkflow | null;
    upstreamVariables: ApiWorkflowVariable[];
    isLoading: boolean;
    isIntake: boolean;
}

const IntakeContext = createContext<IntakeContextType | null>(null);

export function IntakeProvider({
    workflowId,
    children
}: {
    workflowId: string;
    children: React.ReactNode
}) {
    // 1. Get current workflow to check config
    const { data: workflow, isLoading: workflowLoading } = useWorkflow(workflowId);
    const intakeConfig = workflow?.intakeConfig || {};
    const isIntake = intakeConfig.isIntake === true;
    const upstreamWorkflowId = intakeConfig.upstreamWorkflowId || null;

    // 2. Fetch upstream workflow details (if linked)
    const { data: upstreamWorkflow, isLoading: upstreamWfLoading } = useQuery({
        queryKey: ['workflow', upstreamWorkflowId],
        queryFn: () => workflowAPI.get(upstreamWorkflowId),
        enabled: !!upstreamWorkflowId,
        staleTime: 1000 * 60 * 5, // 5 mins
    });

    // 3. Fetch upstream variables (if linked)
    const { data: upstreamVariables, isLoading: varsLoading } = useQuery({
        queryKey: ['workflow', upstreamWorkflowId, 'variables'],
        queryFn: () => variableAPI.list(upstreamWorkflowId),
        enabled: !!upstreamWorkflowId,
    });

    const value = useMemo(() => ({
        upstreamWorkflowId,
        upstreamWorkflow: upstreamWorkflow || null,
        upstreamVariables: upstreamVariables || [],
        isLoading: workflowLoading || upstreamWfLoading || varsLoading,
        isIntake
    }), [upstreamWorkflowId, upstreamWorkflow, upstreamVariables, workflowLoading, upstreamWfLoading, varsLoading, isIntake]);

    return (
        <IntakeContext.Provider value={value}>
            {children}
        </IntakeContext.Provider>
    );
}

export function useIntake() {
    const context = useContext(IntakeContext);
    if (!context) {
        throw new Error('useIntake must be used within an IntakeProvider');
    }
    return context;
}
