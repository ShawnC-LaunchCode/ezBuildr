import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { formatFileSize } from "@/lib/formatting";
import { format } from "date-fns";

interface ExportModalProps {
  surveyId: string;
  surveyTitle: string;
  isOpen: boolean;
  onClose: () => void;
}

interface ExportOptions {
  format: 'csv' | 'pdf';
  includeIncomplete: boolean;
  dateFrom?: string;
  dateTo?: string;
  questionIds?: string[];
}

interface ExportResponse {
  success: boolean;
  filename: string;
  downloadUrl: string;
  size: number;
  mimeType: string;
  error?: string;
}

export default function ExportModal({ surveyId, surveyTitle, isOpen, onClose }: ExportModalProps) {
  const { toast } = useToast();
  const [exportOptions, setExportOptions] = useState<ExportOptions>({
    format: 'csv',
    includeIncomplete: false
  });
  const [downloadInfo, setDownloadInfo] = useState<ExportResponse | null>(null);

  const exportMutation = useMutation<ExportResponse, Error, ExportOptions>({
    mutationFn: async (options: ExportOptions): Promise<ExportResponse> => {
      const response = await apiRequest("POST", `/api/surveys/${surveyId}/export`, options);
      const data = await response.json();
      return data as ExportResponse;
    },
    onSuccess: (data) => {
      setDownloadInfo(data);
      toast({
        title: "Export Generated",
        description: `Your ${exportOptions.format.toUpperCase()} export is ready for download.`,
        variant: "default"
      });
    },
    onError: (error: any) => {
      console.error('Export error:', error);
      toast({
        title: "Export Failed",
        description: error?.response?.data?.message || "Failed to generate export",
        variant: "destructive"
      });
    }
  });

  const handleExport = () => {
    exportMutation.mutate(exportOptions);
  };

  const handleDownload = () => {
    if (downloadInfo) {
      window.open(downloadInfo.downloadUrl, '_blank');
    }
  };

  const resetModal = () => {
    setDownloadInfo(null);
    setExportOptions({
      format: 'csv',
      includeIncomplete: false
    });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={resetModal}>
      <DialogContent className="sm:max-w-[600px]" data-testid="dialog-export-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <i className="fas fa-download text-primary"></i>
            Export Survey Data
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Survey Info */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Survey</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="font-medium text-foreground" data-testid="text-survey-title">{surveyTitle}</p>
            </CardContent>
          </Card>

          {/* Export Options */}
          {!downloadInfo && (
            <div className="space-y-6">
              {/* Format Selection */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Export Format</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <RadioGroup
                    value={exportOptions.format}
                    onValueChange={(value: 'csv' | 'pdf') => 
                      setExportOptions(prev => ({ ...prev, format: value }))
                    }
                    data-testid="radio-group-format"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="csv" id="csv" data-testid="radio-csv" />
                      <Label htmlFor="csv" className="flex items-center gap-2 cursor-pointer">
                        <i className="fas fa-file-csv text-green-600"></i>
                        CSV (Comma Separated Values)
                        <Badge variant="secondary" className="text-xs">Raw Data</Badge>
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="pdf" id="pdf" data-testid="radio-pdf" />
                      <Label htmlFor="pdf" className="flex items-center gap-2 cursor-pointer">
                        <i className="fas fa-file-pdf text-red-600"></i>
                        PDF Report
                        <Badge variant="secondary" className="text-xs">Charts & Analysis</Badge>
                      </Label>
                    </div>
                  </RadioGroup>
                </CardContent>
              </Card>

              {/* Options */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Export Options</CardTitle>
                </CardHeader>
                <CardContent className="pt-0 space-y-4">
                  {/* Include Incomplete */}
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="include-incomplete">Include Incomplete Responses</Label>
                      <p className="text-sm text-muted-foreground">
                        Include responses that were started but not submitted
                      </p>
                    </div>
                    <Switch
                      id="include-incomplete"
                      checked={exportOptions.includeIncomplete}
                      onCheckedChange={(checked) => 
                        setExportOptions(prev => ({ ...prev, includeIncomplete: checked }))
                      }
                      data-testid="switch-include-incomplete"
                    />
                  </div>

                  {/* Date Range */}
                  <div className="space-y-3">
                    <Label>Date Range (Optional)</Label>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="date-from" className="text-xs text-muted-foreground">From</Label>
                        <Input
                          id="date-from"
                          type="date"
                          value={exportOptions.dateFrom || ''}
                          onChange={(e) => 
                            setExportOptions(prev => ({ 
                              ...prev, 
                              dateFrom: e.target.value || undefined 
                            }))
                          }
                          data-testid="input-date-from"
                        />
                      </div>
                      <div>
                        <Label htmlFor="date-to" className="text-xs text-muted-foreground">To</Label>
                        <Input
                          id="date-to"
                          type="date"
                          value={exportOptions.dateTo || ''}
                          onChange={(e) => 
                            setExportOptions(prev => ({ 
                              ...prev, 
                              dateTo: e.target.value || undefined 
                            }))
                          }
                          data-testid="input-date-to"
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Export Description */}
              <Card className="bg-muted/50">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-3">
                    <i className="fas fa-info-circle text-primary mt-0.5"></i>
                    <div className="space-y-1">
                      <p className="text-sm font-medium">
                        {exportOptions.format === 'csv' ? 'CSV Export' : 'PDF Report'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {exportOptions.format === 'csv' 
                          ? 'Raw response data in spreadsheet format. Perfect for further analysis in Excel, Google Sheets, or statistical software.'
                          : 'Professional report with charts, summary statistics, and question-by-question analysis. Ideal for presentations and sharing insights.'
                        }
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Export Progress */}
          {exportMutation.isPending && (
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <i className="fas fa-cog fa-spin text-primary"></i>
                    <span className="text-sm font-medium">
                      Generating {exportOptions.format.toUpperCase()} export...
                    </span>
                  </div>
                  <Progress value={60} className="h-2" />
                  <p className="text-xs text-muted-foreground">
                    Processing survey data and generating your export file
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Download Info */}
          {downloadInfo && (
            <Card className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <i className="fas fa-check-circle text-green-600"></i>
                    <span className="font-medium text-green-800 dark:text-green-200">
                      Export Ready
                    </span>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-green-700 dark:text-green-300">Filename:</span>
                      <span className="text-sm font-mono text-green-800 dark:text-green-200" data-testid="text-filename">
                        {downloadInfo.filename}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-green-700 dark:text-green-300">Size:</span>
                      <span className="text-sm font-mono text-green-800 dark:text-green-200" data-testid="text-filesize">
                        {formatFileSize(downloadInfo.size)}
                      </span>
                    </div>
                  </div>

                  <Button 
                    onClick={handleDownload} 
                    className="w-full bg-green-600 hover:bg-green-700"
                    data-testid="button-download"
                  >
                    <i className="fas fa-download mr-2"></i>
                    Download {exportOptions.format.toUpperCase()}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={resetModal} data-testid="button-cancel">
            {downloadInfo ? 'Close' : 'Cancel'}
          </Button>
          {!downloadInfo && (
            <Button 
              onClick={handleExport}
              disabled={exportMutation.isPending}
              data-testid="button-generate-export"
            >
              {exportMutation.isPending ? (
                <>
                  <i className="fas fa-spinner fa-spin mr-2"></i>
                  Generating...
                </>
              ) : (
                <>
                  <i className="fas fa-download mr-2"></i>
                  Generate Export
                </>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}