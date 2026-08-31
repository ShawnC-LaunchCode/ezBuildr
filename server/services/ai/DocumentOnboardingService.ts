/**
 * Document Onboarding Service (GH-167)
 *
 * Orchestration only — every capability this composes already exists and
 * works:
 *  - `documentAIAssistService` (server/lib/ai/DocumentAIAssistService.ts)
 *    extracts variables from an uploaded document and suggests aliases. The
 *    client calls it directly via `/api/ai/doc/analyze` and
 *    `/api/ai/doc/suggest-improvements` *before* this service is invoked —
 *    those are review-time steps, not this service's job.
 *  - `createAIServiceFromEnv(...).generateWorkflow(...)` (WorkflowGenerationService,
 *    already backing `POST /api/ai/workflows/generate`) turns a natural-
 *    language description into an `AIGeneratedWorkflow` (pages/steps).
 *    Before this ticket that endpoint had zero client callers; this service
 *    gives it one.
 *
 * This service's only real job: turn the author-approved variable list
 * (each with a reviewed **type** and **alias** — see AC2) into a
 * description/placeholder pair for the generator, then force the generator's
 * output to match the approved edits exactly. The freeform LLM step is not
 * authoritative over type/alias — what the author saw on the review screen
 * must be what gets persisted, so every approved variable is guaranteed to
 * land as exactly one step carrying its approved type and alias, whatever
 * the model actually produced.
 *
 * Logic rules and transform blocks are deliberately dropped from the
 * returned payload (forced to `[]`): the only caller that persists this
 * payload (`PUT /api/workflows/:id`, `WorkflowService.replaceWorkflowContent`)
 * validates the request body through `updateWorkflowSchema`, which does not
 * accept `logicRules`/`transformBlocks` at all — see workflows.routes.ts.
 * Generating rules the persistence path would silently discard would just
 * mislead the review screen, and widening that route's schema is outside
 * this ticket's file scope.
 */
import { randomUUID } from "crypto";

import {
  AIGeneratedWorkflowSchema,
  type AIGeneratedWorkflow,
  type AIGeneratedPage,
  type AIGeneratedStep,
} from "../../../shared/types/ai";
import { RUNNER_RENDERED_STEP_TYPES } from "../../../shared/types/runnerStepTypes";
import { resolveTextConfig, type TextAdvancedConfig } from "../../../shared/types/stepConfigs";
import { createLogger } from "../../logger";
import { createAIServiceFromEnv } from "../AIService";
import { accountService } from "../AccountService";
import { projectService } from "../ProjectService";

const logger = createLogger({ module: "document-onboarding-service" });

const RUNNER_TYPE_SET = new Set<string>(RUNNER_RENDERED_STEP_TYPES);
const MAX_VARIABLES = 200;
const ADDITIONAL_FIELDS_PAGE_ID = "additional_fields";
const ADDITIONAL_FIELDS_PAGE_TITLE = "Additional Fields";

export interface OnboardingVariableInput {
  /** Original variable/placeholder name as extracted from the document. */
  name: string;
  /** Author-approved step type — must be a runner-fillable step type. */
  type: string;
  /** Author-approved alias (human-friendly variable name). */
  alias: string;
  /** Optional human-readable label; falls back to a title-cased `name`. */
  label?: string;
  /** Canonical text settings selected by a friendly authoring preset. */
  config?: TextAdvancedConfig;
}

export interface GenerateOnboardingWorkflowInput {
  projectId: string;
  documentName: string;
  variables: OnboardingVariableInput[];
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function titleCase(raw: string): string {
  const words = raw
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) {
    return raw;
  }
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

export class DocumentOnboardingService {
  /**
   * Compose an `AIGeneratedWorkflow` from document-extracted variables the
   * author has already reviewed and edited. Nothing is persisted — the
   * caller (the onboarding wizard, via `replaceWorkflowContent`) decides
   * whether and how to save it.
   */
  async generateWorkflowFromVariables(
    userId: string,
    tenantId: string | undefined,
    input: GenerateOnboardingWorkflowInput
  ): Promise<AIGeneratedWorkflow> {
    if (input.variables.length === 0) {
      throw new Error("At least one variable is required to generate a workflow");
    }
    if (input.variables.length > MAX_VARIABLES) {
      throw new Error(`Too many variables (max ${MAX_VARIABLES})`);
    }
    for (const variable of input.variables) {
      if (!RUNNER_TYPE_SET.has(variable.type)) {
        throw new Error(`Unsupported step type: ${variable.type}`);
      }
    }

    // Authorization — 'edit' because the resulting workflow and template
    // will be created inside this project. Throws "Project not found" /
    // "Access denied - ..." which classifyRouteError maps to 404/403.
    await projectService.verifyProjectAccess(input.projectId, userId, "edit");

    const description = this.buildDescription(input);
    const placeholders = input.variables.map((v) => v.name);

    const aiService = createAIServiceFromEnv(tenantId);
    const { defaultMode } = await accountService.getPreferences(userId);
    const generated = await aiService.generateWorkflow({
      description,
      projectId: input.projectId,
      placeholders,
      constraints: {
        maxPages: 10,
        maxStepsPerPage: Math.max(input.variables.length, 5),
      },
    }, defaultMode);

    const overlaid = this.overlayApprovedFields(generated, input.variables);

    logger.info(
      {
        userId,
        projectId: input.projectId,
        variableCount: input.variables.length,
        pageCount: overlaid.pages.length,
      },
      "Document onboarding workflow generated"
    );

    // Re-validate after the overlay — guarantees the shape handed back to
    // the client (and later replayed to replaceWorkflowContent) is a real
    // AIGeneratedWorkflow, not just "was one before we mutated it".
    return AIGeneratedWorkflowSchema.parse(overlaid);
  }

