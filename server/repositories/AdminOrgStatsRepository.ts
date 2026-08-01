import { sql } from "drizzle-orm";

import { db } from "../db";

interface RawExecuteResult<T> {
  rows?: T[];
}

type OrgIdentityColumn = "org_id" | "org_name";
type NullableTextColumn = "slug" | "domain" | "tenant_id" | "tenant_name";
type TimestampColumn = "created_at" | "last_run_at";
type NumericColumn =
  | "member_count"
  | "admin_member_count"
  | "project_count"
  | "active_project_count"
  | "archived_project_count"
  | "workflow_count"
  | "active_workflow_count"
  | "draft_workflow_count"
  | "archived_workflow_count"
  | "public_workflow_count"
  | "database_count"
  | "native_database_count"
  | "external_database_count"
  | "table_count"
  | "column_count"
  | "row_count"
  | "value_count"
  | "template_count"
  | "template_version_count"
  | "generated_document_count"
  | "datavault_storage_bytes"
  | "generated_document_storage_bytes"
  | "template_storage_bytes"
  | "total_run_count"
  | "completed_run_count"
  | "in_progress_run_count"
  | "runs_24h"
  | "runs_7d"
  | "runs_30d";

export type AdminOrgStatsQueryRow =
  Record<OrgIdentityColumn, string>
  & Record<NullableTextColumn, string | null>
  & Record<TimestampColumn, Date | string | null>
  & Record<NumericColumn, number | string | null>;

function rowsFromResult<T>(result: unknown): T[] {
  if (Array.isArray(result)) {
    return result as T[];
  }

  return ((result as RawExecuteResult<T>).rows ?? []);
}

