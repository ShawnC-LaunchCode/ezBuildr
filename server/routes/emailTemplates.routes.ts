import { updateEmailTemplateMetadataSchema } from '@shared/types/branding';

import { createLogger } from '../logger';
import { hybridAuth, type AuthRequest } from '../middleware/auth';
import { emailTemplateMetadataService } from '../services/EmailTemplateMetadataService';
import { asyncHandler } from '../utils/asyncHandler';

import type { Express, Request, Response } from 'express';


const logger = createLogger({ module: 'emailTemplates-routes' });

/**
 * Stage 17: Email Template Metadata Routes
 *
 * Provides APIs for managing email template metadata registry.
 * This is metadata only - no actual email rendering yet.
 */
export function registerEmailTemplateRoutes(app: Express): void {
  /**
   * GET /api/email-templates
   * List all email template metadata
   */
  app.get('/api/email-templates', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const templates = await emailTemplateMetadataService.listEmailTemplates();

      res.json({
        templates,
        total: templates.length,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to list email templates');
      res.status(500).json({
        message: 'Failed to list email templates',
        error: 'internal_error',
      });
    }
  }));

  /**
   * GET /api/email-templates/:id
   * Get a specific email template metadata
   */
  app.get('/api/email-templates/:id', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const template = await emailTemplateMetadataService.getTemplateById(id);

      if (!template) {
        res.status(404).json({
          message: 'Template not found',
          error: 'template_not_found',
        });
        return;
      }

      res.json({
        template,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get email template');
      res.status(500).json({
        message: 'Failed to get email template',
        error: 'internal_error',
      });
    }
  }));

  /**
   * PATCH /api/email-templates/:id/metadata
   * Update email template metadata (owner/builder only)
   */
  app.patch(
    '/api/email-templates/:id/metadata',
    hybridAuth,
    asyncHandler(async (req: Request, res: Response) => {
      try {
        const authReq = req as AuthRequest;
        if (authReq.systemRole !== 'admin' && authReq.systemRole !== 'creator') {
           res.status(403).json({ message: 'Forbidden: requires platform admin role' });
           return;
        }
        
        const { id } = req.params;

        // Validate request body
        const validationResult = updateEmailTemplateMetadataSchema.safeParse(req.body);
        if (!validationResult.success) {
          res.status(400).json({
            message: 'Invalid template metadata',
            error: 'validation_error',
            details: validationResult.error.errors,
          });
          return;
        }

        const updatedTemplate = await emailTemplateMetadataService.updateTemplateMetadata(
          id,
          validationResult.data
        );

        logger.info({ templateId: id }, 'Email template metadata updated');

        res.json({
          message: 'Template metadata updated successfully',
          template: updatedTemplate,
        });
      } catch (error: unknown) {
        if (error instanceof Error && error.message === 'Template not found') {
          res.status(404).json({
            message: 'Template not found',
            error: 'template_not_found',
          });
          return;
        }

        logger.error({ error }, 'Failed to update email template metadata');
        res.status(500).json({
          message: 'Failed to update template metadata',
          error: 'internal_error',
        });
      }
    })
  );

  /**
   * GET /api/email-templates/token/:tokenKey
   * Get templates that use a specific branding token
   * (useful for UI filtering)
   */
  app.get(
    '/api/email-templates/token/:tokenKey',
    hybridAuth,
    asyncHandler(async (req: Request, res: Response) => {
      try {
        const { tokenKey } = req.params;

        const templates = await emailTemplateMetadataService.getTemplatesWithBrandingToken(
          tokenKey
        );

        res.json({
          templates,
          total: templates.length,
          tokenKey,
        });
      } catch (error) {
        logger.error({ error }, 'Failed to get templates by token');
        res.status(500).json({
          message: 'Failed to get templates',
          error: 'internal_error',
        });
      }
    })
  );
}
