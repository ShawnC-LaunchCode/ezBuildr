/**
 * Stage 21: Template Test Runner
 *
 * UI for testing templates with sample data.
 * Features:
 * - Analyze template structure (variables, loops, conditionals)
 * - Generate sample data automatically
 * - Validate template with custom data
 * - Preview rendered output
 * - Integration with TemplateAnalysisService
 */

import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '../../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../../../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/ui/tabs';
import { Badge } from '../../../components/ui/badge';
import { Textarea } from '../../../components/ui/textarea';
import { Label } from '../../../components/ui/label';
import {
  Code,
  PlayCircle,
  CheckCircle,
  AlertCircle,
  Loader2,
  FileCode,
  Database,
} from 'lucide-react';
import { toast } from 'sonner';

interface TemplateTestRunnerProps {
  templateId: string;
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface TemplateAnalysis {
  variables: Array<{
    name: string;
    type: 'variable' | 'loop' | 'conditional' | 'helper';
    path?: string;
    helperName?: string;
  }>;
  loops: Array<{
    tag: string;
    context: string;
  }>;
  conditionals: Array<{
    tag: string;
    condition: string;
  }>;
  helpers: string[];
  stats: {
    variableCount: number;
    loopCount: number;
    conditionalCount: number;
    helperCount: number;
  };
}

interface ValidationResult {
  valid: boolean;
  coverage: number;
  missing: string[];
  extra: string[];
  errors: Array<{
    placeholder: string;
    error: string;
  }>;
}

export function TemplateTestRunner({
  templateId,
  projectId,
  open,
  onOpenChange,
}: TemplateTestRunnerProps) {
  const [sampleData, setSampleData] = useState('{}');
  const [activeTab, setActiveTab] = useState<'analysis' | 'test'>('analysis');

  // Fetch template analysis
  const {
    data: analysis,
    isLoading: loadingAnalysis,
    error: analysisError,
  } = useQuery<{ data: TemplateAnalysis }>({
    queryKey: ['template-analysis', templateId],
    queryFn: async () => {
      const response = await fetch(
        `/api/templates/${templateId}/analyze?projectId=${projectId}`,
        {
          credentials: 'include',
        }
      );

      if (!response.ok) {
        throw new Error('Failed to analyze template');
      }

      return response.json();
    },
    enabled: open,
  });

  // Generate sample data mutation
  const generateSampleMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(
        `/api/templates/${templateId}/sample-data?projectId=${projectId}`,
        {
          method: 'POST',
          credentials: 'include',
        }
      );

      if (!response.ok) {
        throw new Error('Failed to generate sample data');
      }

      return response.json();
    },
    onSuccess: (data) => {
      setSampleData(JSON.stringify(data.data, null, 2));
      setActiveTab('test');
      toast.success('Sample data generated');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Validate template mutation
  const validateMutation = useMutation<{ data: ValidationResult }, Error, any>({
    mutationFn: async (data: any) => {
      const response = await fetch(
        `/api/templates/${templateId}/validate?projectId=${projectId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ sampleData: data }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to validate template');
      }

      return response.json();
    },
    onSuccess: (result) => {
      if (result.data.valid) {
        toast.success(`Validation passed! Coverage: ${(result.data.coverage * 100).toFixed(0)}%`);
      } else {
        toast.warning(`Validation issues found. Coverage: ${(result.data.coverage * 100).toFixed(0)}%`);
      }
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const handleGenerateSample = () => {
    generateSampleMutation.mutate();
  };

  const handleValidate = () => {
    try {
      const data = JSON.parse(sampleData);
      validateMutation.mutate(data);
    } catch (error) {
      toast.error('Invalid JSON data');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Test Template</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="analysis">
              <FileCode className="h-4 w-4 mr-2" />
              Analysis
            </TabsTrigger>
            <TabsTrigger value="test">
              <Database className="h-4 w-4 mr-2" />
              Test Data
            </TabsTrigger>
          </TabsList>

          <TabsContent value="analysis" className="flex-1 overflow-y-auto mt-4">
            {loadingAnalysis ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              </div>
            ) : analysisError ? (
              <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-red-900 dark:text-red-100">
                  <AlertCircle className="h-4 w-4 inline mr-2" />
                  Error: {(analysisError as Error).message}
                </p>
              </div>
            ) : analysis ? (
              <div className="space-y-6">
                {/* Stats Overview */}
                <div className="grid grid-cols-4 gap-4">
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                    <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                      {analysis.data.stats.variableCount}
                    </div>
                    <div className="text-sm text-blue-700 dark:text-blue-300">Variables</div>
                  </div>

                  <div className="p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
                    <div className="text-2xl font-bold text-purple-900 dark:text-purple-100">
                      {analysis.data.stats.loopCount}
                    </div>
                    <div className="text-sm text-purple-700 dark:text-purple-300">Loops</div>
                  </div>

                  <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                    <div className="text-2xl font-bold text-green-900 dark:text-green-100">
                      {analysis.data.stats.conditionalCount}
                    </div>
                    <div className="text-sm text-green-700 dark:text-green-300">Conditionals</div>
                  </div>

                  <div className="p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg">
                    <div className="text-2xl font-bold text-orange-900 dark:text-orange-100">
                      {analysis.data.stats.helperCount}
                    </div>
                    <div className="text-sm text-orange-700 dark:text-orange-300">Helpers</div>
                  </div>
                </div>

                {/* Variables List */}
                {analysis.data.variables.length > 0 && (
                  <div>
                    <h3 className="font-semibold mb-2 flex items-center gap-2">
                      <Code className="h-4 w-4" />
                      Variables ({analysis.data.variables.length})
                    </h3>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {analysis.data.variables.map((v, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded"
                        >
                          <code className="text-sm flex-1">{v.name}</code>
                          <Badge variant="outline" className="text-xs">
                            {v.type}
                          </Badge>
                          {v.helperName && (
                            <Badge variant="secondary" className="text-xs">
                              {v.helperName}
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Loops */}
                {analysis.data.loops.length > 0 && (
                  <div>
                    <h3 className="font-semibold mb-2">Loops ({analysis.data.loops.length})</h3>
                    <div className="space-y-1">
                      {analysis.data.loops.map((loop, i) => (
                        <div key={i} className="p-2 bg-purple-50 dark:bg-purple-900/20 rounded">
                          <code className="text-sm">{loop.tag}</code>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Conditionals */}
                {analysis.data.conditionals.length > 0 && (
                  <div>
                    <h3 className="font-semibold mb-2">
                      Conditionals ({analysis.data.conditionals.length})
                    </h3>
                    <div className="space-y-1">
                      {analysis.data.conditionals.map((cond, i) => (
                        <div key={i} className="p-2 bg-green-50 dark:bg-green-900/20 rounded">
                          <code className="text-sm">{cond.tag}</code>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Helpers */}
                {analysis.data.helpers.length > 0 && (
                  <div>
                    <h3 className="font-semibold mb-2">
                      Helper Functions ({analysis.data.helpers.length})
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {analysis.data.helpers.map((helper, i) => (
                        <Badge key={i} variant="secondary">
                          {helper}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-end">
                  <Button onClick={handleGenerateSample} disabled={generateSampleMutation.isPending}>
                    {generateSampleMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Database className="h-4 w-4 mr-2" />
                        Generate Sample Data
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ) : null}
          </TabsContent>

          <TabsContent value="test" className="flex-1 overflow-y-auto mt-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="sample-data">Sample Data (JSON)</Label>
                <Textarea
                  id="sample-data"
                  value={sampleData}
                  onChange={(e) => setSampleData(e.target.value)}
                  placeholder='{"name": "John Doe", "email": "john@example.com"}'
                  className="font-mono text-sm"
                  rows={15}
                />
                <p className="text-sm text-gray-500">
                  Enter JSON data to test template rendering
                </p>
              </div>

              {validateMutation.data && (
                <div
                  className={`p-4 rounded-lg border ${
                    validateMutation.data.data.valid
                      ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                      : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    {validateMutation.data.data.valid ? (
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-yellow-600" />
                    )}
                    <h3 className="font-semibold">
                      {validateMutation.data.data.valid
                        ? 'Validation Passed'
                        : 'Validation Warnings'}
                    </h3>
                  </div>

                  <div className="space-y-2 text-sm">
                    <p>
                      <strong>Coverage:</strong>{' '}
                      {(validateMutation.data.data.coverage * 100).toFixed(0)}%
                    </p>

                    {validateMutation.data.data.missing.length > 0 && (
                      <div>
                        <strong>Missing variables:</strong>
                        <ul className="list-disc list-inside mt-1">
                          {validateMutation.data.data.missing.map((v) => (
                            <li key={v}>
                              <code>{v}</code>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {validateMutation.data.data.extra.length > 0 && (
                      <div>
                        <strong>Extra variables (not in template):</strong>
                        <ul className="list-disc list-inside mt-1">
                          {validateMutation.data.data.extra.map((v) => (
                            <li key={v}>
                              <code>{v}</code>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {validateMutation.data.data.errors.length > 0 && (
                      <div>
                        <strong>Errors:</strong>
                        <ul className="list-disc list-inside mt-1">
                          {validateMutation.data.data.errors.map((err, i) => (
                            <li key={i}>
                              <code>{err.placeholder}</code>: {err.error}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={handleGenerateSample}
                  disabled={generateSampleMutation.isPending}
                >
                  {generateSampleMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Database className="h-4 w-4 mr-2" />
                      Generate Sample
                    </>
                  )}
                </Button>
                <Button onClick={handleValidate} disabled={validateMutation.isPending}>
                  {validateMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Validating...
                    </>
                  ) : (
                    <>
                      <PlayCircle className="h-4 w-4 mr-2" />
                      Validate
                    </>
                  )}
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
