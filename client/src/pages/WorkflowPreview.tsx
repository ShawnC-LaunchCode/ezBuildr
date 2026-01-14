import { Loader2 } from "lucide-react";
import { useParams, useLocation } from "wouter";

import { PreviewRunner } from "@/components/preview/PreviewRunner";

export default function WorkflowPreview() {
  const { workflowId = "" } = useParams<{ workflowId: string }>();
  const [, navigate] = useLocation();

  if (!workflowId) {
    return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin" /></div>;
  }

  return (
    <PreviewRunner
      workflowId={workflowId}
      onExit={() => navigate(`/workflows/${workflowId}/builder`)}
    />
  );
}
