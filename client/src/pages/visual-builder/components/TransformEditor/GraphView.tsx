import React from 'react';

interface GraphViewProps {
    transforms: any[];
}

export const GraphView: React.FC<GraphViewProps> = ({ transforms }) => {
    return (
        <div className="h-full flex items-center justify-center bg-slate-100 border-2 border-dashed border-slate-300 rounded">
            <div className="text-center">
                <p className="text-slate-500 font-medium">Graph View</p>
                <p className="text-sm text-slate-400 mt-1">Visualization of {transforms.length} nodes.</p>
                <p className="text-xs text-slate-400 mt-2">(React Flow integration would go here)</p>
            </div>
        </div>
    );
};
