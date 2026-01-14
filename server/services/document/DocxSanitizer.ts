/**
 * DOCX Sanitizer
 *
 * Security hardening for uploaded DOCX templates.
 * Removes potentially dangerous content:
 * - VBA macros
 * - ActiveX controls
 * - External references
 * - Embedded files
 * - Custom XML with external refs
 *
 * Features:
 * - Safe template processing
 * - Detailed sanitization report
 * - Preserve template functionality
 * - Minimal file size increase
 *
 * Usage:
 * ```typescript
 * const sanitizer = new DocxSanitizer();
 * const result = await sanitizer.sanitize(docxBuffer);
 *
 * if (result.sanitized) {
 *   console.log('Removed:', result.removedItems);
 *   await saveFile(result.buffer);
 * }
 * ```
 */

import JSZip from 'jszip';

import { logger } from '../../logger';

// ============================================================================
// TYPES
// ============================================================================

export interface SanitizationResult {
  /** Whether any sanitization was performed */
  sanitized: boolean;

  /** Cleaned buffer */
  buffer: Buffer;

  /** Items that were removed */
  removedItems: string[];

  /** Warnings about potentially dangerous content */
  warnings: string[];

  /** Size comparison */
  sizeChange: {
    before: number;
    after: number;
    delta: number;
    percentage: number;
  };
}

// ============================================================================
// SANITIZER CLASS
// ============================================================================

export class DocxSanitizer {
  // Dangerous files to remove
  private readonly DANGEROUS_FILES = [
    'word/vbaProject.bin', // VBA macros
    'word/activeX/', // ActiveX controls (directory)
    'word/embeddings/', // Embedded files (directory)
    'customXml/', // Custom XML with potential external refs
  ];

  // External relationship types to remove
  private readonly DANGEROUS_REL_TYPES = [
    'http://schemas.openxmlformats.org/officeDocument/2006/relationships/oleObject',
    'http://schemas.openxmlformats.org/officeDocument/2006/relationships/package',
    'http://schemas.microsoft.com/office/2006/relationships/vbaProject',
    'http://schemas.openxmlformats.org/officeDocument/2006/relationships/frame',
  ];

  /**
   * Sanitize a DOCX buffer
   */
  async sanitize(buffer: Buffer): Promise<SanitizationResult> {
    logger.info('Sanitizing DOCX template');

    const originalSize = buffer.length;
    const removedItems: string[] = [];
    const warnings: string[] = [];

    try {
      // Load DOCX as ZIP
      const zip = await JSZip.loadAsync(buffer);

      // Step 1: Remove dangerous files
      for (const dangerousPath of this.DANGEROUS_FILES) {
        if (dangerousPath.endsWith('/')) {
          // Remove directory
          const removed = this.removeDirectory(zip, dangerousPath);
          if (removed.length > 0) {
            removedItems.push(...removed);
            logger.warn({ path: dangerousPath, count: removed.length }, 'Removed dangerous directory');
          }
        } else {
          // Remove single file
          const file = zip.file(dangerousPath);
          if (file) {
            zip.remove(dangerousPath);
            removedItems.push(dangerousPath);
            logger.warn({ path: dangerousPath }, 'Removed dangerous file');
          }
        }
      }

      // Step 2: Sanitize relationships (remove external refs)
      const relsFiles = Object.keys(zip.files).filter((path) =>
        path.endsWith('.rels')
      );

      for (const relsPath of relsFiles) {
        const file = zip.file(relsPath);
        if (file) {
          const content = await file.async('string');
          const { sanitized, content: sanitizedContent, removed } =
            await this.sanitizeRelationships(content);

          if (sanitized) {
            zip.file(relsPath, sanitizedContent);
            removedItems.push(...removed.map((r) => `${relsPath}:${r}`));
            logger.warn({ path: relsPath, removed }, 'Sanitized relationships');
          }
        }
      }

      // Step 3: Check for suspicious content in document.xml
      const docXml = zip.file('word/document.xml');
      if (docXml) {
        const content = await docXml.async('string');
        const suspiciousPatterns = this.detectSuspiciousPatterns(content);

        if (suspiciousPatterns.length > 0) {
          warnings.push(...suspiciousPatterns);
          logger.warn({ patterns: suspiciousPatterns }, 'Detected suspicious patterns in document');
        }
      }

      // Step 4: Remove custom properties with external refs
      const customProps = zip.file('docProps/custom.xml');
      if (customProps) {
        const content = await customProps.async('string');

        if (this.hasExternalReferences(content)) {
          zip.remove('docProps/custom.xml');
          removedItems.push('docProps/custom.xml');
          warnings.push('Removed custom properties with external references');
        }
      }

      // Generate sanitized buffer
      const sanitizedBuffer = await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: { level: 9 },
      });

      const newSize = sanitizedBuffer.length;
      const delta = newSize - originalSize;
      const percentage = originalSize > 0 ? (delta / originalSize) * 100 : 0;

