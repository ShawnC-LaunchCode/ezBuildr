import React, { Component, ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  stepId?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class BlockErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error("Uncaught error rendering block:", error, errorInfo);
  }

  public render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback !== undefined && this.props.fallback !== null) {
        return this.props.fallback;
      }
      
      return (
        <Alert variant="destructive" className="my-2 border-destructive/50 bg-destructive/5" role="alert">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Component Error</AlertTitle>
          <AlertDescription className="text-xs break-words">
            We encountered an issue rendering this question. 
            {this.state.error !== undefined && <div className="mt-2 font-mono opacity-80">{this.state.error.toString()}</div>}
          </AlertDescription>
        </Alert>
      );
    }

    return this.props.children;
  }
}