  private buildDescription(input: GenerateOnboardingWorkflowInput): string {
    const fieldList = input.variables.map((v) => v.label ?? titleCase(v.name)).join(", ");
    return (
      `Generate a document-intake workflow for the document "${input.documentName}" that collects ` +
      `the following fields extracted from it: ${fieldList}. Group related fields into logical ` +
      `pages and use clear, professional question titles.`
    );
  }

  /**
   * Force every approved variable onto exactly one step carrying its
   * approved type and alias. Matches generated steps to variables by
   * normalized alias/title first; anything left unmatched is appended so no
   * approved variable is ever silently dropped (AC5 depends on this: every
   * approved variable must land in the persisted workflow).
   */
  private overlayApprovedFields(
    workflow: AIGeneratedWorkflow,
    variables: OnboardingVariableInput[]
  ): AIGeneratedWorkflow {
    const pages: AIGeneratedPage[] = workflow.pages.map((s) => ({
      ...s,
      steps: s.steps.map((step) => this.canonicalizeTextStep(step)),
    }));
    const remaining = new Map<string, OnboardingVariableInput>(
      variables.map((v) => [normalize(v.alias || v.name), v])
    );

    for (const page of pages) {
      for (let i = 0; i < page.steps.length; i++) {
        const match = this.findMatch(page.steps[i], remaining);
        if (match) {
          page.steps[i] = this.applyVariable(page.steps[i], match);
          remaining.delete(normalize(match.alias || match.name));
        }
      }
    }

    if (remaining.size > 0) {
      let extra = pages.find((s) => s.id === ADDITIONAL_FIELDS_PAGE_ID);
      if (!extra) {
        extra = {
          id: ADDITIONAL_FIELDS_PAGE_ID,
          title: ADDITIONAL_FIELDS_PAGE_TITLE,
          order: pages.length,
          steps: [],
        };
        pages.push(extra);
      }
      for (const variable of remaining.values()) {
        extra.steps.push(this.buildStep(variable));
      }
    }

    return { ...workflow, pages, logicRules: [], transformBlocks: [] };
  }

  private findMatch(
    step: AIGeneratedStep,
    remaining: Map<string, OnboardingVariableInput>
  ): OnboardingVariableInput | undefined {
    const stepAliasNorm = step.alias ? normalize(step.alias) : "";
    const stepTitleNorm = normalize(step.title);
    for (const variable of remaining.values()) {
      const nameNorm = normalize(variable.name);
      const variableAliasNorm = normalize(variable.alias || variable.name);
      if (
        (stepAliasNorm.length > 0 && (stepAliasNorm === variableAliasNorm || stepAliasNorm === nameNorm)) ||
        stepTitleNorm === nameNorm ||
        stepTitleNorm === variableAliasNorm
      ) {
        return variable;
      }
    }
    return undefined;
  }

  private applyVariable(step: AIGeneratedStep, variable: OnboardingVariableInput): AIGeneratedStep {
    const config = variable.type === "text" ? resolveTextConfig("text", variable.config) : step.config;
    return {
      ...step,
      type: variable.type as AIGeneratedStep["type"],
      alias: variable.alias,
      config,
    };
  }

  private buildStep(variable: OnboardingVariableInput): AIGeneratedStep {
    return {
      id: `field_${randomUUID()}`,
      type: variable.type as AIGeneratedStep["type"],
      title: variable.label ?? titleCase(variable.name),
      alias: variable.alias,
      required: false,
      ...(variable.type === "text" ? { config: resolveTextConfig("text", variable.config) } : {}),
    };
  }

  /** Explicit old-row/AI-output adapter; generated definitions leave this service canonical. */
  private canonicalizeTextStep(step: AIGeneratedStep): AIGeneratedStep {
    if (step.type !== "text") {
      return step;
    }
    return {
      ...step,
      type: "text",
      config: resolveTextConfig(step.type, step.config),
    };
  }
}

export const documentOnboardingService = new DocumentOnboardingService();
