import { asc, eq } from "drizzle-orm";

import {
  pages,
  sections,
  workflows,
  type InsertSection,
  type Section,
} from "@shared/schema";

import { db } from "../db";

import { BaseRepository, type DbTransaction } from "./BaseRepository";

/** Repository for Section rows and workflow-structure serialization. */
export class SectionRepository extends BaseRepository<typeof sections, Section, InsertSection> {
  constructor(dbInstance?: typeof db) {
    super(sections, dbInstance);
  }

  async findByWorkflowId(workflowId: string, tx?: DbTransaction): Promise<Section[]> {
    const database = this.getDb(tx);
    return database
      .select()
      .from(sections)
      .where(eq(sections.workflowId, workflowId))
      .orderBy(asc(sections.createdAt));
  }

  async findByIdAndWorkflow(
    sectionId: string,
    workflowId: string,
    tx?: DbTransaction,
  ): Promise<Section | undefined> {
    const database = this.getDb(tx);
    const [section] = await database
      .select()
      .from(sections)
      .where(eq(sections.id, sectionId));
    return section?.workflowId === workflowId ? section : undefined;
  }

  /**
   * Serialize every membership-changing operation for one workflow. The
   * workflow row is the common mutex; page/Section locks also keep the state
   * read for validation stable through commit.
   */
  async lockWorkflowStructure(workflowId: string, tx: DbTransaction): Promise<void> {
    await tx
      .select({ id: workflows.id })
      .from(workflows)
      .where(eq(workflows.id, workflowId))
      .for("update");
    await tx
      .select({ id: pages.id })
      .from(pages)
      .where(eq(pages.workflowId, workflowId))
      .for("update");
    await tx
      .select({ id: sections.id })
      .from(sections)
      .where(eq(sections.workflowId, workflowId))
      .for("update");
  }
}

export const sectionRepository = new SectionRepository();
