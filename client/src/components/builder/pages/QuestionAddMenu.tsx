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
import { useCreateStep } from "@/lib/vault-hooks";
import { useToast } from "@/hooks/use-toast";
import { useWorkflowBuilder } from "@/store/workflow-builder";
import type { ApiStep } from "@/lib/vault-api";

interface QuestionAddMenuProps {
  sectionId: string;
  nextOrder: number;
}

const QUESTION_TYPES = [
  { value: "short_text", label: "Short Text", icon: "T" },
  { value: "long_text", label: "Long Text", icon: "¶" },
  { value: "radio", label: "Radio (Single Choice)", icon: "◉" },
  { value: "multiple_choice", label: "Multiple Choice", icon: "☑" },
  { value: "yes_no", label: "Yes/No", icon: "?" },
  { value: "date_time", label: "Date/Time", icon: "📅" },
  { value: "file_upload", label: "File Upload", icon: "📎" },
] as const;

export function QuestionAddMenu({ sectionId, nextOrder }: QuestionAddMenuProps) {
  const createStepMutation = useCreateStep();
  const { toast } = useToast();
  const { selectStep } = useWorkflowBuilder();

  const handleAddQuestion = async (type: ApiStep["type"]) => {
    try {
      const step = await createStepMutation.mutateAsync({
        sectionId,
        type,
        title: `New ${QUESTION_TYPES.find((t) => t.value === type)?.label || "Question"}`,
        description: null,
        required: false,
        options: type === "radio" || type === "multiple_choice"
          ? { options: ["Option 1", "Option 2", "Option 3"] }
          : null,
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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="w-3 h-3 mr-1" />
          Add Question
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {QUESTION_TYPES.map((type) => (
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
