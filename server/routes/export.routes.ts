import { createLogger } from "../logger";
import { hybridAuth, type AuthRequest } from '../middleware/auth';

import type { Express, Request, Response } from "express";
// DEPRECATED: Legacy survey export service - disabled as part of survey system removal (Nov 2025)
// import { exportService } from "../services/exportService";
// import type { ExportOptions } from "../services/exportService";

const logger = createLogger({ module: 'export-routes' });

/**
 * DEPRECATED: Register export-related routes
 * Handles CSV and PDF export of survey data with analytics
 * NOTE: This file is no longer used after survey system removal (Nov 2025)
 * Workflow exports are handled by workflowExports.routes.ts instead
 */
export function registerExportRoutes(app: Express): void {
  // Routes disabled - legacy survey export functionality
  return;

  // ============================================================================
  // Data Export
  // ============================================================================

  /* DISABLED - Legacy survey export routes

  /**
   * GET /api/surveys/:surveyId/export
   * Export survey data as CSV or PDF with analytics summaries
   * Query params:
   *  - format: 'csv' | 'pdf' (default: 'csv')
   *  - includeIncomplete: boolean (default: false)
   *  - dateFrom: ISO date string (optional)
   *  - dateTo: ISO date string (optional)
   *
  app.get('/api/surveys/:surveyId/export', hybridAuth, async (req: Request, res: Response) => {
    try {
      const { surveyId } = req.params;
      const authReq = req as AuthRequest;
      const userId = authReq.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized - no user ID'
        });
      }

      // Parse query parameters
      const format = (req.query.format as 'csv' | 'pdf') || 'csv';
      const includeIncomplete = req.query.includeIncomplete === 'true';
      const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined;
      const dateTo = req.query.dateTo ? new Date(req.query.dateTo as string) : undefined;

      // Validate format
      if (format !== 'csv' && format !== 'pdf') {
        return res.status(400).json({
          success: false,
          message: "Invalid format. Must be 'csv' or 'pdf'"
        });
      }

      // Build export options
      const options: ExportOptions = {
        format,
        includeIncomplete,
        dateFrom,
        dateTo
      };

      // Generate export file
      const exportedFile = await exportService.exportSurveyData(surveyId, userId, options);

      // Set response headers
      res.setHeader('Content-Type', exportedFile.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${exportedFile.filename}"`);
      res.setHeader('Content-Length', exportedFile.size);

      // Stream the file to the response
      if (format === 'csv') {
        const fs = require('fs');
        const fileStream = fs.createReadStream(exportedFile.path);
        fileStream.pipe(res);

        // Clean up file after streaming
        fileStream.on('end', () => {
          fs.unlinkSync(exportedFile.path);
        });
      } else {
        // For PDF, use res.download which handles cleanup
        res.download(exportedFile.path, exportedFile.filename, (err) => {
          if (err && !res.headersSent) {
            logger.error({ error: err }, 'Error downloading file');
            res.status(500).json({
              success: false,
              message: 'Failed to download export file'
            });
          }
          // Clean up file after download
          const fs = require('fs');
          try {
            fs.unlinkSync(exportedFile.path);
          } catch (cleanupErr) {
            logger.error({ error: cleanupErr }, 'Error cleaning up export file');
          }
        });
      }

    } catch (error: any) {
      logger.error({ error }, 'Export error');

      // Handle specific errors
      if (error.message === 'Survey not found') {
        return res.status(404).json({
          success: false,
          message: 'Survey not found'
        });
      }

      if (error.message?.includes('Access denied')) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to export this survey'
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Failed to export survey data',
        error: error.message
      });
    }
  });

  /**
   * POST /api/exports/cleanup
   * Admin endpoint to manually trigger cleanup of old export files
   * Removes exports older than 24 hours
   *
  app.post('/api/exports/cleanup', hybridAuth, async (req, res) => {
    try {
      const maxAgeHours = req.body.maxAgeHours || 24;
      await exportService.cleanupOldExports(maxAgeHours);

      res.json({
        success: true,
        message: `Export cleanup completed. Removed files older than ${maxAgeHours} hours.`
      });
    } catch (error: any) {
      logger.error({ error }, 'Cleanup error');
      res.status(500).json({
        success: false,
        message: 'Failed to cleanup old exports',
        error: error.message
      });
    }
  });
  */
}
