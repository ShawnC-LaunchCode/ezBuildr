import { Router } from 'express';
import { z } from 'zod';
import { hybridAuth, getAuthUserTenantId } from '../middleware/auth';
import { dataSourceService } from '../services/DataSourceService';
import { logger } from '../logger';

export const dataSourceRouter = Router();

// Apply auth to all routes
dataSourceRouter.use(hybridAuth);

// Helper to get tenantId safely
// Helper to get tenantId safely
const getTenant = (req: any): string => {
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
dataSourceRouter.get('/', async (req, res) => {
    try {
        const tenantId = getTenant(req);
        const dataSources = await dataSourceService.listDataSources(tenantId);
        res.json(dataSources);
    } catch (error) {
        logger.error({ error }, 'Error listing data sources');
        res.status(500).json({ message: 'Failed to list data sources' });
    }
});

/**
 * GET /api/data-sources/:id
 * Get a single data source
 */
dataSourceRouter.get('/:id', async (req, res) => {
    try {
        const tenantId = getTenant(req);
        const { id } = req.params;
        const dataSource = await dataSourceService.getDataSource(id, tenantId);

        if (!dataSource) {
            return res.status(404).json({ message: 'Data source not found' });
        }

        res.json(dataSource);
    } catch (error) {
        logger.error({ error }, 'Error fetching data source');
        res.status(500).json({ message: 'Failed to fetch data source' });
    }
});

/**
 * GET /api/data-sources/:id/tables
 * List tables in a data source
 */
dataSourceRouter.get('/:id/tables', async (req, res) => {
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
});

/**
 * POST /api/data-sources
 * Create a new data source
 */
dataSourceRouter.post('/', async (req, res) => {
    try {
        const tenantId = getTenant(req);

        const schema = z.object({
            name: z.string().min(1).max(255),
            description: z.string().optional(),
            type: z.enum(['native', 'postgres', 'google_sheets', 'airtable', 'external']),
            config: z.record(z.any()).default({}),
            scopeType: z.enum(['account', 'project', 'workflow']).default('account'),
            scopeId: z.string().uuid().optional(),
        });

        const data = schema.parse(req.body);

        const dataSource = await dataSourceService.createDataSource({
            ...data,
            tenantId,
        });

        res.status(201).json(dataSource);
    } catch (error) {
        logger.error({ error }, 'Error creating data source');
        if (error instanceof z.ZodError) {
            return res.status(400).json({ message: 'Invalid input', errors: error.errors });
        }
        res.status(500).json({ message: 'Failed to create data source' });
    }
});

/**
 * PATCH /api/data-sources/:id
 * Update a data source
 */
dataSourceRouter.patch('/:id', async (req, res) => {
    try {
        const tenantId = getTenant(req);
        const { id } = req.params;

        const schema = z.object({
            name: z.string().min(1).max(255).optional(),
            description: z.string().optional(),
            config: z.record(z.any()).optional(),
        });

        const data = schema.parse(req.body);

        const dataSource = await dataSourceService.updateDataSource(id, tenantId, data);
        res.json(dataSource);
    } catch (error) {
        logger.error({ error }, 'Error updating data source');
        if (error instanceof z.ZodError) {
            return res.status(400).json({ message: 'Invalid input', errors: error.errors });
        }
        res.status(500).json({ message: 'Failed to update data source' });
    }
});

/**
 * DELETE /api/data-sources/:id
 * Delete a data source
 */
dataSourceRouter.delete('/:id', async (req, res) => {
    try {
        const tenantId = getTenant(req);
        const { id } = req.params;

        await dataSourceService.deleteDataSource(id, tenantId);
        res.status(204).send();
    } catch (error) {
        logger.error({ error }, 'Error deleting data source');
        res.status(500).json({ message: 'Failed to delete data source' });
    }
});

/**
 * GET /api/data-sources/workflow/:workflowId
 * List data sources linked to a workflow
 */
dataSourceRouter.get('/workflow/:workflowId', async (req, res) => {
    try {
        const { workflowId } = req.params;
        // Optional: Verify workflow ownership/access here or in service
        const dataSources = await dataSourceService.listDataSourcesForWorkflow(workflowId);
        res.json(dataSources);
    } catch (error) {
        logger.error({ error }, 'Error listing workflow data sources');
        res.status(500).json({ message: 'Failed to list workflow data sources' });
    }
});

/**
 * POST /api/data-sources/:id/link
 * Link a data source to a workflow
 */
dataSourceRouter.post('/:id/link', async (req, res) => {
    try {
        const tenantId = getTenant(req);
        const { id } = req.params;
        const schema = z.object({
            workflowId: z.string().uuid(),
        });

        const { workflowId } = schema.parse(req.body);

        await dataSourceService.linkDataSourceToWorkflow(workflowId, id, tenantId);
        res.status(200).json({ success: true });
    } catch (error) {
        logger.error({ error }, 'Error linking data source');
        if (error instanceof z.ZodError) {
            return res.status(400).json({ message: 'Invalid input', errors: error.errors });
        }
        res.status(500).json({ message: 'Failed to link data source' });
    }
});

/**
 * DELETE /api/data-sources/:id/link/:workflowId
 * Unlink a data source from a workflow
 */
dataSourceRouter.delete('/:id/link/:workflowId', async (req, res) => {
    try {
        const { id, workflowId } = req.params;
        // const tenantId = getTenant(req); // Service doesn't currently require tenantId for unlink, but typically should for safety.
        // The service method is: unlinkDataSourceFromWorkflow(workflowId, dataSourceId)

        await dataSourceService.unlinkDataSourceFromWorkflow(workflowId, id);
        res.status(204).send();
    } catch (error) {
        logger.error({ error }, 'Error unlinking data source');
        res.status(500).json({ message: 'Failed to unlink data source' });
    }
});
