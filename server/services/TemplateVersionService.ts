/**
 * Template Version Service
 *
 * Handles version tracking for document templates:
 * - Create version snapshots
 * - List version history
 * - Restore previous versions
 * - Compare versions
 * - Manage version metadata
 *
 * Benefits:
 * - Audit trail of template changes
 * - Ability to rollback breaking changes
 * - Track who changed what and when
 * - Safe experimentation with templates
 */

import { eq, desc, and } from 'drizzle-orm';

import { templates, templateVersions } from '../../shared/schema';
import { db } from '../db';
import { logger } from '../logger';
import { createError } from '../utils/errors';

import { getStorageProvider } from './storage';

export interface CreateVersionOptions {
  templateId: string;
  userId: string;
  notes?: string;
  force?: boolean; // Force creation even if no changes detected
}

export interface TemplateVersion {
  id: string;
  templateId: string;
  versionNumber: number;
  fileRef: string;
  metadata: any;
  mapping: any;
  createdBy: string | null;
  createdAt: Date;
  notes: string | null;
  isActive: boolean;
}

export interface VersionComparison {
  templateId: string;
  fromVersion: number;
  toVersion: number;
  changes: {
    fileChanged: boolean;
    metadataChanged: boolean;
    mappingChanged: boolean;
    fieldChanges?: {
      added: string[];
      removed: string[];
      modified: string[];
    };
  };
}

