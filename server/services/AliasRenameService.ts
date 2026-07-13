/**
 * Alias Rename Propagation
 *
 * When a step's variable name (alias) changes, every workflow-scoped
 * reference that stores the alias as a string must follow, or documents and
 * transforms silently break. This service rewrites:
 *
 * - transform block inputKeys
 * - document hook inputKeys
 * - lifecycle hook inputKeys
 * - Final Block document mapping sources (step config.documents[].mapping)
 *
 * Not rewritten (by design):
 * - templates.mapping (project-scoped, shared across workflows)
 * - placeholder text inside uploaded DOCX files (unreachable; the template
 *   validation panel surfaces these as missing with a rename suggestion)
 */

import { logger } from '../logger';
import {
  documentHookRepository,
  lifecycleHookRepository,
  sectionRepository,
  stepRepository,
  transformBlockRepository,
} from '../repositories';

import type { DocumentMapping } from './document/MappingInterpreter';

export interface AliasRenameResult {
  transformBlocksUpdated: number;
  documentHooksUpdated: number;
  lifecycleHooksUpdated: number;
  finalBlockStepsUpdated: number;
}

interface FinalBlockDocumentConfig {
  mapping?: DocumentMapping;
  [key: string]: unknown;
}

interface FinalBlockOptions {
  documents?: FinalBlockDocumentConfig[];
  [key: string]: unknown;
}

function replaceKey(keys: string[] | null | undefined, oldAlias: string, newAlias: string): string[] | null {
  if (!keys?.includes(oldAlias)) {
    return null;
  }
  return keys.map((k) => (k === oldAlias ? newAlias : k));
}

/**
 * Rewrite mapping sources in a Final Block config object.
 * Returns the updated config, or null when nothing referenced the alias.
 */
export function rewriteFinalBlockMapping(
  config: unknown,
  oldAlias: string,
  newAlias: string
): FinalBlockOptions | null {
  const opts = config as FinalBlockOptions | null;
  if (!opts?.documents || !Array.isArray(opts.documents)) {
    return null;
  }

  let changed = false;
  const documents = opts.documents.map((doc) => {
    if (doc?.mapping === undefined || doc.mapping === null) {
      return doc;
    }
    let docChanged = false;
    const mapping: DocumentMapping = {};
    for (const [target, entry] of Object.entries(doc.mapping)) {
      if (entry?.type === 'variable' && entry.source === oldAlias) {
        mapping[target] = { ...entry, source: newAlias };
        docChanged = true;
      } else {
        mapping[target] = entry;
      }
    }
    if (docChanged) {
      changed = true;
      return { ...doc, mapping };
    }
    return doc;
  });

  return changed ? { ...opts, documents } : null;
}

export class AliasRenameService {
  /**
   * Rewrite all workflow-scoped references from oldAlias to newAlias.
   * Best-effort per reference type: a failure in one type is logged and
   * does not block the others (the step's own alias is already renamed).
   */
  async propagateRename(
    workflowId: string,
    oldAlias: string,
    newAlias: string
  ): Promise<AliasRenameResult> {
    const result: AliasRenameResult = {
      transformBlocksUpdated: 0,
      documentHooksUpdated: 0,
      lifecycleHooksUpdated: 0,
      finalBlockStepsUpdated: 0,
    };
    const log = logger.child({ workflowId, oldAlias, newAlias, service: 'AliasRenameService' });

    // Transform block inputKeys
    try {
      const blocks = await transformBlockRepository.findByWorkflowId(workflowId);
      for (const block of blocks) {
        const replaced = replaceKey(block.inputKeys, oldAlias, newAlias);
        if (replaced !== null) {
          await transformBlockRepository.update(block.id, { inputKeys: replaced });
          result.transformBlocksUpdated++;
        }
      }
    } catch (error) {
      log.error({ error }, 'Failed to propagate alias rename to transform blocks');
    }

    // Document hook inputKeys
    try {
      const hooks = await documentHookRepository.findByWorkflowId(workflowId);
      for (const hook of hooks) {
        const replaced = replaceKey(hook.inputKeys, oldAlias, newAlias);
        if (replaced !== null) {
          await documentHookRepository.update(hook.id, { inputKeys: replaced });
          result.documentHooksUpdated++;
        }
      }
    } catch (error) {
      log.error({ error }, 'Failed to propagate alias rename to document hooks');
    }

    // Lifecycle hook inputKeys
    try {
      const hooks = await lifecycleHookRepository.findByWorkflowId(workflowId);
      for (const hook of hooks) {
        const replaced = replaceKey(hook.inputKeys, oldAlias, newAlias);
        if (replaced !== null) {
          await lifecycleHookRepository.update(hook.id, { inputKeys: replaced });
          result.lifecycleHooksUpdated++;
        }
      }
    } catch (error) {
      log.error({ error }, 'Failed to propagate alias rename to lifecycle hooks');
    }

    // Final Block document mapping sources
    try {
      const sections = await sectionRepository.findByWorkflowId(workflowId);
      const steps = await stepRepository.findBySectionIds(sections.map((s) => s.id));
      for (const step of steps) {
        if (step.type !== 'final' && step.type !== 'final_documents') {
          continue;
        }
        const rewritten = rewriteFinalBlockMapping(step.config, oldAlias, newAlias);
        if (rewritten !== null) {
          await stepRepository.update(step.id, { config: rewritten });
          result.finalBlockStepsUpdated++;
        }
      }
    } catch (error) {
      log.error({ error }, 'Failed to propagate alias rename to Final Block mappings');
    }

    const total =
      result.transformBlocksUpdated +
      result.documentHooksUpdated +
      result.lifecycleHooksUpdated +
      result.finalBlockStepsUpdated;
    if (total > 0) {
      log.info(result, 'Alias rename propagated to workflow references');
    }

    return result;
  }
}

export const aliasRenameService = new AliasRenameService();
