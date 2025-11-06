import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";
import type { Survey, Response, Answer, Question } from "@shared/schema";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, User, Calendar, CheckCircle, Clock, Globe } from "lucide-react";

interface ResponseDetailsData {
  response: Response;
  answers: (Answer & { question: Question })[];
}

export default function ResponseDetails() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

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

  // Single consolidated API call - no more hooks violations!
  const { data: responseData, isLoading: responseLoading, error } = useQuery<ResponseDetailsData>({
    queryKey: ["/api/responses", id],
    enabled: !!id,
    retry: false,
  });

  // Only fetch survey data if we have response data
  const { data: survey, isLoading: surveyLoading } = useQuery<Survey>({
    queryKey: ["/api/surveys", responseData?.response.surveyId],
    enabled: !!responseData?.response.surveyId,
    retry: false,
  });

  const handleBack = () => {
    if (survey) {
      setLocation(`/surveys/${survey.id}/responses`);
    } else {
      setLocation('/surveys');
    }
  };

  if (authLoading || !isAuthenticated) {
    return null;
  }

  if (error) {
    return (
      <div className="flex h-screen bg-background">
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden">
          <Header 
            title="Response Details"
            description="View individual survey response"
          />
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <h3 className="text-lg font-medium text-foreground mb-2">Response not found</h3>
              <p className="text-muted-foreground mb-4">The response you're looking for doesn't exist or you don't have access to it.</p>
              <Button onClick={handleBack} data-testid="button-back-to-responses">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Responses
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header 
          title={survey ? `Response Details - ${survey.title}` : "Response Details"}
          description="View individual survey response"
          actions={
            <Button variant="outline" onClick={handleBack} data-testid="button-back-to-responses">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Responses
            </Button>
          }
        />
        
        <div className="flex-1 overflow-auto p-6 space-y-6">
          {responseLoading || surveyLoading ? (
            <div className="space-y-6">
              {/* Loading skeleton */}
              <Card>
                <CardHeader>
                  <div className="h-6 bg-muted rounded w-48 animate-pulse"></div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="h-4 bg-muted rounded w-32 animate-pulse"></div>
                    <div className="h-4 bg-muted rounded w-48 animate-pulse"></div>
                    <div className="h-4 bg-muted rounded w-24 animate-pulse"></div>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : responseData && survey ? (
            <>
              {/* Response Overview */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-3">
                    {responseData.response.isAnonymous ? (
                      <Globe className="h-5 w-5 text-green-600 dark:text-green-400" />
                    ) : (
                      <User className="h-5 w-5" />
                    )}
                    Response Overview
                    {responseData.response.isAnonymous && (
                      <Badge variant="outline" className="ml-auto text-xs bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-700">
                        Anonymous
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-muted-foreground">Respondent</p>
                      <p className="text-foreground font-medium" data-testid="text-respondent-name">
                        Anonymous Respondent
                      </p>
                      {responseData.response.ipAddress && (
                        <p className="text-sm text-muted-foreground" data-testid="text-respondent-ip">
                          IP: {responseData.response.ipAddress.replace(/\d+$/, 'xxx')}
                        </p>
                      )}
                    </div>
                    
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-muted-foreground">Response ID</p>
                      <p className="text-foreground font-mono text-sm" data-testid="text-response-id">
                        #{responseData.response.id.slice(-8)}
                      </p>
                    </div>
                    
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-muted-foreground">Status</p>
                      <Badge 
                        variant={responseData.response.completed ? "default" : "secondary"}
                        className={responseData.response.completed ? "bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100" : ""}
                        data-testid="badge-response-status"
                      >
                        {responseData.response.completed ? (
                          <>
                            <CheckCircle className="mr-1 h-3 w-3" />
                            Completed
                          </>
                        ) : (
                          <>
                            <Clock className="mr-1 h-3 w-3" />
                            In Progress
                          </>
                        )}
                      </Badge>
                    </div>
                    
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-muted-foreground">Submitted</p>
                      <p className="text-foreground" data-testid="text-submitted-date">
                        {responseData.response.submittedAt ? (
                          <>
                            <Calendar className="inline mr-1 h-3 w-3" />
                            {new Date(responseData.response.submittedAt).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </>
                        ) : (
                          'Not submitted'
                        )}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Answers */}
              <Card>
                <CardHeader>
                  <CardTitle>Responses</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {responseData.answers.length} answer{responseData.answers.length !== 1 ? 's' : ''} provided
                  </p>
                </CardHeader>
                <CardContent>
                  {responseData.answers.length > 0 ? (
                    <div className="space-y-6">
                      {responseData.answers.map((answer, index) => {
                        const question = answer.question;
                        return (
                          <div key={answer.id} className="space-y-3">
                            <div className="flex items-start gap-3">
                              <div className="flex-shrink-0 w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center text-primary text-sm font-medium">
                                {index + 1}
                              </div>
                              <div className="flex-1 space-y-2">
                                <h4 className="font-medium text-foreground" data-testid={`text-question-title-${answer.id}`}>
                                  {question.title}
                                </h4>
                                {question.description && (
                                  <p className="text-sm text-muted-foreground">
                                    {question.description}
                                  </p>
                                )}
                                <div className="bg-accent/50 rounded-lg p-3">
                                  <div className="text-foreground" data-testid={`text-answer-value-${answer.id}`}>
                                    {typeof answer.value === 'string' ? (
                                      answer.value
                                    ) : Array.isArray(answer.value) ? (
                                      <ul className="list-disc list-inside space-y-1">
                                        {answer.value.map((item, i) => (
                                          <li key={i}>{String(item)}</li>
                                        ))}
                                      </ul>
                                    ) : (
                                      JSON.stringify(answer.value, null, 2)
                                    )}
                                  </div>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  Question type: {question.type.replace(/_/g, ' ')}
                                </p>
                              </div>
                            </div>
                            {index < responseData.answers.length - 1 && (
                              <Separator className="my-4" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                        <Clock className="h-8 w-8 text-muted-foreground" />
                      </div>
                      <h3 className="text-lg font-medium text-foreground mb-2">No answers yet</h3>
                      <p className="text-muted-foreground">This response doesn't contain any answers yet.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}