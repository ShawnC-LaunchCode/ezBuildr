import { Router } from 'express';
import { z } from 'zod';
import { validateSafeUrl } from '../utils/ssrfValidator';

import { logger } from '../logger';
import { hybridAuth, getAuthUserTenantId, getAuthUserId } from '../middleware/auth';
import { datavaultDatabasesRepository } from '../repositories/DatavaultDatabasesRepository';
import { datavaultTablesRepository } from '../repositories/DatavaultTablesRepository';
import { dataSourceService } from '../services/DataSourceService';
import { workflowService } from '../services/WorkflowService';
import { asyncHandler } from '../utils/asyncHandler';


const nativeConfigSchema = z.object({});
const externalConfigSchema = z.object({
    url: z.string().url(),
}).passthrough();
const postgresConfigSchema = z.object({
    connectionString: z.string().optional(),
    host: z.string().optional(),
    port: z.number().int().optional(),
    database: z.string().optional(),
    user: z.string().optional(),
    password: z.string().optional(),
    ssl: z.boolean().optional()
}).refine(c => c.connectionString || c.host, 'need connectionString or host');
const airtableConfigSchema = z.object({
    apiUrl: z.string().url().optional(),
    baseId: z.string(),
    apiKey: z.string(),
});
const googleSheetsConfigSchema = z.object({
    spreadsheetId: z.string(),
    credentials: z.any().optional(),
});
const nativeTableConfigSchema = z.object({
    tableId: z.string().optional(),
});

const dataSourceConfigUnion = z.discriminatedUnion('type', [
    z.object({ type: z.literal('external'), name: z.string().min(1).max(255), description: z.string().optional(), scopeType: z.enum(['account', 'project', 'workflow']).default('account'), scopeId: z.string().uuid().optional(), config: externalConfigSchema }),
    z.object({ type: z.literal('postgres'), name: z.string().min(1).max(255), description: z.string().optional(), scopeType: z.enum(['account', 'project', 'workflow']).default('account'), scopeId: z.string().uuid().optional(), config: postgresConfigSchema }),
    z.object({ type: z.literal('airtable'), name: z.string().min(1).max(255), description: z.string().optional(), scopeType: z.enum(['account', 'project', 'workflow']).default('account'), scopeId: z.string().uuid().optional(), config: airtableConfigSchema }),
    z.object({ type: z.literal('google_sheets'), name: z.string().min(1).max(255), description: z.string().optional(), scopeType: z.enum(['account', 'project', 'workflow']).default('account'), scopeId: z.string().uuid().optional(), config: googleSheetsConfigSchema }),
    z.object({ type: z.literal('native'), name: z.string().min(1).max(255), description: z.string().optional(), scopeType: z.enum(['account', 'project', 'workflow']).default('account'), scopeId: z.string().uuid().optional(), config: nativeConfigSchema }),
    z.object({ type: z.literal('native_table'), name: z.string().min(1).max(255), description: z.string().optional(), scopeType: z.enum(['account', 'project', 'workflow']).default('account'), scopeId: z.string().uuid().optional(), config: nativeTableConfigSchema }),
]);

export const dataSourceRouter = Router();


// Apply auth to all routes
dataSourceRouter.use(hybridAuth);

// Helper to get tenantId safely
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getTenant = (req: any): string => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const tenantId = getAuthUserTenantId(req);
    if (!tenantId) {
        throw new Error('Tenant ID missing from session');
    }
    return tenantId;
};

/**
 * GET /api/data-sources
 * List all data sources for the tenant
 */
dataSourceRouter.get('/', asyncHandler(async (req, res) => {
    try {
        const tenantId = getTenant(req);
        const dataSources = await dataSourceService.listDataSources(tenantId);
        res.json(dataSources);
    } catch (error) {
        logger.error({ error }, 'Error listing data sources');
        res.status(500).json({ message: 'Failed to list data sources' });
    }
}));

/**
 * GET /api/data-sources/native/catalog
 * Get accessible native databases and tables for the selector UI
 */
