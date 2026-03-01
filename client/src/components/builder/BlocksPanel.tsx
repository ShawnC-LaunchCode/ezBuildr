export interface BlocksPanelProps {
    workflowId: string;
}

export function BlocksPanel({ workflowId: _workflowId }: BlocksPanelProps) {
    return (
        <div className="p-4 text-sm text-muted-foreground">
            Blocks Panel is currently unavailable.
        </div>
    );
}