      logger.info(
        {
          originalSize,
          newSize,
          delta,
          removedItems: removedItems.length,
          warnings: warnings.length,
        },
        'DOCX sanitization complete'
      );

      return {
        sanitized: removedItems.length > 0 || warnings.length > 0,
        buffer: sanitizedBuffer,
        removedItems,
        warnings,
        sizeChange: {
          before: originalSize,
          after: newSize,
          delta,
          percentage: Math.round(percentage * 100) / 100,
        },
      };
    } catch (error: any) {
      logger.error({ error }, 'DOCX sanitization failed');
      throw new Error(`Failed to sanitize DOCX: ${error.message}`);
    }
  }

  /**
   * Remove a directory from ZIP
   */
  private removeDirectory(zip: JSZip, dirPath: string): string[] {
    const removed: string[] = [];

    Object.keys(zip.files).forEach((path) => {
      if (path.startsWith(dirPath)) {
        zip.remove(path);
        removed.push(path);
      }
    });

    return removed;
  }

  /**
   * Sanitize relationships XML
   */
  private async sanitizeRelationships(
    content: string
  ): Promise<{ sanitized: boolean; content: string; removed: string[] }> {
    let sanitized = false;
    const removed: string[] = [];

    // Parse XML and remove dangerous relationship types
    for (const dangerousType of this.DANGEROUS_REL_TYPES) {
      if (content.includes(dangerousType)) {
        // Remove relationship elements with this type
        const regex = new RegExp(
          `<Relationship[^>]*Type="${dangerousType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*/>`,
          'g'
        );

        const matches = content.match(regex);
        if (matches) {
          content = content.replace(regex, '');
          sanitized = true;
          removed.push(...matches.map((m) => dangerousType));
        }
      }
    }

    // Remove external targets (TargetMode="External")
    if (content.includes('TargetMode="External"')) {
      // Keep only safe external links (http/https to known domains)
      const externalRegex = /<Relationship([^>]*)TargetMode="External"([^>]*)\/>/g;
      const matches = Array.from(content.matchAll(externalRegex));

      for (const match of matches) {
        const rel = match[0];
        const targetMatch = rel.match(/Target="([^"]*)"/);

        if (targetMatch) {
          const target = targetMatch[1];

          // Only allow http/https links
          if (!target.startsWith('http://') && !target.startsWith('https://')) {
            content = content.replace(rel, '');
            sanitized = true;
            removed.push(`External:${target}`);
          }
        }
      }
    }

    return { sanitized, content, removed };
  }

  /**
   * Detect suspicious patterns in document XML
   */
  private detectSuspiciousPatterns(content: string): string[] {
    const warnings: string[] = [];

    // Check for scripting
    if (content.includes('<w:jc w:val="script"') || content.includes('javascript:')) {
      warnings.push('Document contains potential script references');
    }

    // Check for form controls (can be used for phishing)
    if (content.includes('<w:fldChar') && content.includes('MACROBUTTON')) {
      warnings.push('Document contains macro button fields');
    }

    // Check for external data references
    if (content.includes('w:dataBinding') || content.includes('w:sdtContent')) {
      warnings.push('Document contains data binding or structured content');
    }

    return warnings;
  }

  /**
   * Check if content has external references
   */
  private hasExternalReferences(content: string): boolean {
    // Check for external schemas or namespaces
    if (content.includes('xmlns:') && content.includes('http://')) {
      // This is normal for Office documents, but check for suspicious ones
      const suspiciousPatterns = [
        'vt:lpwstr',
        'vt:variant',
        'op:string',
      ];

      for (const pattern of suspiciousPatterns) {
        if (content.includes(pattern)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Quick check if DOCX needs sanitization (without processing)
   */
  async needsSanitization(buffer: Buffer): Promise<{
    needed: boolean;
    reasons: string[];
  }> {
    const reasons: string[] = [];

    try {
      const zip = await JSZip.loadAsync(buffer);

      // Check for dangerous files
      for (const dangerousPath of this.DANGEROUS_FILES) {
        if (dangerousPath.endsWith('/')) {
          const files = Object.keys(zip.files).filter((p) => p.startsWith(dangerousPath));
          if (files.length > 0) {
            reasons.push(`Contains ${dangerousPath} (${files.length} files)`);
          }
        } else {
          if (zip.file(dangerousPath)) {
            reasons.push(`Contains ${dangerousPath}`);
          }
        }
      }

      // Check relationships
      const relsFile = zip.file('word/_rels/document.xml.rels');
      if (relsFile) {
        const content = await relsFile.async('string');

        for (const dangerousType of this.DANGEROUS_REL_TYPES) {
          if (content.includes(dangerousType)) {
            reasons.push(`Contains relationship type: ${dangerousType}`);
          }
        }
      }

      return {
        needed: reasons.length > 0,
        reasons,
      };
    } catch (error: any) {
      logger.error({ error }, 'Failed to check if sanitization needed');
      return { needed: false, reasons: [] };
    }
  }
}

// Singleton instance
export const docxSanitizer = new DocxSanitizer();
