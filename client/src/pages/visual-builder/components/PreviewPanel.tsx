/**
 * PreviewPanel - Embedded run tester for workflows
 */

import { motion } from 'framer-motion';
import { Play, X, CheckCircle, XCircle, Clock, Download } from 'lucide-react';
import React, { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';

import { useRunWorkflow, useWorkflowRun } from '../hooks/useWorkflowAPI';

interface PreviewPanelProps {
  workflowId: string;
  onClose: () => void;
}

export function PreviewPanel({ workflowId, onClose }: PreviewPanelProps) {
  const [inputs, setInputs] = useState<Record<string, any>>({});
  const [runId, setRunId] = useState<string | undefined>();

  const runWorkflow = useRunWorkflow(workflowId);
  const { data: runData } = useWorkflowRun(runId);

  const handleInputChange = (key: string, value: any) => {
    setInputs(prev => ({ ...prev, [key]: value }));
  };

  const handleRun = async () => {
    try {
      const result = await runWorkflow.mutateAsync(inputs);
      setRunId(result.id);
    } catch (error) {
      console.error('Error running workflow:', error);
    }
  };

  const handleReset = () => {
    setInputs({});
    setRunId(undefined);
  };

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="h-full flex flex-col bg-background border-l"
    >
      {/* Header */}
      <div className="border-b px-4 py-3 flex items-center justify-between">
        <h3 className="font-semibold">Run Preview</h3>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Input Form */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Test Inputs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="test-input-1">Sample Input 1</Label>
                <Input
                  id="test-input-1"
                  value={inputs.input1 || ''}
                  onChange={(e) => handleInputChange('input1', e.target.value)}
                  placeholder="Enter test value"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="test-input-2">Sample Input 2</Label>
                <Input
                  id="test-input-2"
                  value={inputs.input2 || ''}
                  onChange={(e) => handleInputChange('input2', e.target.value)}
                  placeholder="Enter test value"
                />
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={handleRun}
                  disabled={runWorkflow.isPending}
                  className="flex-1"
                >
                  <Play className="w-4 h-4 mr-2" />
                  {runWorkflow.isPending ? 'Running...' : 'Run Workflow'}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleReset}
                >
                  Reset
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Run Status */}
          {runData && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Run Status</CardTitle>
                  <Badge
                    variant={
                      runData.status === 'completed'
                        ? 'default'
                        : runData.status === 'failed'
                        ? 'destructive'
                        : 'secondary'
                    }
                  >
                    {runData.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Run ID:</span>
                    <span className="font-mono text-xs">{runData.id.slice(0, 12)}...</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Started:</span>
                    <span>{new Date(runData.createdAt).toLocaleTimeString()}</span>
                  </div>
                  {runData.completedAt && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Completed:</span>
                      <span>{new Date(runData.completedAt).toLocaleTimeString()}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Execution Trace */}
          {runData?.trace && runData.trace.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Execution Trace</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {runData.trace.map((step, index) => (
                    <motion.div
                      key={step.nodeId}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className={`
                        p-3 rounded-md border
                        ${step.executed ? 'bg-green-50 dark:bg-green-950 border-green-300 dark:border-green-700' : ''}
                        ${step.skipped ? 'bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-700' : ''}
                        ${step.error ? 'bg-red-50 dark:bg-red-950 border-red-300 dark:border-red-700' : ''}
                      `}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {step.executed && <CheckCircle className="w-4 h-4 text-green-600" />}
                          {step.skipped && <XCircle className="w-4 h-4 text-gray-500" />}
                          {step.error && <XCircle className="w-4 h-4 text-red-600" />}
                          {!step.executed && !step.skipped && !step.error && (
                            <Clock className="w-4 h-4 text-blue-600" />
                          )}
                          <span className="font-mono text-sm">{step.nodeId}</span>
                        </div>
                        {typeof step.conditionResult === 'boolean' && (
                          <Badge variant="outline" className="text-xs">
                            {step.conditionResult ? 'true' : 'false'}
                          </Badge>
                        )}
                      </div>
                      {step.error && (
                        <p className="text-xs text-red-600 mt-2">{step.error}</p>
                      )}
                    </motion.div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Outputs */}
          {runData?.outputs && Object.keys(runData.outputs).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Outputs</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Object.entries(runData.outputs).map(([key, value]) => (
                    <div key={key} className="flex justify-between text-sm">
                      <span className="font-mono text-muted-foreground">{key}:</span>
                      <span className="font-mono">{JSON.stringify(value)}</span>
                    </div>
                  ))}
                </div>

                {/* Download buttons for generated documents */}
                {runData.outputs.documentUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-3"
                    onClick={() => window.open(runData.outputs.documentUrl as string, '_blank')}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download Document
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </ScrollArea>
    </motion.div>
  );
}
