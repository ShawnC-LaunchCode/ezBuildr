import {  Sparkles, X } from "lucide-react";
import React, { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
export function AdvancedModeBanner() {
  const [isVisible, setIsVisible] = useState(true);
  if (!isVisible) {return null;}
  return (
    <Alert className="relative border-indigo-200 bg-indigo-50/80 dark:bg-indigo-950/30 dark:border-indigo-800">
      <Sparkles className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
      <AlertDescription className="text-sm pr-6">
        <span className="font-semibold text-indigo-900 dark:text-indigo-100">Advanced Mode Active:</span>{" "}
        <span className="text-indigo-800 dark:text-indigo-200">
          You have access to all features including JS Transform blocks, custom validation rules, and advanced logic operators.
        </span>
      </AlertDescription>
      <button
        type="button"
        className="absolute right-2 top-2 h-8 w-8 !p-0 grid place-items-center rounded-md text-indigo-500 transition-colors hover:text-indigo-700 hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:text-indigo-400 dark:hover:text-indigo-200 dark:hover:bg-indigo-900"
        onClick={() => setIsVisible(false)}
        aria-label="Dismiss"
      >
        <X className="h-5 w-5" />
      </button>
    </Alert>
  );
}