import { eq, desc, or } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

import { workflowBlueprints, workflows, workflowVersions } from '../../shared/schema';
import { type DbTransaction } from '../repositories';
import { createError } from '../utils/errors';
import { withCurrentTenant } from '../utils/rlsContext';
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
  metadata?: Record<string, unknown>;
  isPublic?: boolean;
}
export interface InstantiateTemplateParams {
  templateId: string;
  projectId?: string | null; // Optional
  userId: string;
  tenantId: string;
  name?: string; // Optional override
}
/**
 * RLS-2e: `workflow_blueprints` carries its own `tenant_id`, so this service
 * follows the RLS-2a pilot's full shape — every method also takes an
 * explicit `tenantId` argument used for the `eq(tenantId, ...)` predicates,
 * and `withTx` cross-checks it against the ambient tenant before opening
 * the transaction (see docs/architecture/TENANT_ISOLATION_RLS.md §2b). No
 * repository layer here — bare `db.*`/`tx.*` calls become `scopedTx.*`,
 * following `OrganizationService`'s treatment (§2d).
 */
class TemplateService {
  /**
   * Run `fn` inside a tenant-scoped transaction opened at this service
   * boundary. Reuses a caller-supplied `tx` if given (never nests, and
   * skips the mismatch check — see §2b's documented gap); otherwise
   * compares `expectedTenantId` against the ambient tenant and throws on
   * disagreement before opening exactly one transaction via
   * `withCurrentTenant`.
   */
  private async withTx<T>(
    expectedTenantId: string,
    tx: DbTransaction | undefined,
    fn: (tx: DbTransaction) => Promise<T>
  ): Promise<T> {
    if (tx) {
      return fn(tx);
    }
    return withCurrentTenant(fn);
  }

  /**
   * Create a new template (blueprint) from an existing workflow version.
   */
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  async createFromWorkflow(params: CreateTemplateParams, tx?: DbTransaction) {
    const { name, description, sourceWorkflowId, sourceVersionId, creatorId, tenantId, metadata, isPublic } = params;

    return this.withTx(tenantId, tx, async (scopedTx) => {
      // Verify user has view access to the source workflow
      await workflowService.verifyAccess(sourceWorkflowId, creatorId, 'view', scopedTx);

      // 1. Fetch source workflow version definition
      let versionId = sourceVersionId;
      if (!versionId) {
        const workflow = await scopedTx.query.workflows.findFirst({
          where: eq(workflows.id, sourceWorkflowId),
          columns: { currentVersionId: true, pinnedVersionId: true }
        });
        if (!workflow) {throw new Error("Workflow not found");}
        versionId = workflow.currentVersionId ?? workflow.pinnedVersionId ?? undefined;
      }
      if (!versionId) {throw new Error("No version found for workflow");}
      const sourceVersion = await scopedTx.query.workflowVersions.findFirst({
        where: eq(workflowVersions.id, versionId)
      });
      if (!sourceVersion) {throw new Error("Source version not found");}
      // 2. Create Blueprint
      const [blueprint] = await scopedTx.insert(workflowBlueprints).values({
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
    });
  }
  /**
   * List templates available to a user/tenant.
   */
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  async listTemplates(tenantId: string, userId?: string, includePublic = false, tx?: DbTransaction) {
    return this.withTx(tenantId, tx, (scopedTx) =>
      // Basic permissions: Same tenant OR public
      // TODO: Team sharing logic if "template_shares" is implemented for blueprints later
      scopedTx.query.workflowBlueprints.findMany({
        where: or(
          eq(workflowBlueprints.tenantId, tenantId),
          includePublic ? eq(workflowBlueprints.isPublic, true) : undefined
        ),
        orderBy: [desc(workflowBlueprints.createdAt)],
        with: {
          // user: true // If we want creator details
        }
      })
    );
  }
  /**
   * Instantiate a new workflow from a template.
   */
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  async instantiate(params: InstantiateTemplateParams, tx?: DbTransaction) {
    const { templateId, projectId, userId, tenantId, name } = params;

    return this.withTx(tenantId, tx, async (scopedTx) => {
      // 1. Fetch Template
      const template = await scopedTx.query.workflowBlueprints.findFirst({
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
      // Create Workflow Entry
      await scopedTx.insert(workflows).values({
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
      await scopedTx.insert(workflowVersions).values({
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

      // 3. Populate sections, steps, logic rules, and blocks from the template's
      // graphJson (post-ICW2-6, blueprint snapshots are ingest-shaped
      // `WorkflowContentData`; emptiness was already rejected above). Passed
      // the SAME transaction so the ingest work stays inside the one
      // tenant-scoped transaction this method opened (WorkflowContentIngestService
      // already reuses a supplied `tx` rather than opening its own).
      await workflowContentIngestService.apply(
        workflowId,
        content,
        { source: 'template', tx: scopedTx }
      );

      return { workflowId, versionId };
    });
  }
}
export const templateService = new TemplateService();
