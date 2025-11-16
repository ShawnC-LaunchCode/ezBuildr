/**
 * ResultsPanel - Display test results with tabs
 * PR3: Full implementation with Summary/Errors/Preview tabs
 */

import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Download, FileText, CheckCircle2 } from "lucide-react";
import type { TestStatus, TestResult } from "./types";

interface ResultsPanelProps {
  status: TestStatus;
  result?: TestResult;
}

export function ResultsPanel({ status, result }: ResultsPanelProps) {
  const hasErrors = result?.errors && result.errors.length > 0;
  const hasOutputs = result?.docxUrl || result?.pdfUrl;

  // Empty state - no test run yet
  if (!result) {
    return (
      <Card className="flex-1 p-4 overflow-auto">
        <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
          <FileText className="w-16 h-16 mb-4 opacity-20" />
          <p className="text-sm font-medium mb-2">No results yet</p>
          <p className="text-xs max-w-sm">
            Run a test to preview your document output.
          </p>
        </div>
      </Card>
    );
  }

  // Determine default tab based on result
  const defaultTab = hasErrors ? "errors" : hasOutputs ? "preview" : "summary";

  return (
    <Card className="flex-1 flex flex-col overflow-hidden">
      <Tabs defaultValue={defaultTab} className="flex-1 flex flex-col">
        <TabsList className="w-full justify-start rounded-none border-b bg-muted/50">
          <TabsTrigger value="summary">Summary</TabsTrigger>
          {hasErrors && (
            <TabsTrigger value="errors" className="relative">
              Errors
              <Badge variant="destructive" className="ml-2 h-5 px-1.5 text-xs">
                {result.errors!.length}
              </Badge>
            </TabsTrigger>
          )}
          <TabsTrigger value="preview">Preview / Download</TabsTrigger>
        </TabsList>

        {/* Summary Tab */}
        <TabsContent value="summary" className="flex-1 overflow-auto p-4 m-0">
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold mb-2">Test Result</h3>
              <div className="flex items-center gap-2">
                {result.ok ? (
                  <>
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                    <span className="text-sm text-green-600 font-medium">Test Successful</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-5 h-5 text-destructive" />
                    <span className="text-sm text-destructive font-medium">Test Failed</span>
                  </>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Status</p>
                <Badge variant={result.ok ? "default" : "destructive"} className="font-mono text-xs">
                  {result.status}
                </Badge>
              </div>

              {result.durationMs !== undefined && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Duration</p>
                  <p className="text-sm font-medium">{result.durationMs}ms</p>
                </div>
              )}

              {hasErrors && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Errors</p>
                  <p className="text-sm font-medium text-destructive">{result.errors!.length} error(s)</p>
                </div>
              )}

              {hasOutputs && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Outputs</p>
                  <div className="flex gap-1">
                    {result.docxUrl && <Badge variant="outline" className="text-xs">DOCX</Badge>}
                    {result.pdfUrl && <Badge variant="outline" className="text-xs">PDF</Badge>}
                  </div>
                </div>
              )}
            </div>

            {result.ok && (
              <div className="border-t pt-4">
                <p className="text-xs text-muted-foreground">
                  Template rendered successfully. Download your document from the Preview tab.
                </p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Errors Tab */}
        {hasErrors && (
          <TabsContent value="errors" className="flex-1 overflow-auto p-4 m-0">
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">
                {result.errors!.length} Error{result.errors!.length !== 1 ? 's' : ''} Found
              </h3>
              {result.errors!.map((error, index) => (
                <Card key={index} className="border-destructive/50 bg-destructive/5">
                  <div className="p-3">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-xs font-mono">
                            {error.code}
                          </Badge>
                          {error.placeholder && (
                            <code className="text-xs bg-muted px-1 py-0.5 rounded">
                              {error.placeholder}
                            </code>
                          )}
                        </div>
                        <p className="text-sm text-destructive">{error.message}</p>
                        {error.path && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Path: <code>{error.path}</code>
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </TabsContent>
        )}

        {/* Preview / Download Tab */}
        <TabsContent value="preview" className="flex-1 overflow-auto p-4 m-0">
          {hasOutputs ? (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Download Documents</h3>

              <div className="grid gap-3">
                {result.docxUrl && (
                  <Card className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <FileText className="w-8 h-8 text-blue-600" />
                        <div>
                          <p className="text-sm font-medium">DOCX Document</p>
                          <p className="text-xs text-muted-foreground">Microsoft Word format</p>
                        </div>
                      </div>
                      <Button size="sm" asChild>
                        <a href={result.docxUrl} download>
                          <Download className="w-4 h-4 mr-2" />
                          Download
                        </a>
                      </Button>
                    </div>
                  </Card>
                )}

                {result.pdfUrl && (
                  <Card className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <FileText className="w-8 h-8 text-red-600" />
                        <div>
                          <p className="text-sm font-medium">PDF Document</p>
                          <p className="text-xs text-muted-foreground">Portable Document Format</p>
                        </div>
                      </div>
                      <Button size="sm" asChild>
                        <a href={result.pdfUrl} download>
                          <Download className="w-4 h-4 mr-2" />
                          Download
                        </a>
                      </Button>
                    </div>
                  </Card>
                )}
              </div>

              <div className="border-t pt-4 text-xs text-muted-foreground">
                <p>
                  Note: Documents are generated with the sample data you provided.
                  Inline PDF preview coming in a future update.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
              <FileText className="w-12 h-12 mb-3 opacity-20" />
              <p className="text-sm">No outputs available</p>
              <p className="text-xs mt-1">
                {result.ok
                  ? "The test completed but no documents were generated."
                  : "Fix the errors above and run the test again."}
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </Card>
  );
}
