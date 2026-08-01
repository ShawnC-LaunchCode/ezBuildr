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

import type { DisplayConfig } from "@shared/types/stepConfigs";

export interface DisplayBlockProps {
  step: Step;
  context?: Record<string, unknown>;
  /** Maps a step's alias (the authoring variable name) to its step id, so `{{alias}}` can resolve against the id-keyed context. */
  aliasMap?: Record<string, string>;
}

// Helper to interpolate variables like {{variableName}}. Resolves against
// alias first (the documented authoring variable), then falls back to a raw
// step id for back-compat, then empty string for anything unknown.
function interpolateVariables(
  text: string,
  context?: Record<string, unknown>,
  aliasMap?: Record<string, string>
): string {
  if (!text || !context) {
    return text;
  }

  return text.replace(/\{\{([^}]+)\}\}/g, (_match: string, variableName: string) => {
    const key = variableName.trim();
    const resolvedStepId = aliasMap?.[key];
    const value = resolvedStepId !== undefined ? context[resolvedStepId] : context[key];

    if (value === undefined || value === null) {
      return ""; // Replace missing variables with empty string
    }

    if (typeof value === "object") {
      return JSON.stringify(value);
    }

    return String(value);
  });
}

export function DisplayBlockRenderer({ step, context, aliasMap }: DisplayBlockProps) {
  const config = step.config as DisplayConfig;
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const rawMarkdown = config?.markdown || step.description || "";

  // Interpolate variables
  const markdown = interpolateVariables(rawMarkdown, context, aliasMap);

  if (!markdown) {
    return (
      <div className="text-sm text-muted-foreground italic">
        No content to display
      </div>
    );
  }

  return (
    <div className="prose prose-sm max-w-none dark:prose-invert">
      <ReactMarkdown>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
