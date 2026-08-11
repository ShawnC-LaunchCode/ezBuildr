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

import {
  interpolateRunnerText,
  type RunnerAnswerDefinitions,
} from "../runnerInterpolation";

export interface DisplayBlockProps {
  step: Step;
  context?: Record<string, unknown>;
  /** Maps a step's alias (the authoring variable name) to its step id, so `{{alias}}` can resolve against the id-keyed context. */
  aliasMap?: Record<string, string>;
  /** Answer type/config keyed by the same ids as `context`, used by the canonical display formatter. */
  answerDefinitions?: RunnerAnswerDefinitions;
}

export function DisplayBlockRenderer({ step, context, aliasMap, answerDefinitions }: DisplayBlockProps) {
  const config = step.config as DisplayConfig;
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const rawMarkdown = config?.markdown || step.description || "";

  // Interpolate variables
  const markdown = interpolateRunnerText(rawMarkdown, context, aliasMap, answerDefinitions);

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