export class TemplateVersionService {
  /**
   * Create a new version snapshot of a template
   */
  async createVersion(options: CreateVersionOptions): Promise<TemplateVersion> {
    const { templateId, userId, notes, force = false } = options;

    logger.info({ templateId, userId, notes }, 'Creating template version');

    // Get current template
    const [template] = await db
      .select()
      .from(templates)
      .where(eq(templates.id, templateId))
      .limit(1);

    if (!template) {
      throw createError.notFound('Template not found');
    }

    // Get latest version
    const [latestVersion] = await db
      .select()
      .from(templateVersions)
      .where(eq(templateVersions.templateId, templateId))
      .orderBy(desc(templateVersions.versionNumber))
      .limit(1);

    // Check if there are actual changes (unless forced)
    if (!force && latestVersion) {
      const hasChanges =
        latestVersion.fileRef !== template.fileRef ||
        JSON.stringify(latestVersion.metadata) !== JSON.stringify(template.metadata) ||
        JSON.stringify(latestVersion.mapping) !== JSON.stringify(template.mapping);

      if (!hasChanges) {
        logger.info({ templateId }, 'No changes detected, skipping version creation');
        return latestVersion as TemplateVersion;
      }
    }

    // Determine next version number
    const nextVersionNumber = latestVersion ? latestVersion.versionNumber + 1 : 1;

    // Create version record
    const [newVersion] = await db
      .insert(templateVersions)
      .values({
        templateId,
        versionNumber: nextVersionNumber,
        fileRef: template.fileRef,
        metadata: template.metadata,
        mapping: template.mapping,
        createdBy: userId,
        notes: notes || `Version ${nextVersionNumber}`,
        isActive: true,
      })
      .returning();

    // Update template's current version number
    await db
      .update(templates)
      .set({
        currentVersion: nextVersionNumber,
        lastModifiedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(templates.id, templateId));

    logger.info(
      {
        templateId,
        versionNumber: nextVersionNumber,
        versionId: newVersion.id,
      },
      'Template version created'
    );

    return newVersion as TemplateVersion;
  }

  /**
   * Get version history for a template
   */
  async getVersionHistory(templateId: string): Promise<TemplateVersion[]> {
    const versions = await db
      .select()
      .from(templateVersions)
      .where(eq(templateVersions.templateId, templateId))
      .orderBy(desc(templateVersions.versionNumber));

    return versions as TemplateVersion[];
  }

  /**
   * Get a specific version
   */
  async getVersion(templateId: string, versionNumber: number): Promise<TemplateVersion> {
    const [version] = await db
      .select()
      .from(templateVersions)
      .where(
        and(
          eq(templateVersions.templateId, templateId),
          eq(templateVersions.versionNumber, versionNumber)
        )
      )
      .limit(1);

    if (!version) {
      throw createError.notFound(`Version ${versionNumber} not found`);
    }

    return version as TemplateVersion;
  }

  /**
   * Restore a template to a previous version
   */
  async restoreVersion(
    templateId: string,
    versionNumber: number,
    userId: string,
    notes?: string
  ): Promise<void> {
    logger.info({ templateId, versionNumber, userId }, 'Restoring template version');

    // Get the version to restore
    const version = await this.getVersion(templateId, versionNumber);

    // Get current template
    const [template] = await db
      .select()
      .from(templates)
      .where(eq(templates.id, templateId))
      .limit(1);

    if (!template) {
      throw createError.notFound('Template not found');
    }

    // Copy the version's file (if needed)
    const storage = getStorageProvider();
    const versionFileExists = await storage.exists(version.fileRef);

    if (!versionFileExists) {
      throw createError.internal('Version file not found in storage');
    }

    // Create a new version snapshot of current state (before restoring)
    await this.createVersion({
      templateId,
      userId,
      notes: `Auto-save before restoring to v${versionNumber}`,
    });

    // Update template with version's data
    await db
      .update(templates)
      .set({
        fileRef: version.fileRef,
        metadata: version.metadata,
        mapping: version.mapping,
        lastModifiedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(templates.id, templateId));

    // Create a new version record for the restore
    await this.createVersion({
      templateId,
      userId,
      notes: notes || `Restored from version ${versionNumber}`,
      force: true,
    });

    logger.info({ templateId, versionNumber }, 'Template version restored');
  }

  /**
   * Compare two versions
   */
  async compareVersions(
    templateId: string,
    fromVersion: number,
    toVersion: number
  ): Promise<VersionComparison> {
    logger.debug({ templateId, fromVersion, toVersion }, 'Comparing template versions');

    const [v1, v2] = await Promise.all([
      this.getVersion(templateId, fromVersion),
      this.getVersion(templateId, toVersion),
    ]);

    const comparison: VersionComparison = {
      templateId,
      fromVersion,
      toVersion,
      changes: {
        fileChanged: v1.fileRef !== v2.fileRef,
        metadataChanged: JSON.stringify(v1.metadata) !== JSON.stringify(v2.metadata),
        mappingChanged: JSON.stringify(v1.mapping) !== JSON.stringify(v2.mapping),
      },
    };

    // Detailed field changes (for PDF templates)
    if (comparison.changes.metadataChanged && v1.metadata?.fields && v2.metadata?.fields) {
      const fields1 = new Set(v1.metadata.fields.map((f: any) => f.name));
      const fields2 = new Set(v2.metadata.fields.map((f: any) => f.name));

      comparison.changes.fieldChanges = {
        added: Array.from(fields2).filter((f) => !fields1.has(f)) as string[],
        removed: Array.from(fields1).filter((f) => !fields2.has(f)) as string[],
        modified: [], // TODO: Detect modified fields by comparing field properties
      };
    }

    return comparison;
  }

  /**
   * Delete old versions (keep latest N versions)
   */
  async pruneOldVersions(templateId: string, keepCount: number = 10): Promise<number> {
    logger.info({ templateId, keepCount }, 'Pruning old template versions');

    // Get all versions
    const allVersions = await this.getVersionHistory(templateId);

    if (allVersions.length <= keepCount) {
      logger.info({ templateId, versionCount: allVersions.length }, 'No versions to prune');
      return 0;
    }

    // Keep latest N versions
    const versionsToKeep = allVersions.slice(0, keepCount);
    const versionsToDelete = allVersions.slice(keepCount);

    // Delete old versions
    for (const version of versionsToDelete) {
      await db.delete(templateVersions).where(eq(templateVersions.id, version.id));

      // Optionally delete the file (if not used by current template)
      // Note: Be careful not to delete files still in use!
      logger.debug({ versionId: version.id, versionNumber: version.versionNumber }, 'Version deleted');
    }

    logger.info(
      {
        templateId,
        deletedCount: versionsToDelete.length,
      },
      'Old versions pruned'
    );

    return versionsToDelete.length;
  }

  /**
   * Mark a version as inactive (soft delete)
   */
  async deactivateVersion(templateId: string, versionNumber: number): Promise<void> {
    await db
      .update(templateVersions)
      .set({ isActive: false })
      .where(
        and(
          eq(templateVersions.templateId, templateId),
          eq(templateVersions.versionNumber, versionNumber)
        )
      );

    logger.info({ templateId, versionNumber }, 'Version deactivated');
  }

  /**
   * Get version statistics
   */
  async getVersionStats(templateId: string): Promise<{
    totalVersions: number;
    activeVersions: number;
    latestVersion: number;
    oldestVersion: number;
    totalSize: number; // Total storage used by all versions
  }> {
    const versions = await this.getVersionHistory(templateId);

    const activeVersions = versions.filter((v) => v.isActive);
    const versionNumbers = versions.map((v) => v.versionNumber);

    return {
      totalVersions: versions.length,
      activeVersions: activeVersions.length,
      latestVersion: Math.max(...versionNumbers, 0),
      oldestVersion: Math.min(...versionNumbers, 0),
      totalSize: 0, // TODO: Calculate total file size
    };
  }
}

// Singleton instance
export const templateVersionService = new TemplateVersionService();
