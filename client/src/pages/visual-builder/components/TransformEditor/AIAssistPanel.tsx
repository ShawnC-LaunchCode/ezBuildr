import React, { useState } from 'react';
import axios from 'axios';

interface AIAssistPanelProps {
    transforms: any[];
    onUpdateTransforms: (t: any[]) => void;
}

export const AIAssistPanel: React.FC<AIAssistPanelProps> = ({ transforms, onUpdateTransforms }) => {
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [mode, setMode] = useState<'generate' | 'revise' | 'debug'>('generate');

    const handleSubmit = async () => {
        if (!input) return;
        setLoading(true);
        try {
            if (mode === 'generate') {
                const res = await axios.post('/api/ai/transform/generate', {
                    description: input,
                    currentTransforms: transforms,
                    workflowContext: {} // Mock context
                });
                onUpdateTransforms([...transforms, ...res.data.updatedTransforms]);
            } else if (mode === 'revise') {
                const res = await axios.post('/api/ai/transform/revise', {
                    userRequest: input,
                    currentTransforms: transforms,
                    workflowContext: {}
                });
                onUpdateTransforms(res.data.updatedTransforms);
            }
            setInput('');
        } catch (e) {
            console.error(e);
            alert("AI Error");
        } finally {
            setLoading(false);
        }
    };

    const handleDebug = async () => {
        setLoading(true);
        try {
            const res = await axios.post('/api/ai/transform/debug', { transforms });
            alert(`Found ${res.data.issues.length} issues.`);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-full">
            <div className="p-4 border-b">
                <h3 className="font-semibold text-slate-700">AI Assistant</h3>
                <div className="flex text-xs space-x-2 mt-2">
                    <button onClick={() => setMode('generate')} className={`px-2 py-1 rounded ${mode === 'generate' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100'}`}>Generate</button>
                    <button onClick={() => setMode('revise')} className={`px-2 py-1 rounded ${mode === 'revise' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100'}`}>Revise</button>
                </div>
            </div>

            <div className="flex-1 p-4 overflow-y-auto">
                <p className="text-sm text-slate-500 mb-4">
                    {mode === 'generate' && "Describe what you want to transform (e.g. 'Create fullName from first and last')."}
                    {mode === 'revise' && "Describe how to change existing transforms."}
                </p>

                <button onClick={handleDebug} className="w-full mb-4 bg-orange-100 text-orange-700 py-1 rounded text-sm hover:bg-orange-200">
                    Check for Issues
                </button>
            </div>

            <div className="p-4 border-t">
                <textarea
                    className="w-full border rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    rows={3}
                    placeholder="Ask AI..."
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSubmit()}
                />
                <button
                    disabled={loading}
                    onClick={handleSubmit}
                    className="w-full mt-2 bg-indigo-600 text-white py-2 rounded text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                    {loading ? 'Thinking...' : 'Submit'}
                </button>
            </div>
        </div>
    );
};