const orgStatsQuery = sql`
      WITH org_scope AS (
        SELECT
          o.id::text AS org_id,
          o.name AS org_name,
          o.slug,
          o.domain,
          o.tenant_id::text AS tenant_id,
          t.name AS tenant_name,
          o.created_at
        FROM organizations o
        LEFT JOIN tenants t ON t.id = o.tenant_id
      ),
      member_rollup AS (
        SELECT
          org_id::text AS org_id,
          COUNT(*)::int AS member_count,
          SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END)::int AS admin_member_count
        FROM organization_memberships
        GROUP BY org_id
      ),
      attributed_projects AS (
        SELECT
          p.id,
          p.owner_uuid AS org_id,
          p.status,
          p.archived,
          p.created_at
        FROM projects p
        WHERE p.owner_type = 'org' AND p.owner_uuid IS NOT NULL
      ),
      project_rollup AS (
        SELECT
          org_id,
          COUNT(*)::int AS project_count,
          SUM(CASE WHEN status = 'active' AND archived = false THEN 1 ELSE 0 END)::int AS active_project_count,
          SUM(CASE WHEN status = 'archived' OR archived = true THEN 1 ELSE 0 END)::int AS archived_project_count
        FROM attributed_projects
        GROUP BY org_id
      ),
      attributed_workflows AS (
        SELECT
          w.id,
          CASE
            WHEN w.owner_type = 'org' THEN w.owner_uuid
            WHEN p.owner_type = 'org' THEN p.owner_uuid
            ELSE NULL
          END AS org_id,
          w.status,
          w.is_public,
          w.created_at,
          w.updated_at
        FROM workflows w
        LEFT JOIN projects p ON p.id = w.project_id
        WHERE
          (w.owner_type = 'org' AND w.owner_uuid IS NOT NULL)
          OR (p.owner_type = 'org' AND p.owner_uuid IS NOT NULL)
      ),
      workflow_rollup AS (
        SELECT
          org_id,
          COUNT(*)::int AS workflow_count,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END)::int AS active_workflow_count,
          SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END)::int AS draft_workflow_count,
          SUM(CASE WHEN status = 'archived' THEN 1 ELSE 0 END)::int AS archived_workflow_count,
          SUM(CASE WHEN is_public THEN 1 ELSE 0 END)::int AS public_workflow_count
        FROM attributed_workflows
        WHERE org_id IS NOT NULL
        GROUP BY org_id
      ),
      attributed_databases AS (
        SELECT
          d.id,
          CASE
            WHEN d.owner_type = 'org' THEN d.owner_uuid
            WHEN scoped_project.owner_type = 'org' THEN scoped_project.owner_uuid
            WHEN scoped_workflow.owner_type = 'org' THEN scoped_workflow.owner_uuid
            WHEN scoped_workflow_project.owner_type = 'org' THEN scoped_workflow_project.owner_uuid
            ELSE NULL
          END AS org_id,
          d.type
        FROM datavault_databases d
        LEFT JOIN projects scoped_project
          ON d.scope_type = 'project' AND d.scope_id = scoped_project.id
        LEFT JOIN workflows scoped_workflow
          ON d.scope_type = 'workflow' AND d.scope_id = scoped_workflow.id
        LEFT JOIN projects scoped_workflow_project
          ON scoped_workflow.project_id = scoped_workflow_project.id
        WHERE
          (d.owner_type = 'org' AND d.owner_uuid IS NOT NULL)
          OR (scoped_project.owner_type = 'org' AND scoped_project.owner_uuid IS NOT NULL)
          OR (scoped_workflow.owner_type = 'org' AND scoped_workflow.owner_uuid IS NOT NULL)
          OR (scoped_workflow_project.owner_type = 'org' AND scoped_workflow_project.owner_uuid IS NOT NULL)
      ),
      database_rollup AS (
        SELECT
          org_id,
          COUNT(*)::int AS database_count,
          SUM(CASE WHEN type = 'native' THEN 1 ELSE 0 END)::int AS native_database_count,
          SUM(CASE WHEN type <> 'native' THEN 1 ELSE 0 END)::int AS external_database_count
        FROM attributed_databases
        WHERE org_id IS NOT NULL
        GROUP BY org_id
      ),
      attributed_tables AS (
        SELECT
          dt.id,
          CASE
            WHEN dt.owner_type = 'org' THEN dt.owner_uuid
            WHEN d.owner_type = 'org' THEN d.owner_uuid
            WHEN scoped_project.owner_type = 'org' THEN scoped_project.owner_uuid
            WHEN scoped_workflow.owner_type = 'org' THEN scoped_workflow.owner_uuid
            WHEN scoped_workflow_project.owner_type = 'org' THEN scoped_workflow_project.owner_uuid
            ELSE NULL
          END AS org_id
        FROM datavault_tables dt
        LEFT JOIN datavault_databases d ON d.id = dt.database_id
        LEFT JOIN projects scoped_project
          ON d.scope_type = 'project' AND d.scope_id = scoped_project.id
        LEFT JOIN workflows scoped_workflow
          ON d.scope_type = 'workflow' AND d.scope_id = scoped_workflow.id
        LEFT JOIN projects scoped_workflow_project
          ON scoped_workflow.project_id = scoped_workflow_project.id
        WHERE
          (dt.owner_type = 'org' AND dt.owner_uuid IS NOT NULL)
          OR (d.owner_type = 'org' AND d.owner_uuid IS NOT NULL)
          OR (scoped_project.owner_type = 'org' AND scoped_project.owner_uuid IS NOT NULL)
          OR (scoped_workflow.owner_type = 'org' AND scoped_workflow.owner_uuid IS NOT NULL)
          OR (scoped_workflow_project.owner_type = 'org' AND scoped_workflow_project.owner_uuid IS NOT NULL)
      ),
      table_rollup AS (
        SELECT org_id, COUNT(*)::int AS table_count
        FROM attributed_tables
        WHERE org_id IS NOT NULL
        GROUP BY org_id
      ),
      column_rollup AS (
        SELECT at.org_id, COUNT(dc.id)::int AS column_count
        FROM attributed_tables at
        JOIN datavault_columns dc ON dc.table_id = at.id
        WHERE at.org_id IS NOT NULL
        GROUP BY at.org_id
      ),
      row_rollup AS (
        SELECT at.org_id, COUNT(dr.id)::int AS row_count
        FROM attributed_tables at
        JOIN datavault_rows dr ON dr.table_id = at.id AND dr.deleted_at IS NULL
        WHERE at.org_id IS NOT NULL
        GROUP BY at.org_id
      ),
      datavault_storage_rollup AS (
        SELECT
          at.org_id,
          COUNT(dv.id)::int AS value_count,
          COALESCE(SUM(pg_column_size(dv.value)), 0)::bigint AS datavault_storage_bytes
        FROM attributed_tables at
        LEFT JOIN datavault_rows dr ON dr.table_id = at.id AND dr.deleted_at IS NULL
        LEFT JOIN datavault_values dv ON dv.row_id = dr.id
        WHERE at.org_id IS NOT NULL
        GROUP BY at.org_id
      ),
      attributed_runs AS (
        SELECT
          wr.id,
          CASE
            WHEN wr.owner_type = 'org' THEN wr.owner_uuid
            WHEN w.owner_type = 'org' THEN w.owner_uuid
            WHEN p.owner_type = 'org' THEN p.owner_uuid
            ELSE NULL
          END AS org_id,
          wr.created_at,
          wr.completed
        FROM workflow_runs wr
        JOIN workflows w ON w.id = wr.workflow_id
        LEFT JOIN projects p ON p.id = w.project_id
        WHERE
          (wr.owner_type = 'org' AND wr.owner_uuid IS NOT NULL)
          OR (w.owner_type = 'org' AND w.owner_uuid IS NOT NULL)
          OR (p.owner_type = 'org' AND p.owner_uuid IS NOT NULL)
      ),
      run_rollup AS (
        SELECT
          org_id,
          COUNT(*)::int AS total_run_count,
          SUM(CASE WHEN completed = true THEN 1 ELSE 0 END)::int AS completed_run_count,
          SUM(CASE WHEN COALESCE(completed, false) = false THEN 1 ELSE 0 END)::int AS in_progress_run_count,
          SUM(CASE WHEN created_at >= now() - interval '24 hours' THEN 1 ELSE 0 END)::int AS runs_24h,
          SUM(CASE WHEN created_at >= now() - interval '7 days' THEN 1 ELSE 0 END)::int AS runs_7d,
          SUM(CASE WHEN created_at >= now() - interval '30 days' THEN 1 ELSE 0 END)::int AS runs_30d,
          MAX(created_at) AS last_run_at
        FROM attributed_runs
        WHERE org_id IS NOT NULL
        GROUP BY org_id
      ),
      generated_document_rollup AS (
        SELECT
          ar.org_id,
          COUNT(rgd.id)::int AS generated_document_count,
          COALESCE(SUM(rgd.file_size), 0)::bigint AS generated_document_storage_bytes
        FROM attributed_runs ar
        JOIN run_generated_documents rgd ON rgd.run_id = ar.id
        WHERE ar.org_id IS NOT NULL
        GROUP BY ar.org_id
      ),
      attributed_templates AS (
        SELECT
          t.id,
          ap.org_id,
          t.metadata
        FROM templates t
        JOIN attributed_projects ap ON ap.id = t.project_id
        WHERE ap.org_id IS NOT NULL
      ),
      template_base_storage AS (
        SELECT
          org_id,
          COUNT(id)::int AS template_count,
          COALESCE(SUM(
            CASE
              WHEN metadata ? 'size' AND metadata->>'size' ~ '^[0-9]+$'
                THEN (metadata->>'size')::bigint
              ELSE 0
            END
          ), 0)::bigint AS template_base_storage_bytes
        FROM attributed_templates
        GROUP BY org_id
      ),
      template_version_storage AS (
        SELECT
          at.org_id,
          COUNT(tv.id)::int AS template_version_count,
          COALESCE(SUM(
            CASE
              WHEN tv.metadata ? 'size' AND tv.metadata->>'size' ~ '^[0-9]+$'
                THEN (tv.metadata->>'size')::bigint
              ELSE 0
            END
          ), 0)::bigint AS template_version_storage_bytes
        FROM attributed_templates at
        JOIN template_versions tv ON tv.template_id = at.id
        GROUP BY at.org_id
      ),
      template_storage_rollup AS (
        SELECT
          COALESCE(tbs.org_id, tvs.org_id) AS org_id,
          COALESCE(tbs.template_count, 0)::int AS template_count,
          COALESCE(tvs.template_version_count, 0)::int AS template_version_count,
          (
            COALESCE(tbs.template_base_storage_bytes, 0)
            + COALESCE(tvs.template_version_storage_bytes, 0)
          )::bigint AS template_storage_bytes
        FROM template_base_storage tbs
        FULL OUTER JOIN template_version_storage tvs ON tvs.org_id = tbs.org_id
      )
      SELECT
        os.org_id,
        os.org_name,
        os.slug,
        os.domain,
        os.tenant_id,
        os.tenant_name,
        os.created_at,
        COALESCE(mr.member_count, 0) AS member_count,
        COALESCE(mr.admin_member_count, 0) AS admin_member_count,
        COALESCE(pr.project_count, 0) AS project_count,
        COALESCE(pr.active_project_count, 0) AS active_project_count,
        COALESCE(pr.archived_project_count, 0) AS archived_project_count,
        COALESCE(wr.workflow_count, 0) AS workflow_count,
        COALESCE(wr.active_workflow_count, 0) AS active_workflow_count,
        COALESCE(wr.draft_workflow_count, 0) AS draft_workflow_count,
        COALESCE(wr.archived_workflow_count, 0) AS archived_workflow_count,
        COALESCE(wr.public_workflow_count, 0) AS public_workflow_count,
        COALESCE(dr.database_count, 0) AS database_count,
        COALESCE(dr.native_database_count, 0) AS native_database_count,
        COALESCE(dr.external_database_count, 0) AS external_database_count,
        COALESCE(tr.table_count, 0) AS table_count,
        COALESCE(cr.column_count, 0) AS column_count,
        COALESCE(rr.row_count, 0) AS row_count,
        COALESCE(dsr.value_count, 0) AS value_count,
        COALESCE(tsr.template_count, 0) AS template_count,
        COALESCE(tsr.template_version_count, 0) AS template_version_count,
        COALESCE(gdr.generated_document_count, 0) AS generated_document_count,
        COALESCE(dsr.datavault_storage_bytes, 0) AS datavault_storage_bytes,
        COALESCE(gdr.generated_document_storage_bytes, 0) AS generated_document_storage_bytes,
        COALESCE(tsr.template_storage_bytes, 0) AS template_storage_bytes,
        COALESCE(rur.total_run_count, 0) AS total_run_count,
        COALESCE(rur.completed_run_count, 0) AS completed_run_count,
        COALESCE(rur.in_progress_run_count, 0) AS in_progress_run_count,
        COALESCE(rur.runs_24h, 0) AS runs_24h,
        COALESCE(rur.runs_7d, 0) AS runs_7d,
        COALESCE(rur.runs_30d, 0) AS runs_30d,
        rur.last_run_at
      FROM org_scope os
      LEFT JOIN member_rollup mr ON mr.org_id = os.org_id
      LEFT JOIN project_rollup pr ON pr.org_id = os.org_id
      LEFT JOIN workflow_rollup wr ON wr.org_id = os.org_id
      LEFT JOIN database_rollup dr ON dr.org_id = os.org_id
      LEFT JOIN table_rollup tr ON tr.org_id = os.org_id
      LEFT JOIN column_rollup cr ON cr.org_id = os.org_id
      LEFT JOIN row_rollup rr ON rr.org_id = os.org_id
      LEFT JOIN datavault_storage_rollup dsr ON dsr.org_id = os.org_id
      LEFT JOIN generated_document_rollup gdr ON gdr.org_id = os.org_id
      LEFT JOIN template_storage_rollup tsr ON tsr.org_id = os.org_id
      LEFT JOIN run_rollup rur ON rur.org_id = os.org_id
      ORDER BY COALESCE(rur.runs_30d, 0) DESC, COALESCE(wr.workflow_count, 0) DESC, os.org_name ASC
    `;

export class AdminOrgStatsRepository {
  constructor(private readonly database: typeof db = db) {}

  async listOrgStats(): Promise<AdminOrgStatsQueryRow[]> {
    const result = await this.database.execute(orgStatsQuery);

    return rowsFromResult<AdminOrgStatsQueryRow>(result);
  }
}

export const adminOrgStatsRepository = new AdminOrgStatsRepository();
