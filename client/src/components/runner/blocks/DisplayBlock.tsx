/**
 * DisplayBlockRenderer - Display-Only Block
 *
 * Features:
 * - Render Markdown content
 * - No value collection
 * - No required validation
 * - Static informational content
 *
 * Storage: NONE (display blocks don't save values)
 */

import React from "react";
import ReactMarkdown from "react-markdown";

import type { Step } from "@/types";

import type { DisplayConfig } from "@/../../shared/types/stepConfigs";

export interface DisplayBlockProps {
  step: Step;
  context?: Record<string, any>;
}

// Helper to interpolate variables like {{variableName}}
function interpolateVariables(text: string, context?: Record<string, any>): string {
  if (!text || !context) {return text;}

  return text.replace(/\{\{([^}]+)\}\}/g, (match, variableName) => {
    const key = variableName.trim();
    const value = context[key];

    if (value === undefined || value === null) {
      return ""; // Replace missing variables with empty string
    }

    if (typeof value === "object") {
      return JSON.stringify(value);
    }

    return String(value);
  });
}

export function DisplayBlockRenderer({ step, context }: DisplayBlockProps) {
  const config = step.config as DisplayConfig;
  const rawMarkdown = config?.markdown || step.description || "";
  const allowHtml = config?.allowHtml ?? false;

  // Interpolate variables
  const markdown = interpolateVariables(rawMarkdown, context);

  if (!markdown) {
    return (
      <div className="text-sm text-muted-foreground italic">
        No content to display
      </div>
    );
  }

  return (
    <div className="prose prose-sm max-w-none dark:prose-invert">
      <ReactMarkdown
        components={{
          // Disable HTML if not allowed
          html: allowHtml ? undefined : () => null,
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
