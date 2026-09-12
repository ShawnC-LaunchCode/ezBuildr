/**
 * Normalizes projects and workflows into the flat `AssetRow` shape the list
 * view sorts and renders.
 */

import type { AssetRow } from "@/components/shared/AssetTable";
import type { EntityAction } from "@/components/shared/EntityCard";
import type { ApiProject, ApiWorkflow } from "@/lib/vault-api";

function ownerLabel(
  asset: { ownerType?: "user" | "org" | null; ownerUuid?: string | null; ownerName?: string | null },
  currentUserId: string | undefined
): string {
  if (asset.ownerType === "org") {
    return asset.ownerName ?? "Organization";
  }
  if (currentUserId !== undefined && asset.ownerUuid === currentUserId) {
    return "You";
  }
  return "Shared";
}

export function projectToAssetRow(
  project: ApiProject & { workflowCount?: number },
  actions: EntityAction[],
  currentUserId?: string
): AssetRow {
  return {
    id: project.id,
    kind: "project",
    title: project.title,
    description: project.description,
    href: `/projects/${project.id}`,
    status: project.status,
    workflowCount: project.workflowCount ?? 0,
    ownerLabel: ownerLabel(project, currentUserId),
    isOrgOwned: project.ownerType === "org",
    updatedAt: project.updatedAt,
    createdAt: project.createdAt,
    actions,
  };
}

export function workflowToAssetRow(
  workflow: ApiWorkflow,
  actions: EntityAction[],
  currentUserId?: string
): AssetRow {
  return {
    id: workflow.id,
    kind: "workflow",
    title: workflow.title,
    description: workflow.description,
    href: `/workflows/${workflow.id}/builder`,
    status: workflow.status,
    // Deliberately absent rather than 0 — a workflow has no workflow count, and
    // `sortAssetRows` sinks these below every project when sorting that column.
    workflowCount: undefined,
    ownerLabel: ownerLabel(workflow, currentUserId),
    isOrgOwned: workflow.ownerType === "org",
    updatedAt: workflow.updatedAt,
    createdAt: workflow.createdAt,
    actions,
  };
}