dataSourceRouter.get('/native/catalog', asyncHandler(async (req, res) => {
    try {
        const tenantId = getTenant(req);
        const userId = getAuthUserId(req);

        if (!userId) {
            res.status(401).json({ message: 'Authentication required' });
            return;
        }

        // 1. Get all accessible databases
        const databases = await datavaultDatabasesRepository.findByTenantAndUser(tenantId, userId);

        // 2. Get all accessible tables
        const tables = await datavaultTablesRepository.findByTenantAndUser(tenantId, userId);

        // 3. Structure the response
        // Group tables by databaseId
        const tablesByDatabase = new Map<string, { id: string; name: string }[]>();
        const orphanTables: { id: string; name: string }[] = [];

        tables.forEach(table => {
            if (table.databaseId) {
                const existing = tablesByDatabase.get(table.databaseId) ?? [];
                existing.push({ id: table.id, name: table.name });
                tablesByDatabase.set(table.databaseId, existing);
            } else {
                orphanTables.push({ id: table.id, name: table.name });
            }
        });

        // Map databases and attach their tables
        const databaseList = databases.map(db => ({
            id: db.id,
            name: db.name,
            tables: tablesByDatabase.get(db.id) ?? []
        }));

        res.json({
            databases: databaseList,
            orphanTables: orphanTables
        });

    } catch (error) {
        logger.error({ error }, 'Error fetching native catalog');
        res.status(500).json({ message: 'Failed to fetch native catalog' });
    }
}));

/**
 * GET /api/data-sources/:id
 * Get a single data source
 */
dataSourceRouter.get('/:id', asyncHandler(async (req, res) => {
    try {
        const tenantId = getTenant(req);
        const { id } = req.params;
        const dataSource = await dataSourceService.getDataSource(id, tenantId);

        if (!dataSource) {
            res.status(404).json({ message: 'Data source not found' });
            return;
        }

        res.json(dataSource);
    } catch (error) {
        logger.error({ error }, 'Error fetching data source');
        res.status(500).json({ message: 'Failed to fetch data source' });
    }
}));

/**
 * GET /api/data-sources/:id/tables
 * List tables in a data source
 */
dataSourceRouter.get('/:id/tables', asyncHandler(async (req, res) => {
    try {
        const tenantId = getTenant(req);
        const { id } = req.params;

        const tables = await dataSourceService.listTables(id, tenantId);
        res.json(tables);
    } catch (error) {
        logger.error({ error }, 'Error listing data source tables');
        const message = error instanceof Error ? error.message : 'Failed to list tables';
        const status = message.includes('not found') ? 404 : 500;
        res.status(status).json({ message });
    }
}));

/**
 * POST /api/data-sources
 * Create a new data source
 */
dataSourceRouter.post('/', asyncHandler(async (req, res) => {
    try {
        const tenantId = getTenant(req);

        const data = dataSourceConfigUnion.parse(req.body);
        
        // SEC-005: Validate URL/Host for SSRF across all relevant types, not just external
        const checkSsrf = async (urlStr: string, allowedProtocols?: string[]) => {
            const isSafe = await validateSafeUrl(urlStr, allowedProtocols);
            if (!isSafe) {
                return false;
            }
            return true;
        };

        if (data.type === 'external' && typeof data.config.url === 'string') {
            if (!(await checkSsrf(data.config.url))) {
                return res.status(400).json({ message: "Invalid or unsafe external URL" });
            }
        } else if (data.type === 'postgres') {
            if (typeof data.config.connectionString === 'string') {
                if (!(await checkSsrf(data.config.connectionString, ["postgres:", "postgresql:", "http:", "https:"]))) {
                    return res.status(400).json({ message: "Invalid or unsafe postgres connection string" });
                }
            } else if (typeof data.config.host === 'string') {
                // For host-only, we prepend a dummy protocol so URL parsing works in validateSafeUrl
                if (!(await checkSsrf(`postgres://${data.config.host}`, ["postgres:"]))) {
                    return res.status(400).json({ message: "Invalid or unsafe postgres host" });
                }
            }
        }

        /* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any */
        const dataSource = await dataSourceService.createDataSource({
            ...data,
            tenantId,
        } as any);
        /* eslint-enable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any */

        res.status(201).json(dataSource);
    } catch (error) {
        logger.error({ error }, 'Error creating data source');
        if (error instanceof z.ZodError) {
            res.status(400).json({ message: 'Invalid input', errors: error.errors });
            return;
        }
        res.status(500).json({ message: 'Failed to create data source' });
    }
}));

/**
 * PATCH /api/data-sources/:id
 * Update a data source
 */
