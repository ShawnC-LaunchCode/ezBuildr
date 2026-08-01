import {
  adminOrgStatsRepository,
  type AdminOrgStatsQueryRow,
} from "../repositories/AdminOrgStatsRepository";

interface AdminUserContext {
  id: string;
  role: string;
}

interface AdminOrgStatsReader {
  listOrgStats(): Promise<AdminOrgStatsQueryRow[]>;
}

export interface AdminOrgStatsItem {
  id: string;
  name: string;
  slug: string | null;
  domain: string | null;
  tenantId: string | null;
  tenantName: string | null;
  createdAt: string | null;
  members: {
    total: number;
    admins: number;
  };
  projects: {
    total: number;
    active: number;
    archived: number;
  };
  workflows: {
    total: number;
    active: number;
    draft: number;
    archived: number;
    public: number;
  };
  datavault: {
    databases: number;
    nativeDatabases: number;
    externalDatabases: number;
    tables: number;
    columns: number;
    rows: number;
    values: number;
  };
  templates: {
    total: number;
    versions: number;
  };
  storage: {
    totalBytes: number;
    datavaultBytes: number;
    generatedDocumentBytes: number;
    templateBytes: number;
    generatedDocumentCount: number;
  };
  runs: {
    total: number;
    completed: number;
    inProgress: number;
    last24h: number;
    last7d: number;
    last30d: number;
    completionRate: number;
    lastRunAt: string | null;
  };
}

export interface AdminOrgStatsSummary {
  totalOrganizations: number;
  activeOrganizations: number;
  totalProjects: number;
  totalWorkflows: number;
  totalDatabases: number;
  totalTables: number;
  totalRows: number;
  totalStorageBytes: number;
  totalRuns: number;
  runsLast24h: number;
  runsLast7d: number;
  runsLast30d: number;
  busiestOrg: {
    id: string;
    name: string;
    runsLast30d: number;
  } | null;
}

export interface AdminOrgStatsResponse {
  generatedAt: string;
  summary: AdminOrgStatsSummary;
  organizations: AdminOrgStatsItem[];
}

function toNumber(value: number | string | null): number {
  return Number(value ?? 0);
}

function toIsoDate(value: Date | string | null): string | null {
  if (value === null) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function roundPercent(value: number): number {
  return Math.round(value * 10) / 10;
}

function mapRow(row: AdminOrgStatsQueryRow): AdminOrgStatsItem {
  const datavaultBytes = toNumber(row.datavault_storage_bytes);
  const generatedDocumentBytes = toNumber(row.generated_document_storage_bytes);
  const templateBytes = toNumber(row.template_storage_bytes);
  const totalRuns = toNumber(row.total_run_count);
  const completedRuns = toNumber(row.completed_run_count);

  return {
    id: row.org_id,
    name: row.org_name,
    slug: row.slug,
    domain: row.domain,
    tenantId: row.tenant_id,
    tenantName: row.tenant_name,
    createdAt: toIsoDate(row.created_at),
    members: {
      total: toNumber(row.member_count),
      admins: toNumber(row.admin_member_count),
    },
    projects: {
      total: toNumber(row.project_count),
      active: toNumber(row.active_project_count),
      archived: toNumber(row.archived_project_count),
    },
    workflows: {
      total: toNumber(row.workflow_count),
      active: toNumber(row.active_workflow_count),
      draft: toNumber(row.draft_workflow_count),
      archived: toNumber(row.archived_workflow_count),
      public: toNumber(row.public_workflow_count),
    },
    datavault: {
      databases: toNumber(row.database_count),
      nativeDatabases: toNumber(row.native_database_count),
      externalDatabases: toNumber(row.external_database_count),
      tables: toNumber(row.table_count),
      columns: toNumber(row.column_count),
      rows: toNumber(row.row_count),
      values: toNumber(row.value_count),
    },
    templates: {
      total: toNumber(row.template_count),
      versions: toNumber(row.template_version_count),
    },
    storage: {
      totalBytes: datavaultBytes + generatedDocumentBytes + templateBytes,
      datavaultBytes,
      generatedDocumentBytes,
      templateBytes,
      generatedDocumentCount: toNumber(row.generated_document_count),
    },
    runs: {
      total: totalRuns,
      completed: completedRuns,
      inProgress: toNumber(row.in_progress_run_count),
      last24h: toNumber(row.runs_24h),
      last7d: toNumber(row.runs_7d),
      last30d: toNumber(row.runs_30d),
      completionRate: totalRuns > 0 ? roundPercent((completedRuns / totalRuns) * 100) : 0,
      lastRunAt: toIsoDate(row.last_run_at),
    },
  };
}

function buildSummary(organizations: AdminOrgStatsItem[]): AdminOrgStatsSummary {
  const summary = organizations.reduce<AdminOrgStatsSummary>((acc, org) => {
    acc.totalProjects += org.projects.total;
    acc.totalWorkflows += org.workflows.total;
    acc.totalDatabases += org.datavault.databases;
    acc.totalTables += org.datavault.tables;
    acc.totalRows += org.datavault.rows;
    acc.totalStorageBytes += org.storage.totalBytes;
    acc.totalRuns += org.runs.total;
    acc.runsLast24h += org.runs.last24h;
    acc.runsLast7d += org.runs.last7d;
    acc.runsLast30d += org.runs.last30d;

    const hasActivity =
      org.projects.total > 0 ||
      org.workflows.total > 0 ||
      org.datavault.databases > 0 ||
      org.datavault.tables > 0 ||
      org.runs.total > 0;

    if (hasActivity) {
      acc.activeOrganizations += 1;
    }

    if (acc.busiestOrg === null || org.runs.last30d > acc.busiestOrg.runsLast30d) {
      acc.busiestOrg = {
        id: org.id,
        name: org.name,
        runsLast30d: org.runs.last30d,
      };
    }

    return acc;
  }, {
    totalOrganizations: organizations.length,
    activeOrganizations: 0,
    totalProjects: 0,
    totalWorkflows: 0,
    totalDatabases: 0,
    totalTables: 0,
    totalRows: 0,
    totalStorageBytes: 0,
    totalRuns: 0,
    runsLast24h: 0,
    runsLast7d: 0,
    runsLast30d: 0,
    busiestOrg: null,
  });

  if (summary.busiestOrg?.runsLast30d === 0) {
    summary.busiestOrg = null;
  }

  return summary;
}

export class AdminOrgStatsService {
  constructor(private readonly repository: AdminOrgStatsReader = adminOrgStatsRepository) {}

  async getOrgStats(adminUser: AdminUserContext): Promise<AdminOrgStatsResponse> {
    if (adminUser.role !== "admin") {
      throw new Error("Access denied - admin role required");
    }

    const rows = await this.repository.listOrgStats();
    const organizations = rows.map(mapRow);

    return {
      generatedAt: new Date().toISOString(),
      summary: buildSummary(organizations),
      organizations,
    };
  }
}

export const adminOrgStatsService = new AdminOrgStatsService();
