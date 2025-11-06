import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import type { Survey, Response } from "@shared/schema";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import ExportModal from "@/components/survey/ExportModal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, UserCheck, Globe } from "lucide-react";

// Response item component for displaying individual responses
function ResponseItem({ response, onView, isAnonymous = false }: {
  response: Response;
  onView: (id: string) => void;
  isAnonymous?: boolean;
}) {
  return (
    <div className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-accent/50 transition-colors">
      <div className="flex items-center space-x-4">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
          isAnonymous 
            ? 'bg-green-100 dark:bg-green-900/20' 
            : 'bg-blue-100 dark:bg-blue-900/20'
        }`}>
          {isAnonymous ? (
            <Globe className={`w-5 h-5 text-green-600 dark:text-green-400`} />
          ) : (
            <UserCheck className={`w-5 h-5 text-blue-600 dark:text-blue-400`} />
          )}
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <h3 className="font-medium text-foreground" data-testid={`text-response-id-${response.id}`}>
              Response #{response.id.slice(-8)}
            </h3>
            {isAnonymous && (
              <Badge variant="outline" className="text-xs bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-700">
                Anonymous
              </Badge>
            )}
          </div>
          <div className="flex items-center space-x-4 text-sm text-muted-foreground">
            <span>
              {response.submittedAt 
                ? new Date(response.submittedAt).toLocaleDateString() 
                : 'Not submitted'
              }
            </span>
            {isAnonymous && response.ipAddress && (
              <span className="text-xs">
                IP: {response.ipAddress.replace(/\d+$/, 'xxx')}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center space-x-4">
        <Badge 
          variant={response.completed ? "default" : "secondary"}
          className={response.completed ? "bg-success/10 text-success" : ""}
        >
          {response.completed ? "Completed" : "In Progress"}
        </Badge>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onView(response.id)}
          data-testid={`button-view-response-${response.id}`}
        >
          <i className="fas fa-eye mr-2"></i>
          View
        </Button>
      </div>
    </div>
  );
}

export default function Responses() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  // Redirect to home if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/";
      }, 500);
      return;
    }
  }, [isAuthenticated, authLoading, toast]);

  const { data: survey, isLoading: surveyLoading } = useQuery<Survey>({
    queryKey: ["/api/surveys", id],
    enabled: !!id,
    retry: false,
  });

  const { data: responses, isLoading: responsesLoading } = useQuery<Response[]>({
    queryKey: ["/api/surveys", id, "responses"],
    enabled: !!id,
    retry: false,
  });

  // All responses are now anonymous
  const anonymousResponses = responses?.filter(r => r.isAnonymous) || [];
  const [showAnonymous, setShowAnonymous] = useState(false);

  const handleViewResponse = (responseId: string) => {
    setLocation(`/responses/${responseId}`);
  };

  if (authLoading || !isAuthenticated) {
    return null;
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header 
          title={survey ? `Responses - ${survey.title}` : "Survey Responses"}
          description="View and analyze survey responses"
          actions={
            <div className="flex gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button data-testid="button-export-responses">
                    <i className="fas fa-download mr-2"></i>
                    Export
                    <i className="fas fa-chevron-down ml-2"></i>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem 
                    onClick={() => setIsExportModalOpen(true)}
                    data-testid="menu-item-export-data"
                  >
                    <i className="fas fa-file-export mr-2"></i>
                    Export Data
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => setLocation(`/surveys/${id}/analytics`)}
                    data-testid="menu-item-view-analytics"
                  >
                    <i className="fas fa-chart-bar mr-2"></i>
                    View Analytics
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          }
        />
        
        <div className="flex-1 overflow-auto p-6 space-y-6">
          {/* Summary Stats */}
          {survey && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Total Responses</p>
                      <p className="text-3xl font-bold text-foreground" data-testid="text-total-responses">
                        {responses ? responses.length : 0}
                      </p>
                    </div>
                    <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                      <Users className="text-primary w-6 h-6" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Anonymous</p>
                      <p className="text-3xl font-bold text-foreground" data-testid="text-anonymous-responses">
                        {anonymousResponses.length}
                      </p>
                    </div>
                    <div className="w-12 h-12 bg-green-100 dark:bg-green-900/20 rounded-lg flex items-center justify-center">
                      <Globe className="text-green-600 dark:text-green-400 w-6 h-6" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Completion Rate</p>
                      <p className="text-3xl font-bold text-foreground" data-testid="text-completion-rate">
                        {responses && responses.length > 0 
                          ? Math.round((responses.filter((r) => r.completed).length / responses.length) * 100)
                          : 0}%
                      </p>
                    </div>
                    <div className="w-12 h-12 bg-warning/10 rounded-lg flex items-center justify-center">
                      <i className="fas fa-percentage text-warning text-xl"></i>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Responses List */}
          <Card>
            <CardHeader>
              <CardTitle>Individual Responses</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="all" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-6">
                  <TabsTrigger value="all" data-testid="tab-all-responses">
                    All ({responses ? responses.length : 0})
                  </TabsTrigger>
                  <TabsTrigger value="anonymous" data-testid="tab-anonymous-responses">
                    Anonymous ({anonymousResponses.length})
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="all">
                  {responsesLoading ? (
                    <div className="space-y-4">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="flex items-center justify-between p-4 border border-border rounded-lg animate-pulse">
                          <div className="flex items-center space-x-4">
                            <div className="w-10 h-10 bg-muted rounded-full"></div>
                            <div>
                              <div className="h-4 bg-muted rounded w-48 mb-2"></div>
                              <div className="h-3 bg-muted rounded w-32"></div>
                            </div>
                          </div>
                          <div className="w-20 h-6 bg-muted rounded"></div>
                        </div>
                      ))}
                    </div>
                  ) : responses && responses.length > 0 ? (
                    <div className="space-y-4">
                      {responses.map((response) => (
                        <ResponseItem key={response.id} response={response} onView={handleViewResponse} />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-muted-foreground">No responses yet</p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="anonymous">
                  {anonymousResponses.length > 0 ? (
                    <div className="space-y-4">
                      {anonymousResponses.map((response) => (
                        <ResponseItem key={response.id} response={response} onView={handleViewResponse} isAnonymous />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <Globe className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">No anonymous responses yet</p>
                      <p className="text-sm text-muted-foreground mt-2">
                        Enable anonymous access in survey settings to collect public responses.
                      </p>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </main>
      
      {/* Export Modal */}
      {survey && (
        <ExportModal
          surveyId={survey.id}
          surveyTitle={survey.title}
          isOpen={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
        />
      )}
    </div>
  );
}
