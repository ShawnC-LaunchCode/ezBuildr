
import {
    Type,
    AlignLeft,
    Circle,
    CheckSquare,
    ToggleLeft,
    Calendar,
    Upload,
    Zap,
    FileText
} from "lucide-react";

import type { StepType } from "@/lib/vault-api";

// Get icon for each question type
export function getQuestionTypeIcon(type: StepType) {
    switch (type) {
        case "short_text":
            return <Type className="h-4 w-4 text-muted-foreground" />;
        case "long_text":
            return <AlignLeft className="h-4 w-4 text-muted-foreground" />;
        case "radio":
            return <Circle className="h-4 w-4 text-muted-foreground" />;
        case "multiple_choice":
            return <CheckSquare className="h-4 w-4 text-muted-foreground" />;
        case "yes_no":
            return <ToggleLeft className="h-4 w-4 text-muted-foreground" />;
        case "date_time":
            return <Calendar className="h-4 w-4 text-muted-foreground" />;
        case "file_upload":
            return <Upload className="h-4 w-4 text-muted-foreground" />;
        case "js_question":
            return <Zap className="h-4 w-4 text-yellow-500" />;
        default:
            return <FileText className="h-4 w-4 text-muted-foreground" />;
    }
}
