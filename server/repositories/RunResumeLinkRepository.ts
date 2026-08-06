import { and, eq, gt, isNull } from "drizzle-orm";

import {
  runResumeLinks,
  type InsertRunResumeLink,
  type RunResumeLink,
} from "@shared/schema";

import type { DbTransaction } from "./BaseRepository";
import { BaseRepository } from "./BaseRepository";

export class RunResumeLinkRepository extends BaseRepository<
  typeof runResumeLinks,
  RunResumeLink,
  InsertRunResumeLink
> {
  constructor() {
    super(runResumeLinks);
  }

  async consumeActive(
    runId: string,
    tokenHash: string,
    now: Date,
    tx?: DbTransaction,
  ): Promise<RunResumeLink | null> {
    const database = this.getDb(tx);
    const [link] = await database
      .update(runResumeLinks)
      .set({ usedAt: now })
      .where(and(
        eq(runResumeLinks.runId, runId),
        eq(runResumeLinks.tokenHash, tokenHash),
        gt(runResumeLinks.expiresAt, now),
        isNull(runResumeLinks.usedAt),
        isNull(runResumeLinks.revokedAt),
      ))
      .returning();
    return link ?? null;
  }

  async revokeActiveForRun(runId: string, now: Date, tx?: DbTransaction): Promise<void> {
    const database = this.getDb(tx);
    await database
      .update(runResumeLinks)
      .set({ revokedAt: now })
      .where(and(
        eq(runResumeLinks.runId, runId),
        isNull(runResumeLinks.usedAt),
        isNull(runResumeLinks.revokedAt),
      ));
  }

  async revokeById(id: string, now: Date, tx?: DbTransaction): Promise<void> {
    const database = this.getDb(tx);
    await database
      .update(runResumeLinks)
      .set({ revokedAt: now })
      .where(and(eq(runResumeLinks.id, id), isNull(runResumeLinks.usedAt)));
  }
}

export const runResumeLinkRepository = new RunResumeLinkRepository();