dataSourceRouter.patch('/:id', asyncHandler(async (req, res) => {
    try {
        const tenantId = getTenant(req);
        const { id } = req.params;

        const schema = z.object({
            name: z.string().min(1).max(255).optional(),
            description: z.string().optional(),
            config: z.record(z.any()).optional(),
        });

        const data = schema.parse(req.body);
        if (data.config) {
            const existing = await dataSourceService.getDataSource(id, tenantId);
            if (!existing) { return res.status(404).json({message: "Not found"}); }
            
            // Validate config against the proper schema based on existing type
            const typeForValidation = existing.type;
            const fullDataForValidation = { 
                type: typeForValidation, 
                name: data.name ?? existing.name, 
                description: data.description ?? existing.description,
                config: data.config 
            };
            dataSourceConfigUnion.parse(fullDataForValidation);
        }
        
        // SEC-005: Validate URL/Host for SSRF across all relevant types, not just external
        const checkSsrf = async (urlStr: string, allowedProtocols?: string[]) => {
            const isSafe = await validateSafeUrl(urlStr, allowedProtocols);
            if (!isSafe) {
                return false;
            }
            return true;
        };

        if (data.config) {
            if (typeof data.config.url === 'string') {
                if (!(await checkSsrf(data.config.url))) {
                    return res.status(400).json({ message: "Invalid or unsafe external URL" });
                }
            }
            if (typeof data.config.connectionString === 'string') {
                if (!(await checkSsrf(data.config.connectionString, ["postgres:", "postgresql:", "http:", "https:"]))) {
                    return res.status(400).json({ message: "Invalid or unsafe postgres connection string" });
                }
            }
            if (typeof data.config.host === 'string') {
                if (!(await checkSsrf(`postgres://${data.config.host}`, ["postgres:"]))) {
                    return res.status(400).json({ message: "Invalid or unsafe postgres host" });
                }
            }
        }

        const dataSource = await dataSourceService.updateDataSource(id, tenantId, data);
        res.json(dataSource);
    } catch (error) {
        logger.error({ error }, 'Error updating data source');
        if (error instanceof z.ZodError) {
            res.status(400).json({ message: 'Invalid input', errors: error.errors });
            return;
        }
        res.status(500).json({ message: 'Failed to update data source' });
    }
}));

/**
 * DELETE /api/data-sources/:id
 * Delete a data source
 */
dataSourceRouter.delete('/:id', asyncHandler(async (req, res) => {
    try {
        const tenantId = getTenant(req);
        const { id } = req.params;

        await dataSourceService.deleteDataSource(id, tenantId);
        res.status(204).send();
    } catch (error) {
        logger.error({ error }, 'Error deleting data source');
        res.status(500).json({ message: 'Failed to delete data source' });
    }
}));

/**
 * GET /api/data-sources/workflow/:workflowId
 * List data sources linked to a workflow
 */
dataSourceRouter.get('/workflow/:workflowId', asyncHandler(async (req, res) => {
    try {
        const { workflowId } = req.params;
        const userId = getAuthUserId(req);
        if (!userId) { return res.status(401).json({ message: 'Authentication required' }); }
        
        await workflowService.verifyAccess(workflowId, userId, 'view');
        
        const dataSources = await dataSourceService.listDataSourcesForWorkflow(workflowId);
        res.json(dataSources);
    } catch (error) {
        logger.error({ error }, 'Error listing workflow data sources');
        res.status(500).json({ message: 'Failed to list workflow data sources' });
    }
}));

/**
 * POST /api/data-sources/:id/link
 * Link a data source to a workflow
 */
dataSourceRouter.post('/:id/link', asyncHandler(async (req, res) => {
    try {
        const tenantId = getTenant(req);
        const { id } = req.params;
        const schema = z.object({
            workflowId: z.string().uuid(),
        });

        const { workflowId } = schema.parse(req.body);
        const userId = getAuthUserId(req);
        if (!userId) { return res.status(401).json({ message: 'Authentication required' }); }
        
        await workflowService.verifyAccess(workflowId, userId, 'edit');

        await dataSourceService.linkDataSourceToWorkflow(workflowId, id, tenantId);
        res.status(200).json({ success: true });
    } catch (error) {
        logger.error({ error }, 'Error linking data source');
        if (error instanceof z.ZodError) {
            res.status(400).json({ message: 'Invalid input', errors: error.errors });
            return;
        }
        res.status(500).json({ message: 'Failed to link data source' });
    }
}));

/**
 * DELETE /api/data-sources/:id/link/:workflowId
 * Unlink a data source from a workflow
 */
dataSourceRouter.delete('/:id/link/:workflowId', asyncHandler(async (req, res) => {
    try {
        const { id, workflowId } = req.params;
        const userId = getAuthUserId(req);
        if (!userId) { return res.status(401).json({ message: 'Authentication required' }); }
        
        await workflowService.verifyAccess(workflowId, userId, 'edit');

        await dataSourceService.unlinkDataSourceFromWorkflow(workflowId, id);
        res.status(204).send();
    } catch (error) {
        logger.error({ error }, 'Error unlinking data source');
        res.status(500).json({ message: 'Failed to unlink data source' });
    }
}));
