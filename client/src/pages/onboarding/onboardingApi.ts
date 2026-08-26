/**
 * Network calls for the document onboarding wizard (GH-167).
 *
 * Split out from the wizard components so the "what gets sent on approve"
 * and "what happens when the AI call fails" behavior (AC2, AC4) can be
 * tested without mounting the whole step chrome.
 */
import { fetchAPI, getAccessToken, workflowAPI } from "@/lib/vault-api";

import type { AnalyzeDocumentResult, OnboardingVariable } from "./onboardingTypes";
import type { AIGeneratedWorkflow } from "@shared/types/ai";
import type { DocumentFieldMapping } from "@shared/types/documentMapping";

/**
 * Raised by calls that carry a server-provided `retryable` flag (AI
 * timeouts/provider failures vs. permanent failures like validation errors
 * or access denial) so the wizard can decide whether to offer "Try again".
 */
export class OnboardingApiError extends Error {
  readonly retryable: boolean;
  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = "OnboardingApiError";
    this.retryable = retryable;
  }
}

function authHeaderOnly(): Record<string, string> {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function parseJsonSafely<T>(response: Response): Promise<Partial<T>> {
  try {
    return (await response.json()) as Partial<T>;
  } catch {
    return {};
  }
}

/** `POST /api/ai/doc/analyze` — multipart upload, extracts variables. */
export async function analyzeDocument(file: File): Promise<AnalyzeDocumentResult> {
  const body = new FormData();
  body.append("file", file);
  const response = await fetch("/api/ai/doc/analyze", {
    method: "POST",
    headers: authHeaderOnly(),
    credentials: "include",
    body,
  });
  const payload = await parseJsonSafely<{ data: AnalyzeDocumentResult; error: string }>(response);
  if (!response.ok) {
    throw new Error(payload.error ?? `Document analysis failed (${response.status})`);
  }
  if (!payload.data) {
    throw new Error("Document analysis returned no data");
  }
  return payload.data;
}

/**
 * `POST /api/ai/doc/suggest-improvements` — best-effort alias seeding.
 * Failure here must never block the wizard: the review step falls back to a
 * locally-derived alias, so a network error is swallowed and reported as an
 * empty suggestion map rather than surfaced to the author.
 */
export async function suggestAliases(names: string[]): Promise<Record<string, string>> {
  try {
    const payload = await fetchAPI<{ data?: { aliases?: Record<string, string> } }>(
      "/api/ai/doc/suggest-improvements",
      {
        method: "POST",
        body: JSON.stringify({ variables: names.map((name) => ({ name })) }),
      }
    );
    return payload.data?.aliases ?? {};
  } catch {
    return {};
  }
}

export interface OnboardingVariablePayload {
  name: string;
  type: string;
  alias: string;
  label?: string;
}

function toPayload(variables: OnboardingVariable[]): OnboardingVariablePayload[] {
  return variables.map((v) => ({ name: v.name, type: v.type, alias: v.alias, label: v.label }));
}

/**
 * `POST /api/ai/doc/onboarding/generate-workflow` — the orchestration
 * endpoint. Hand-rolled (not `fetchAPI`) so the server's `retryable` flag
 * survives onto a typed error the wizard can branch on (AC4).
 */
export async function generateOnboardingWorkflow(input: {
  projectId: string;
  documentName: string;
  variables: OnboardingVariable[];
}): Promise<AIGeneratedWorkflow> {
  const response = await fetch("/api/ai/doc/onboarding/generate-workflow", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaderOnly() },
    credentials: "include",
    body: JSON.stringify({
      projectId: input.projectId,
      documentName: input.documentName,
      variables: toPayload(input.variables),
    }),
  });
  const payload = await parseJsonSafely<{ data: AIGeneratedWorkflow; error: string; retryable: boolean }>(response);
  if (!response.ok) {
    throw new OnboardingApiError(
      payload.error ?? `Workflow generation failed (${response.status})`,
      payload.retryable === true
    );
  }
  if (!payload.data) {
    throw new OnboardingApiError("Workflow generation returned no data", true);
  }
  return payload.data;
}

/** `PUT /api/workflows/:id` — the existing `replaceWorkflowContent` path. */
async function applyGeneratedContent(workflowId: string, generated: AIGeneratedWorkflow): Promise<void> {
  await fetchAPI(`/api/workflows/${workflowId}`, {
    method: "PUT",
    body: JSON.stringify({
      title: generated.title,
      description: generated.description ?? undefined,
      // Sections must travel with the pages that reference them: a page whose
      // sectionId points at a section the payload never sent lands ungrouped.
      sections: generated.sections,
      pages: generated.pages,
    }),
  });
}

interface CreatedTemplate {
  id: string;
}

/** `POST /api/projects/:projectId/templates` — multipart upload of the original document. */
async function createProjectTemplate(projectId: string, file: File, name: string): Promise<CreatedTemplate> {
  const body = new FormData();
  body.append("file", file);
  body.append("name", name);
  const response = await fetch(`/api/projects/${projectId}/templates`, {
    method: "POST",
    headers: authHeaderOnly(),
    credentials: "include",
    body,
  });
  const payload = await parseJsonSafely<CreatedTemplate & { message: string }>(response);
  if (!response.ok) {
    throw new Error(payload.message ?? `Template upload failed (${response.status})`);
  }
  if (!payload.id) {
    throw new Error("Template upload returned no id");
  }
  return { id: payload.id };
}

/** `PATCH /api/templates/:id` — writes the field mapping (GH-156). */
async function patchTemplateMapping(templateId: string, mapping: DocumentFieldMapping): Promise<void> {
  await fetchAPI(`/api/templates/${templateId}`, {
    method: "PATCH",
    body: JSON.stringify({ mapping }),
  });
}

/**
 * Every extracted document field binds to the workflow step carrying its
 * approved alias. This is deterministic, not AI-suggested: the generated
 * workflow is built (via `DocumentOnboardingService`'s overlay) to guarantee
 * exactly one step per approved variable with that variable's exact alias,
 * so `suggest-mappings`' heuristic name-matching has nothing to add here and
 * would only be another AI call that could fail or disagree.
 */
export function buildDeterministicMapping(variables: OnboardingVariable[]): DocumentFieldMapping {
  const mapping: DocumentFieldMapping = {};
  for (const variable of variables) {
    mapping[variable.name] = { type: "variable", source: variable.alias };
  }
  return mapping;
}

export interface CompleteOnboardingResult {
  workflowId: string;
  templateId: string;
}

/**
 * The Approve action's full pipeline: generate → create workflow → apply
 * content → attach template → write mapping. Each step is a call this
 * module already exposes; kept together here so the wizard has one call to
 * make and one place to catch a failure (AC4).
 */
export async function completeOnboarding(params: {
  projectId: string;
  file: File;
  documentName: string;
  variables: OnboardingVariable[];
}): Promise<CompleteOnboardingResult> {
  const generated = await generateOnboardingWorkflow({
    projectId: params.projectId,
    documentName: params.documentName,
    variables: params.variables,
  });

  const workflow = await workflowAPI.create({
    title: generated.title,
    description: generated.description ?? undefined,
    projectId: params.projectId,
  });

  await applyGeneratedContent(workflow.id, generated);

  const template = await createProjectTemplate(params.projectId, params.file, params.documentName);
  await patchTemplateMapping(template.id, buildDeterministicMapping(params.variables));

  return { workflowId: workflow.id, templateId: template.id };
}
