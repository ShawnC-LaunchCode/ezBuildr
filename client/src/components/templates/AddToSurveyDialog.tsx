import axios from "axios";
import { Loader2 } from "lucide-react";
import React, { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useTemplates } from "@/hooks/useTemplates";

interface Survey {
  id: string;
  title: string;
  status: string;
}

interface AddToSurveyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateId?: string;
}

export default function AddToSurveyDialog({
  open,
  onOpenChange,
  templateId,
}: AddToSurveyDialogProps) {
  const { insert } = useTemplates();
  const { toast } = useToast();
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [surveyId, setSurveyId] = useState<string>("");
  const [isLoadingSurveys, setIsLoadingSurveys] = useState(false);

  // Fetch surveys when dialog opens
  useEffect(() => {
    if (!open) {
      setSurveyId("");
      return;
    }

    const fetchSurveys = async () => {
      setIsLoadingSurveys(true);
      try {
        const response = await axios.get("/api/surveys?limit=100&offset=0");
        const data = response.data?.items || response.data || [];
        setSurveys(data);
      } catch (error) {
        toast({
          title: "Error loading surveys",
          description: "Failed to fetch your surveys",
          variant: "destructive",
        });
      } finally {
        setIsLoadingSurveys(false);
      }
    };

    fetchSurveys();
  }, [open, toast]);

  const handleAdd = async () => {
    if (!templateId || !surveyId) {return;}

    try {
      const result = await insert.mutateAsync({ templateId, surveyId });
      toast({
        title: "Template added successfully",
        description: `${result.pagesAdded} page(s) and ${result.questionsAdded} question(s) added to survey`,
      });
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Error adding template",
        description: error.response?.data?.message || "Failed to add template to survey",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" aria-describedby="add-to-survey-description">
        <DialogHeader>
          <DialogTitle>Add template to survey</DialogTitle>
          <DialogDescription id="add-to-survey-description">
            Choose which survey you want to add this template to
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label htmlFor="survey-select" className="text-sm font-medium">
              Target Survey
            </label>
            {isLoadingSurveys ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <Select value={surveyId} onValueChange={setSurveyId}>
                <SelectTrigger id="survey-select" aria-label="Select target survey">
                  <SelectValue placeholder="— Select a survey —" />
                </SelectTrigger>
                <SelectContent>
                  {surveys.length === 0 ? (
                    <div className="p-4 text-sm text-muted-foreground text-center">
                      No surveys available
                    </div>
                  ) : (
                    surveys.map((survey) => (
                      <SelectItem key={survey.id} value={survey.id}>
                        {survey.title}
                        <span className="ml-2 text-xs text-muted-foreground">
                          ({survey.status})
                        </span>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={insert.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleAdd}
            disabled={!surveyId || insert.isPending || isLoadingSurveys}
          >
            {insert.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Adding...
              </>
            ) : (
              "Add to survey"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
