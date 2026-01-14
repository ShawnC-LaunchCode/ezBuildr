import express, { type Express } from 'express';

import { createLogger } from '../../server/logger';
import { registerAuthRoutes } from '../../server/routes/auth.routes';

const logger = createLogger({ module: 'test-app' });

/**
 * Create a test Express app instance
 * This creates a minimal Express app with auth routes for integration testing
 */
export function createTestApp(): Express {
  const app = express();

  // Enable trust proxy for X-Forwarded-For header support
  app.set('trust proxy', true);

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Register auth routes
  registerAuthRoutes(app);

  // Error handler
  app.use((err: any, req: any, res: any, next: any) => {
    logger.error({ error: err }, 'Test app error');
    res.status(500).json({ message: 'Internal server error', error: err.message });
  });

  return app;
}
