import { eq, desc, or } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { workflowBlueprints, workflows, workflowVersions } from '../../shared/schema';
import { db } from '../db';
export interface CreateTemplateParams {
  name: string;
  description?: string;
  sourceWorkflowId: string;
  sourceVersionId?: string; // If not provided, uses current/pinned
  creatorId: string;
  tenantId: string;
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
  async createFromWorkflow(params: CreateTemplateParams) {
    const { name, description, sourceWorkflowId, sourceVersionId, creatorId, tenantId, metadata, isPublic } = params;
    // 1. Fetch source workflow version definition
    let versionId = sourceVersionId;
    if (!versionId) {
      const workflow = await db.query.workflows.findFirst({
        where: eq(workflows.id, sourceWorkflowId),
        columns: { currentVersionId: true, pinnedVersionId: true }
      });
      if (!workflow) {throw new Error("Workflow not found");}
      versionId = workflow.currentVersionId || workflow.pinnedVersionId || undefined;
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
      metadata: metadata || {},
      isPublic: isPublic || false,
    }).returning();
    return blueprint;
  }
  /**
   * List templates available to a user/tenant.
   */
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
    // 2. Create Workflow
    const workflowId = uuidv4();
    const versionId = uuidv4();
    const workflowName = name || `${template.name} (Copy)`;
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
    return { workflowId, versionId };
  }
}
export const templateService = new TemplateService();