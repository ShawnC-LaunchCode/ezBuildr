import React, { useState } from 'react';
import { AIAssistPanel } from './AIAssistPanel';
import { GraphView } from './GraphView';
import { TransformList } from './TransformList';
import { TransformPlayground } from './TransformPlayground';
export const TransformEditor: React.FC = () => {
    const [viewMode, setViewMode] = useState<'list' | 'graph' | 'playground'>('list');
    // In a real implementation, this would come from a store or context
    const [transforms, setTransforms] = useState<any[]>([]);
    return (
        <div className="flex h-full w-full bg-slate-50">
            <div className="flex-1 flex flex-col">
                <div className="h-12 border-b bg-white flex items-center px-4 justify-between">
                    <h2 className="font-semibold text-slate-700">ETL Transformations</h2>
                    <div className="flex space-x-2">
                        <button onClick={() => setViewMode('list')} className={`px-3 py-1 rounded ${viewMode === 'list' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600'}`}>List</button>
                        <button onClick={() => setViewMode('graph')} className={`px-3 py-1 rounded ${viewMode === 'graph' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600'}`}>Graph</button>
                        <button onClick={() => setViewMode('playground')} className={`px-3 py-1 rounded ${viewMode === 'playground' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600'}`}>Playground</button>
                    </div>
                </div>
                <div className="flex-1 overflow-auto p-4">
                    {viewMode === 'list' && <TransformList transforms={transforms} setTransforms={setTransforms} />}
                    {viewMode === 'graph' && <GraphView transforms={transforms} />}
                    {viewMode === 'playground' && <TransformPlayground transforms={transforms} />}
                </div>
            </div>
            <div className="w-80 border-l bg-white">
                <AIAssistPanel
                    transforms={transforms}
                    onUpdateTransforms={setTransforms}
                />
            </div>
        </div>
    );
};