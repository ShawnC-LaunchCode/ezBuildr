/**
 * Question Add Menu Component
 * Dropdown menu for adding different question types to a page
 */

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCreateStep, useWorkflowMode } from "@/lib/vault-hooks";
import { useToast } from "@/hooks/use-toast";
import { useWorkflowBuilder } from "@/store/workflow-builder";
import type { ApiStep } from "@/lib/vault-api";

interface QuestionAddMenuProps {
  sectionId: string;
  nextOrder: number;
  workflowId: string;
}

const QUESTION_TYPES = [
  { value: "short_text", label: "Short Text", icon: "T", advancedOnly: false },
  { value: "long_text", label: "Long Text", icon: "¶", advancedOnly: false },
  { value: "radio", label: "Radio (Single Choice)", icon: "◉", advancedOnly: false },
  { value: "multiple_choice", label: "Multiple Choice", icon: "☑", advancedOnly: false },
  { value: "yes_no", label: "Yes/No", icon: "?", advancedOnly: false },
  { value: "date_time", label: "Date/Time", icon: "📅", advancedOnly: false },
  { value: "file_upload", label: "File Upload", icon: "📎", advancedOnly: false },
  { value: "js_question", label: "JS Question", icon: "⚡", advancedOnly: true },
] as const;

export function QuestionAddMenu({ sectionId, nextOrder, workflowId }: QuestionAddMenuProps) {
  const createStepMutation = useCreateStep();
  const { toast } = useToast();
  const { selectStep } = useWorkflowBuilder();
  const { data: workflowMode } = useWorkflowMode(workflowId);

  const mode = workflowMode?.mode || 'easy';

  const handleAddQuestion = async (type: ApiStep["type"]) => {
    try {
      let options = null;

      // Set type-specific options
      if (type === "radio" || type === "multiple_choice") {
        options = { options: ["Option 1", "Option 2", "Option 3"] };
      } else if (type === "js_question") {
        options = {
          display: "hidden",
          code: "return input;",
          inputKeys: [],
          outputKey: "computed_value",
          timeoutMs: 1000,
          helpText: "",
        };
      }

      const step = await createStepMutation.mutateAsync({
        sectionId,
        type,
        title: `New ${QUESTION_TYPES.find((t) => t.value === type)?.label || "Question"}`,
        description: null,
        required: false,
        alias: null,
        options,
        order: nextOrder,
      });

      // Select the newly created step
      selectStep(step.id);

      toast({
        title: "Question added",
        description: `${QUESTION_TYPES.find((t) => t.value === type)?.label} question created`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create question",
        variant: "destructive",
      });
    }
  };

  // Filter question types based on mode
  const availableTypes = QUESTION_TYPES.filter(
    (type) => !type.advancedOnly || mode === 'advanced'
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="w-3 h-3 mr-1" />
          Add Question
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {availableTypes.map((type) => (
          <DropdownMenuItem
            key={type.value}
            onClick={() => handleAddQuestion(type.value)}
          >
            <span className="mr-2 text-lg">{type.icon}</span>
            {type.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
