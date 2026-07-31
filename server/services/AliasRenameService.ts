/**
 * Alias Rename Propagation
 *
 * When a step's variable name (alias) changes, every workflow-scoped
 * reference that stores the alias as a string must follow, or documents,
 * transforms, and visibility logic silently break. This service rewrites:
 *
 * - transform block inputKeys
 * - document hook inputKeys
 * - lifecycle hook inputKeys
 * - Final Block document mapping sources (step config.documents[].mapping)
 * - step visibleIf expressions (any step in the workflow, not just the
 *   renamed one)
 * - section visibleIf expressions
 *
 * Not rewritten (by design):
 * - templates.mapping (project-scoped, shared across workflows)
 * - placeholder text inside uploaded DOCX files (unreachable; the template
 *   validation panel surfaces these as missing with a rename suggestion)
 * - `logic_rules` rows: `conditionStepId`/`targetStepId`/`targetSectionId`
 *   are step/section UUID foreign keys, not alias strings — the alias is
 *   only ever resolved to an id once, at ingest time
 *   (WorkflowContentIngestService.syncLogicRules), and is re-derived live
 *   from the current alias for display/lint purposes
 *   (VersionService.serializeWorkflow). A rename cannot leave a logic rule
 *   referencing a stale alias because none is stored.
 */

import type { Logger } from 'pino';

import { renameAliasInExpression } from '@shared/conditionEvaluator';
import type { ConditionExpression } from '@shared/types/conditions';

import { logger } from '../logger';
import {
  documentHookRepository,
  lifecycleHookRepository,
  sectionRepository,
  stepRepository,
  transformBlockRepository,
} from '../repositories';
import type { Section, Step } from '../../shared/schema';
import type { DbTransaction } from '../repositories/BaseRepository';

import type { DocumentMapping } from './document/MappingInterpreter';

export interface AliasRenameResult {
  transformBlocksUpdated: number;
  documentHooksUpdated: number;
  lifecycleHooksUpdated: number;
  finalBlockStepsUpdated: number;
  stepVisibleIfUpdated: number;
  sectionVisibleIfUpdated: number;
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
    newAlias: string,
    tx?: DbTransaction
  ): Promise<AliasRenameResult> {
    const result: AliasRenameResult = {
      transformBlocksUpdated: 0,
      documentHooksUpdated: 0,
      lifecycleHooksUpdated: 0,
      finalBlockStepsUpdated: 0,
      stepVisibleIfUpdated: 0,
      sectionVisibleIfUpdated: 0,
    };
    const log = logger.child({ workflowId, oldAlias, newAlias, service: 'AliasRenameService' });

    // Transform block inputKeys
    try {
      const blocks = await transformBlockRepository.findByWorkflowId(workflowId, tx);
      for (const block of blocks) {
        const replaced = replaceKey(block.inputKeys, oldAlias, newAlias);
        if (replaced !== null) {
          await transformBlockRepository.update(block.id, { inputKeys: replaced }, tx);
          result.transformBlocksUpdated++;
        }
      }
    } catch (error) {
      log.error({ error }, 'Failed to propagate alias rename to transform blocks');
    }

    // Document hook inputKeys
    try {
      const hooks = await documentHookRepository.findByWorkflowId(workflowId, tx);
      for (const hook of hooks) {
        const replaced = replaceKey(hook.inputKeys, oldAlias, newAlias);
        if (replaced !== null) {
          await documentHookRepository.update(hook.id, { inputKeys: replaced }, tx);
          result.documentHooksUpdated++;
        }
      }
    } catch (error) {
      log.error({ error }, 'Failed to propagate alias rename to document hooks');
    }

    // Lifecycle hook inputKeys
    try {
      const hooks = await lifecycleHookRepository.findByWorkflowId(workflowId, tx);
      for (const hook of hooks) {
        const replaced = replaceKey(hook.inputKeys, oldAlias, newAlias);
        if (replaced !== null) {
          await lifecycleHookRepository.update(hook.id, { inputKeys: replaced }, tx);
          result.lifecycleHooksUpdated++;
        }
      }
    } catch (error) {
      log.error({ error }, 'Failed to propagate alias rename to lifecycle hooks');
    }

    // Sections + steps are shared by the Final Block, step-visibleIf, and
    // section-visibleIf reference types below.
    let sections: Section[] = [];
    let steps: Step[] = [];
    try {
      sections = await sectionRepository.findByWorkflowId(workflowId, tx);
      steps = await stepRepository.findBySectionIds(sections.map((s) => s.id), tx);
    } catch (error) {
      log.error({ error }, 'Failed to load sections/steps for alias rename propagation');
    }

    // Final Block document mapping sources
    try {
      for (const step of steps) {
        if (step.type !== 'final' && step.type !== 'final_documents') {
          continue;
        }
        const rewritten = rewriteFinalBlockMapping(step.config, oldAlias, newAlias);
        if (rewritten !== null) {
          await stepRepository.update(step.id, { config: rewritten }, tx);
          result.finalBlockStepsUpdated++;
        }
      }
    } catch (error) {
      log.error({ error }, 'Failed to propagate alias rename to Final Block mappings');
    }

    result.stepVisibleIfUpdated = await this.renameStepVisibleIf(steps, oldAlias, newAlias, log, tx);
    result.sectionVisibleIfUpdated = await this.renameSectionVisibleIf(sections, oldAlias, newAlias, log, tx);

    const total =
      result.transformBlocksUpdated +
      result.documentHooksUpdated +
      result.lifecycleHooksUpdated +
      result.finalBlockStepsUpdated +
      result.stepVisibleIfUpdated +
      result.sectionVisibleIfUpdated;
    if (total > 0) {
      log.info(result, 'Alias rename propagated to workflow references');
    }

    return result;
  }

  /** Rewrite step.visibleIf expressions referencing oldAlias. */
  private async renameStepVisibleIf(
    steps: Step[],
    oldAlias: string,
    newAlias: string,
    log: Logger,
    tx?: DbTransaction
  ): Promise<number> {
    let count = 0;
    try {
      for (const step of steps) {
        const rewritten = renameAliasInExpression(step.visibleIf as ConditionExpression, oldAlias, newAlias);
        if (rewritten !== step.visibleIf) {
          await stepRepository.update(step.id, { visibleIf: rewritten }, tx);
          count++;
        }
      }
    } catch (error) {
      log.error({ error }, 'Failed to propagate alias rename to step visibleIf expressions');
    }
    return count;
  }

  /** Rewrite section.visibleIf expressions referencing oldAlias. */
  private async renameSectionVisibleIf(
    sections: Section[],
    oldAlias: string,
    newAlias: string,
    log: Logger,
    tx?: DbTransaction
  ): Promise<number> {
    let count = 0;
    try {
      for (const section of sections) {
        const rewritten = renameAliasInExpression(section.visibleIf as ConditionExpression, oldAlias, newAlias);
        if (rewritten !== section.visibleIf) {
          await sectionRepository.update(section.id, { visibleIf: rewritten }, tx);
          count++;
        }
      }
    } catch (error) {
      log.error({ error }, 'Failed to propagate alias rename to section visibleIf expressions');
    }
    return count;
  }
}

export const aliasRenameService = new AliasRenameService();
