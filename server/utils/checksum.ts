import { createHash } from 'crypto';

/**
 * Compute SHA256 checksum of workflow version content
 * Used for integrity verification and change detection
 */
export function computeChecksum(content: {
  graphJson: any;
  bindings?: any;
  templateIds?: string[];
}): string {
  // Create deterministic string representation
  const normalized = JSON.stringify({
    graph: content.graphJson,
    bindings: content.bindings || {},
    templates: (content.templateIds || []).sort(), // Sort for consistency
  });

  // Compute SHA256 hash
  return createHash('sha256')
    .update(normalized, 'utf8')
    .digest('hex');
}

/**
 * Verify checksum matches content
 */
export function verifyChecksum(
  content: { graphJson: any; bindings?: any; templateIds?: string[] },
  expectedChecksum: string
): boolean {
  const computed = computeChecksum(content);
  return computed === expectedChecksum;
}
