export type DatavaultScopeType = 'account' | 'project' | 'workflow';

export type DataType =
  | 'text'
  | 'number'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'email'
  | 'phone'
  | 'url'
  | 'json'
  | 'auto_number';

export interface DatavaultDatabase {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  scopeType: DatavaultScopeType;
  scopeId: string | null;
  createdAt: string;
  updatedAt: string;
  tableCount?: number;
}

export interface DatavaultTable {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  description: string | null;
  databaseId: string | null;
  ownerUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DatavaultColumn {
  id: string;
  tableId: string;
  name: string;
  slug: string;
  type: DataType;
  required: boolean;
  orderIndex: number;
  isPrimaryKey: boolean;
  isUnique: boolean;
  autoNumberStart?: number;
  createdAt: string;
  updatedAt: string;
}

export interface TableSchema {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  databaseId: string | null;
  columns: DatavaultColumn[];
  createdAt: string;
  updatedAt: string;
}

export interface DatavaultRow {
  id: string;
  tableId: string;
  data: Record<string, any>;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDatabaseInput {
  name: string;
  description?: string;
  scopeType: DatavaultScopeType;
  scopeId?: string;
}

export interface UpdateDatabaseInput {
  name?: string;
  description?: string;
  scopeType?: DatavaultScopeType;
  scopeId?: string | null;
}

export interface MoveTableInput {
  databaseId: string | null;
}

export interface CreateTableInput {
  name: string;
  description?: string;
  databaseId?: string | null;
}

export interface UpdateTableInput {
  name?: string;
  description?: string;
}
