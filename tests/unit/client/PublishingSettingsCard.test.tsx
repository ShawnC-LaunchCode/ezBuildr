// @vitest-environment jsdom
/**
 * A draft's shareable link does not work for participants: the public start
 * endpoint answers "Workflow not found" to anyone but the signed-in creator until
 * the workflow is published. The card used to invite sharing it anyway — the
 * owner did exactly that on 2026-09-14 and got a "Session Error".
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PublishingSettingsCard } from '../../../client/src/components/builder/tabs/settings/PublishingSettingsCard';
import { TooltipProvider } from '../../../client/src/components/ui/tooltip';

const LINK = 'https://www.ezbuildr.com/w/estate-administration';

function renderCard(isPublished: boolean, shareableLink = LINK): void {
  render(
    <TooltipProvider>
      <PublishingSettingsCard
        isPublic
        setIsPublic={vi.fn()}
        requireLogin={false}
        setRequireLogin={vi.fn()}
        shareableLink={shareableLink}
        isPublished={isPublished}
        linkCopied={false}
        onCopyLink={vi.fn()}
      />
    </TooltipProvider>,
  );
}

describe('PublishingSettingsCard — shareable link copy', () => {
  afterEach(cleanup);

  it('a draft says the link is not live yet and how to activate it', () => {
    renderCard(false);

    expect(screen.getByText('Not live yet')).toBeTruthy();
    expect(screen.getByText(/Goes live when you publish from the Review tab/)).toBeTruthy();
    expect(screen.queryByText(/Share this link with participants/)).toBeNull();
  });

  it('a published workflow invites sharing, with no warning', () => {
    renderCard(true);

    expect(screen.getByText(/Share this link with participants/)).toBeTruthy();
    expect(screen.queryByText('Not live yet')).toBeNull();
  });

  it('before a link exists, it asks for a save whatever the status', () => {
    renderCard(false, '');

    expect(screen.getByText('Save settings to generate the participant link')).toBeTruthy();
  });
});
