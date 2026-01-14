/**
 * TemplateTestRunner - Test document templates with sample data
 * PR1: Basic routing and layout shell
 * PR2: Added state management and JSON validation
 * PR5: API integration and status management
 */

import { ArrowLeft, ChevronDown } from "lucide-react";
import React, { useState } from "react";
import { useParams, useLocation } from "wouter";

import {
  SampleDataEditor,
  ResultsPanel,
  StatusPill
} from "@/components/templates-test-runner";
import { useTemplateTest } from "@/components/templates-test-runner/useTemplateTest";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

type OutputType = 'docx' | 'pdf' | 'both';

export default function TemplateTestRunner() {
  const { workflowId, templateId } = useParams<{ workflowId: string; templateId: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // Template test hook
  const { status, result, runTest } = useTemplateTest();

  // State management
  const [sampleDataText, setSampleDataText] = useState("{}");
  const [parsedSampleData, setParsedSampleData] = useState<any | null>(null);
  const [outputType, setOutputType] = useState<OutputType>('docx');

  // Placeholder data - will be fetched from API in later PRs
  const templateName = "Contract Template";
  const templateKey = "contract_v1";

  const handleBackToTemplates = () => {
    navigate(`/workflows/${workflowId}/builder?tab=templates`);
  };

  const handleRunTest = async () => {
    if (!parsedSampleData) {
      toast({
        title: "Invalid JSON",
        description: "Please fix JSON errors before running test",
        variant: "destructive"
      });
      return;
    }

    if (!workflowId || !templateId) {
      toast({
        title: "Error",
        description: "Missing workflow or template ID",
        variant: "destructive"
      });
      return;
    }

    try {
      await runTest(workflowId, templateId, {
        outputType,
        sampleData: parsedSampleData,
      });

      // Success toast is optional - the results panel shows the success state
    } catch (error) {
      // Error is already handled by the hook and shown in results panel
      toast({
        title: "Test Failed",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="border-b px-6 py-3 flex items-center justify-between bg-card">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBackToTemplates}
            className="mr-2"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Templates
          </Button>
          <div>
            <h1 className="text-xl font-semibold">{templateName}</h1>
            <p className="text-sm text-muted-foreground">
              Key: <code className="bg-muted px-1 py-0.5 rounded text-xs">{templateKey}</code>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Output type selector */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                Output: {outputType.toUpperCase()}
                <ChevronDown className="w-4 h-4 ml-2" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setOutputType('docx')}>
                DOCX Only
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setOutputType('pdf')}>
                PDF Only
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setOutputType('both')}>
                Both (DOCX + PDF)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <StatusPill status={status} />

          <Button
            onClick={handleRunTest}
            disabled={!parsedSampleData || status === 'validating' || status === 'rendering'}
            title={!parsedSampleData ? "Fix JSON errors before running test" : ""}
          >
            Run Test
          </Button>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full grid grid-cols-1 md:grid-cols-2 gap-6 p-6">
          {/* Left: Sample Data Editor */}
          <div className="flex flex-col overflow-hidden">
            <h2 className="text-lg font-semibold mb-3">Sample Data</h2>
            <SampleDataEditor
              value={sampleDataText}
              onChange={setSampleDataText}
              onValidChange={setParsedSampleData}
            />
          </div>

          {/* Right: Results Panel */}
          <div className="flex flex-col overflow-hidden">
            <h2 className="text-lg font-semibold mb-3">Results</h2>
            <ResultsPanel status={status} result={result} />
          </div>
        </div>
      </div>
    </div>
  );
}
