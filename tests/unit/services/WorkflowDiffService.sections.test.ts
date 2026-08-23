import { describe, expect, it } from 'vitest';

import { workflowDiffService } from '../../../server/services/diff/WorkflowDiffService';
import type { WorkflowJSON } from '../../../shared/types/workflow';

function graph(value: Record<string, unknown>): WorkflowJSON {
  return value as WorkflowJSON;
}

describe('WorkflowDiffService Section/Page structured diff', () => {
  it('reports Section add/remove/rename and distinct Page and nested Step changes', () => {
    const oldGraph = graph({
      id: 'workflow-1',
      title: 'Interview',
      sections: [
        { id: 'section-renamed', title: 'Old title' },
        { id: 'section-removed', title: 'Removed Section' },
      ],
      pages: [
        {
          id: 'page-kept', title: 'Kept page', order: 0, sectionId: 'section-renamed',
          steps: [{ id: 'step-kept', type: 'short_text', title: 'Old question', required: false }],
        },
        { id: 'page-removed', title: 'Removed page', order: 1, sectionId: 'section-removed', steps: [] },
      ],
    });
    const newGraph = graph({
      id: 'workflow-1',
      title: 'Interview',
      sections: [
        { id: 'section-renamed', title: 'New title' },
        { id: 'section-added', title: 'Added Section' },
      ],
      pages: [
        {
          id: 'page-kept', title: 'Kept page', order: 0, sectionId: 'section-added',
          steps: [
            { id: 'step-kept', type: 'short_text', title: 'New question', required: true },
            { id: 'step-added', type: 'email', title: 'Email' },
          ],
        },
        { id: 'page-added', title: 'Added page', order: 1, sectionId: null, steps: [] },
      ],
    });

    const diff = workflowDiffService.diff(oldGraph, newGraph);

    expect(diff.summary).toEqual({
      sectionsAdded: 1,
      sectionsRemoved: 1,
      sectionsModified: 1,
      pagesAdded: 1,
      pagesRemoved: 1,
      pagesModified: 1,
      stepsAdded: 1,
      stepsRemoved: 0,
      stepsModified: 1,
    });
    expect(diff.sections).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'section-added', changeType: 'added' }),
      expect.objectContaining({ id: 'section-removed', changeType: 'removed' }),
      expect.objectContaining({
        id: 'section-renamed',
        changeType: 'modified',
        propertyChanges: { title: { oldValue: 'Old title', newValue: 'New title' } },
      }),
    ]));
    const modifiedPage = diff.pages.find(page => page.id === 'page-kept');
    expect(modifiedPage?.changeType).toBe('modified');
    expect(modifiedPage?.propertyChanges?.sectionId).toEqual({
      oldValue: 'section-renamed',
      newValue: 'section-added',
    });
    expect(diff.pages).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'page-added', changeType: 'added' }),
      expect.objectContaining({ id: 'page-removed', changeType: 'removed' }),
    ]));
    expect(diff.steps).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'step-added', changeType: 'added' }),
      expect.objectContaining({ id: 'step-kept', changeType: 'modified' }),
    ]));
  });

  it('keeps the legacy changelog contract and de-duplicates top-level/nested Step copies', () => {
    const oldGraph = graph({
      id: 'workflow-1', title: 'Interview', sections: [],
      pages: [{ id: 'page-1', title: 'Page', order: 0, steps: [] }],
      steps: [],
    });
    const duplicatedStep = { id: 'step-1', type: 'email', title: 'Email', required: true };
    const newGraph = graph({
      id: 'workflow-1', title: 'Interview', sections: [],
      pages: [{ id: 'page-1', title: 'Page', order: 0, steps: [duplicatedStep] }],
      steps: [duplicatedStep],
    });

    const diff = workflowDiffService.diff(oldGraph, newGraph);

    expect(diff.steps).toEqual([expect.objectContaining({ id: 'step-1', changeType: 'added' })]);
    expect(diff.summary.stepsAdded).toBe(1);
    expect(diff).toEqual(expect.objectContaining({
      added: [expect.objectContaining({ id: 'step-1', changeType: 'added' })],
      removed: [],
      modified: [],
      severity: 'soft_breaking',
    }));
  });
});
