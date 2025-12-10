import React, { useState } from 'react';

interface TransformPlaygroundProps {
    transforms: any[];
}

export const TransformPlayground: React.FC<TransformPlaygroundProps> = () => {
    const [inputJson, setInputJson] = useState('{\n  "firstName": "John",\n  "lastName": "Doe"\n}');

    return (
        <div className="h-full flex flex-col space-y-4">
            <div className="flex-1 border rounded bg-white p-4">
                <h4 className="font-medium text-slate-700 mb-2">Input JSON</h4>
                <textarea
                    className="w-full h-full font-mono text-sm resize-none focus:outline-none"
                    value={inputJson}
                    onChange={e => setInputJson(e.target.value)}
                />
            </div>
            <div className="text-center">
                <button className="bg-green-600 text-white px-4 py-2 rounded">Run Transforms</button>
            </div>
            <div className="flex-1 border rounded bg-slate-50 p-4">
                <h4 className="font-medium text-slate-700 mb-2">Output Preview</h4>
                <pre className="font-mono text-sm text-slate-600">
                    {/* Output would go here */}
                    {`{
  "fullName": "John Doe"
}`}
                </pre>
            </div>
        </div>
    );
};
