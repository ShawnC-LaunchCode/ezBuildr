import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Eye } from "lucide-react";
import type { Survey } from "@shared/schema";

interface BuilderHeaderProps {
  survey?: Survey;
  surveyTitle: string;
  currentSurveyId: string | null;
  isSaving: boolean;
  onSave: () => void;
  onPublish: () => void;
  onPreview: () => void;
}

export function BuilderHeader({
  survey,
  surveyTitle,
  currentSurveyId,
  isSaving,
  onSave,
  onPublish,
  onPreview
}: BuilderHeaderProps) {
  return (
    <div className="flex items-center space-x-3">
      {survey && <StatusBadge status={survey.status} />}
      <Button
        variant="outline"
        onClick={onPreview}
        disabled={!survey && !currentSurveyId}
        data-testid="button-preview-survey"
      >
        <Eye className="mr-2 h-4 w-4" />
        Preview
      </Button>
      <Button
        variant="outline"
        onClick={onSave}
        disabled={isSaving}
        data-testid="button-save-survey"
      >
        {isSaving ? "Saving..." : "Save Draft"}
      </Button>
      <Button
        onClick={onPublish}
        disabled={isSaving || !surveyTitle || survey?.status === "open"}
        data-testid="button-publish-survey"
      >
        {survey?.status === "open" ? "Published" : "Publish Survey"}
      </Button>
    </div>
  );
}
