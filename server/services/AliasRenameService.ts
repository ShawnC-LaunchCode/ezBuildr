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
 * - page visibleIf expressions
 * - Section visibleIf expressions
 *
 * Not rewritten (by design):
 * - templates.mapping (project-scoped, shared across workflows)
 * - placeholder text inside uploaded DOCX files (unreachable; the template
 *   validation panel surfaces these as missing with a rename suggestion)
 * - `logic_rules` rows: `conditionStepId`/`targetStepId`/`targetPageId`
 *   are step/page UUID foreign keys, not alias strings — the alias is
 *   only ever resolved to an id once, at ingest time
 *   (WorkflowContentIngestService.syncLogicRules), and is re-derived live
 *   from the current alias for display/lint purposes
 *   (VersionService.serializeWorkflow). A rename cannot leave a logic rule
 *   referencing a stale alias because none is stored.
 */

import { renameAliasInExpression } from '@shared/conditionEvaluator';
import type { ConditionExpression } from '@shared/types/conditions';

import { logger } from '../logger';
import {
  documentHookRepository,
  lifecycleHookRepository,
  pageRepository,
  sectionRepository,
  stepRepository,
  transformBlockRepository,
} from '../repositories';
import type { Page, Section, Step } from '../../shared/schema';
import type { DbTransaction } from '../repositories/BaseRepository';

import type { DocumentMapping } from './document/MappingInterpreter';

export interface AliasRenameResult {
  transformBlocksUpdated: number;
  documentHooksUpdated: number;
  lifecycleHooksUpdated: number;
  finalBlockStepsUpdated: number;
  stepVisibleIfUpdated: number;
  pageVisibleIfUpdated: number;
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
   *
   * Atomic (DEBT-16): this runs inside the caller's transaction (`tx`,
   * threaded since DEBT-14) alongside the step's own alias update, so a
   * failing query here must abort that same transaction rather than being
   * caught and logged. Postgres aborts the whole transaction on any
   * statement error regardless — swallowing the error here only hid that
   * fact, letting the caller believe the rename succeeded while the step
   * update it ran alongside silently failed to commit. There is no
   * best-effort mode: callers must let this reject and roll back with it.
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
      pageVisibleIfUpdated: 0,
      sectionVisibleIfUpdated: 0,
    };
    const log = logger.child({ workflowId, oldAlias, newAlias, service: 'AliasRenameService' });

    // Transform block inputKeys
    const transformBlocks = await transformBlockRepository.findByWorkflowId(workflowId, tx);
    for (const block of transformBlocks) {
      const replaced = replaceKey(block.inputKeys, oldAlias, newAlias);
      if (replaced !== null) {
        await transformBlockRepository.update(block.id, { inputKeys: replaced }, tx);
        result.transformBlocksUpdated++;
      }
    }

    // Document hook inputKeys
    const documentHooks = await documentHookRepository.findByWorkflowId(workflowId, tx);
    for (const hook of documentHooks) {
      const replaced = replaceKey(hook.inputKeys, oldAlias, newAlias);
      if (replaced !== null) {
        await documentHookRepository.update(hook.id, { inputKeys: replaced }, tx);
        result.documentHooksUpdated++;
      }
    }

    // Lifecycle hook inputKeys
    const lifecycleHooks = await lifecycleHookRepository.findByWorkflowId(workflowId, tx);
    for (const hook of lifecycleHooks) {
      const replaced = replaceKey(hook.inputKeys, oldAlias, newAlias);
      if (replaced !== null) {
        await lifecycleHookRepository.update(hook.id, { inputKeys: replaced }, tx);
        result.lifecycleHooksUpdated++;
      }
    }

    // Pages + steps are shared by the Final Block, step-visibleIf, and
    // page-visibleIf reference types below.
    const pages: Page[] = await pageRepository.findByWorkflowId(workflowId, tx);
    const sections: Section[] = await sectionRepository.findByWorkflowId(workflowId, tx);
    const steps: Step[] = await stepRepository.findByPageIds(pages.map((s) => s.id), tx);

    // Final Block document mapping sources
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

    result.stepVisibleIfUpdated = await this.renameStepVisibleIf(steps, oldAlias, newAlias, tx);
    result.pageVisibleIfUpdated = await this.renamePageVisibleIf(pages, oldAlias, newAlias, tx);
    result.sectionVisibleIfUpdated = await this.renameSectionVisibleIf(sections, oldAlias, newAlias, tx);

    const total =
      result.transformBlocksUpdated +
      result.documentHooksUpdated +
      result.lifecycleHooksUpdated +
      result.finalBlockStepsUpdated +
      result.stepVisibleIfUpdated +
      result.pageVisibleIfUpdated +
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
    tx?: DbTransaction
  ): Promise<number> {
    let count = 0;
    for (const step of steps) {
      const rewritten = renameAliasInExpression(step.visibleIf as ConditionExpression, oldAlias, newAlias);
      if (rewritten !== step.visibleIf) {
        await stepRepository.update(step.id, { visibleIf: rewritten }, tx);
        count++;
      }
    }
    return count;
  }

  /** Rewrite page.visibleIf expressions referencing oldAlias. */
  private async renamePageVisibleIf(
    pages: Page[],
    oldAlias: string,
    newAlias: string,
    tx?: DbTransaction
  ): Promise<number> {
    let count = 0;
    for (const page of pages) {
      const rewritten = renameAliasInExpression(page.visibleIf as ConditionExpression, oldAlias, newAlias);
      if (rewritten !== page.visibleIf) {
        await pageRepository.update(page.id, { visibleIf: rewritten }, tx);
        count++;
      }
    }
    return count;
  }

  /** Rewrite Section.visibleIf expressions referencing oldAlias. */
  private async renameSectionVisibleIf(
    sections: Section[],
    oldAlias: string,
    newAlias: string,
    tx?: DbTransaction
  ): Promise<number> {
    let count = 0;
    for (const section of sections) {
      const rewritten = renameAliasInExpression(section.visibleIf as ConditionExpression, oldAlias, newAlias);
      if (rewritten !== section.visibleIf) {
        await sectionRepository.update(section.id, { visibleIf: rewritten }, tx);
        count++;
      }
    }
    return count;
  }
}

export const aliasRenameService = new AliasRenameService();
