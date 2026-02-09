/**
 * AdvancedModeBanner
 * Displays a dismissible banner when the workflow is in "Advanced Mode".
 */

import { Sparkles, X } from "lucide-react";
import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function AdvancedModeBanner() {
  const [isVisible, setIsVisible] = useState(true);

  if (!isVisible) {
    return null;
  }

  return (
    <Alert className="relative border-indigo-200 bg-indigo-50/80 dark:bg-indigo-950/30 dark:border-indigo-800">
      <Sparkles className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
      <AlertDescription className="text-sm pr-6">
        <span className="font-semibold text-indigo-900 dark:text-indigo-100">
          Advanced Mode Active:
        </span>{" "}
        <span className="text-indigo-800 dark:text-indigo-200">
          You have access to all features including JS Transform blocks, custom validation rules, and advanced logic operators.
        </span>
      </AlertDescription>
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-2 top-2 h-6 w-6 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-100 dark:text-indigo-400 dark:hover:text-indigo-200 dark:hover:bg-indigo-900"
        onClick={() => setIsVisible(false)}
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </Button>
    </Alert>
  );
}
