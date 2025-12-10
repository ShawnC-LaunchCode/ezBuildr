import React from 'react';

interface TransformListProps {
    transforms: any[];
    setTransforms: (t: any[]) => void;
}

export const TransformList: React.FC<TransformListProps> = ({ transforms, setTransforms }) => {
    return (
        <div className="space-y-2">
            {transforms.length === 0 && (
                <div className="text-center py-10 text-slate-400">
                    No transforms yet. Use AI Assist to generate some.
                </div>
            )}
            {transforms.map((t, idx) => (
                <div key={idx} className="bg-white p-3 rounded shadow border flex justify-between items-center">
                    <div>
                        <span className="font-mono text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded mr-2">{t.type}</span>
                        <span className="font-medium text-slate-800">{t.name}</span>
                        <div className="text-xs text-slate-500 mt-1">
                            Input: {t.inputPaths?.join(', ') || '-'} &rarr; Output: {t.outputPath || '-'}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};
