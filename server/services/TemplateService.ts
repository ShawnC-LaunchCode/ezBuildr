/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
import { eq, desc, or } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

import { workflowBlueprints, workflows, workflowVersions } from '../../shared/schema';
import { db } from '../db';
import { createError } from '../utils/errors';
import { workflowService } from './WorkflowService';
import { workflowContentIngestService } from './WorkflowContentIngestService';
import type { WorkflowContentData } from './WorkflowContentIngestService';
export interface CreateTemplateParams {
  name: string;
  description?: string;
  sourceWorkflowId: string;
  sourceVersionId?: string; // If not provided, uses current/pinned
  creatorId: string;
  tenantId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- metadata can contain arbitrary template metadata
  metadata?: Record<string, any>;
  isPublic?: boolean;
}
export interface InstantiateTemplateParams {
  templateId: string;
  projectId?: string | null; // Optional
  userId: string;
  tenantId: string;
  name?: string; // Optional override
}
class TemplateService {
  /**
   * Create a new template (blueprint) from an existing workflow version.
   */
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  async createFromWorkflow(params: CreateTemplateParams) {
    const { name, description, sourceWorkflowId, sourceVersionId, creatorId, tenantId, metadata, isPublic } = params;
    
    // Verify user has view access to the source workflow
    await workflowService.verifyAccess(sourceWorkflowId, creatorId, 'view');
    
    // 1. Fetch source workflow version definition
    let versionId = sourceVersionId;
    if (!versionId) {
      const workflow = await db.query.workflows.findFirst({
        where: eq(workflows.id, sourceWorkflowId),
        columns: { currentVersionId: true, pinnedVersionId: true }
      });
      if (!workflow) {throw new Error("Workflow not found");}
      versionId = workflow.currentVersionId ?? workflow.pinnedVersionId ?? undefined;
    }
    if (!versionId) {throw new Error("No version found for workflow");}
    const sourceVersion = await db.query.workflowVersions.findFirst({
      where: eq(workflowVersions.id, versionId)
    });
    if (!sourceVersion) {throw new Error("Source version not found");}
    // 2. Create Blueprint
    const [blueprint] = await db.insert(workflowBlueprints).values({
      name,
      description,
      tenantId,
      creatorId,
      sourceWorkflowId,
      graphJson: sourceVersion.graphJson, // Snapshot!
      metadata: metadata ?? {},
      isPublic: isPublic ?? false,
    }).returning();
    return blueprint;
  }
  /**
   * List templates available to a user/tenant.
   */
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  async listTemplates(tenantId: string, userId?: string, includePublic = false) {
    // Basic permissions: Same tenant OR public
    // TODO: Team sharing logic if "template_shares" is implemented for blueprints later
    return db.query.workflowBlueprints.findMany({
      where: or(
        eq(workflowBlueprints.tenantId, tenantId),
        includePublic ? eq(workflowBlueprints.isPublic, true) : undefined
      ),
      orderBy: [desc(workflowBlueprints.createdAt)],
      with: {
        // user: true // If we want creator details
      }
    });
  }
  /**
   * Instantiate a new workflow from a template.
   */
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  async instantiate(params: InstantiateTemplateParams) {
    const { templateId, projectId, userId, tenantId, name } = params;
    // 1. Fetch Template
    const template = await db.query.workflowBlueprints.findFirst({
      where: eq(workflowBlueprints.id, templateId)
    });
    if (!template) {throw new Error("Template not found");}
    // Check tenant access (simple check)
    if (template.tenantId !== tenantId && !template.isPublic) {
      throw new Error("Access denied to this template");
    }
    // Reject empty/`{}` templates up front (before any workflow is created) so
    // an empty blueprint fails with a clear 400 instead of silently producing
    // a zero-section interview (ICW2-15).
    const content = template.graphJson as WorkflowContentData | null;
    if (!content || !Array.isArray(content.sections) || content.sections.length === 0) {
      throw createError.badRequest("Template has no content");
    }
    // 2. Create Workflow
    const workflowId = uuidv4();
    const versionId = uuidv4();
    const workflowName = name ?? `${template.name} (Copy)`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- drizzle transaction type is complex and auto-inferred
    await db.transaction(async (tx: any) => {
      // Create Workflow Entry
      await tx.insert(workflows).values({
        id: workflowId,
        projectId,
        title: workflowName, // Legacy
        name: workflowName,
        description: template.description,
        creatorId: userId,
        ownerId: userId,
        status: 'draft',
        sourceBlueprintId: template.id, // Traceability
        currentVersionId: versionId // Pre-link version
      });
      // Create Initial Version from Template snapshot
      await tx.insert(workflowVersions).values({
        id: versionId,
        workflowId: workflowId,
        versionNumber: 1,
        isDraft: true,
        graphJson: template.graphJson, // Restore snapshot
        createdBy: userId,
        migrationInfo: {
          sourceTemplateId: template.id,
          instantiatedAt: new Date().toISOString()
        }
      });
    });
    
    // 3. Populate sections, steps, logic rules, and blocks from the template's
    // graphJson (post-ICW2-6, blueprint snapshots are ingest-shaped
    // `WorkflowContentData`; emptiness was already rejected above).
    await workflowContentIngestService.apply(
      workflowId,
      content,
      { source: 'template' }
    );

    return { workflowId, versionId };
  }
}
export const templateService = new TemplateService();
