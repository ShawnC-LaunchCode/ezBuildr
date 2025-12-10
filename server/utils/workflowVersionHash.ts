/**
 * Workflow Version Hash Utility
 *
 * Generates a deterministic hash of a workflow's structure for snapshot versioning.
 * The hash is based on all steps' IDs, aliases, and types, ensuring that any
 * structural change (add/remove/modify blocks) results in a new hash.
 *
 * This allows snapshots to detect when they're outdated relative to the current workflow.
 */

import crypto from 'crypto';
import type { Step } from '../repositories';

/**
 * Generates a version hash from workflow steps
 *
 * The hash includes:
 * - stepId: Unique identifier
 * - alias: Variable name (if set)
 * - type: Block type (short_text, choice, etc.)
 * - sectionId: Parent section (to detect moves)
 *
 * Steps are sorted by ID to ensure deterministic output regardless of query order.
 *
 * @param steps - Array of workflow steps
 * @returns SHA-256 hash of the workflow structure
 */
export function generateWorkflowVersionHash(steps: Step[]): string {
  // Build normalized structure
  const structure = steps
    .map(step => ({
      id: step.id,
      alias: step.alias || null,
      type: step.type,
      sectionId: step.sectionId,
    }))
    .sort((a, b) => a.id.localeCompare(b.id)); // Deterministic sort

  // Generate hash
  const json = JSON.stringify(structure);
  const hash = crypto.createHash('sha256').update(json).digest('hex');

  return hash;
}

/**
 * Checks if two version hashes match
 *
 * @param hash1 - First hash
 * @param hash2 - Second hash
 * @returns true if hashes match
 */
export function isVersionHashMatch(hash1: string | null, hash2: string | null): boolean {
  if (!hash1 || !hash2) return false;
  return hash1 === hash2;
}

/**
 * Generates a short version hash (first 12 chars) for display
 *
 * @param hash - Full hash
 * @returns Short hash
 */
export function shortVersionHash(hash: string): string {
  return hash.slice(0, 12);
}
