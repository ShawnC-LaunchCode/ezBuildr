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
}

export function DisplayBlockRenderer({ step }: DisplayBlockProps) {
  const config = step.config as DisplayConfig;
  const markdown = config?.markdown || step.description || "";
  const allowHtml = config?.allowHtml ?? false;

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
