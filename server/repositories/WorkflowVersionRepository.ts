import { workflowVersions, type InsertWorkflowVersion, type WorkflowVersion } from "@shared/schema";

import { db } from "../db";

import { BaseRepository } from "./BaseRepository";

export class WorkflowVersionRepository extends BaseRepository<
  typeof workflowVersions,
  WorkflowVersion,
  InsertWorkflowVersion
> {
  constructor(dbInstance?: typeof db) {
    super(workflowVersions, dbInstance);
  }
}

export const workflowVersionRepository = new WorkflowVersionRepository();
