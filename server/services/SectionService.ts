import type { InsertSection, Section } from "@shared/schema";

import {
  pageRepository,
  sectionRepository,
  type DbTransaction,
} from "../repositories";
import { getCurrentTenantId, withCurrentTenant } from "../utils/rlsContext";

import { assertValidSectionSpans, SectionLayoutError } from "./sectionSpans";
import { workflowService } from "./WorkflowService";
import { workflowTenantResolver } from "./WorkflowTenantResolver";

const SECTION_NOT_FOUND = "Section not found";

export interface CreateSectionData {
  title: string;
  description?: string | null;
  visibleIf?: unknown;
}

export interface UpdateSectionData {
  title?: string;
  description?: string | null;
  visibleIf?: unknown;
}

export interface SectionServiceDeps {
  sectionRepo?: typeof sectionRepository;
  pageRepo?: typeof pageRepository;
  workflowSvc?: typeof workflowService;
}

export class SectionService {
  private readonly sectionRepo: typeof sectionRepository;
  private readonly pageRepo: typeof pageRepository;
  private readonly workflowSvc: typeof workflowService;

  constructor(deps: SectionServiceDeps = {}) {
    this.sectionRepo = deps.sectionRepo ?? sectionRepository;
    this.pageRepo = deps.pageRepo ?? pageRepository;
    this.workflowSvc = deps.workflowSvc ?? workflowService;
  }

  private async withTx<T>(
    tx: DbTransaction | undefined,
    fn: (scopedTx: DbTransaction) => Promise<T>,
  ): Promise<T> {
    return tx ? fn(tx) : withCurrentTenant(fn);
  }

  async createSection(
    workflowId: string,
    userId: string,
    data: CreateSectionData,
    pageIds: string[],
    callerTx?: DbTransaction,
  ): Promise<Section> {
    return this.withTx(callerTx, async (tx) => {
      try {
        await this.workflowSvc.verifyAccess(workflowId, userId, "edit", tx);
      } catch (error) {
        if (error instanceof Error && error.message.includes("Access denied")) {
          const ambientTenantId = getCurrentTenantId();
          const workflowTenantId = await workflowTenantResolver.resolveForWorkflowId(workflowId, tx);
          if (!ambientTenantId || !workflowTenantId || ambientTenantId !== workflowTenantId) {
            throw new Error("Workflow not found");
          }
        }
        throw error;
      }
      await this.sectionRepo.lockWorkflowStructure(workflowId, tx);

      if (pageIds.length === 0) {
        throw new SectionLayoutError("A Section requires at least one page");
      }
      if (new Set(pageIds).size !== pageIds.length) {
        throw new SectionLayoutError("Section pageIds must not contain duplicates");
      }

      const activePages = await this.pageRepo.findByWorkflowId(workflowId, tx);
      const pageById = new Map(activePages.map((page) => [page.id, page]));
      for (const pageId of pageIds) {
        if (!pageById.has(pageId)) {
          throw new Error("Page not found");
        }
      }

      const safeData: InsertSection = {
        workflowId,
        title: data.title,
        description: data.description,
        visibleIf: data.visibleIf,
      };
      const section = await this.sectionRepo.create(safeData, tx);
      for (const pageId of pageIds) {
        await this.pageRepo.updateSectionId(pageId, workflowId, section.id, tx);
      }

      const persistedPages = await this.pageRepo.findByWorkflowId(workflowId, tx);
      const existingSections = await this.sectionRepo.findByWorkflowId(workflowId, tx);
      assertValidSectionSpans(persistedPages, existingSections);
      return section;
    });
  }

  async getSections(
    workflowId: string,
    userId: string,
    tx?: DbTransaction,
  ): Promise<Section[]> {
    return this.withTx(tx, async (scopedTx) => {
      await this.workflowSvc.verifyAccess(workflowId, userId, "view", scopedTx);
      return this.sectionRepo.findByWorkflowId(workflowId, scopedTx);
    });
  }

  async updateSection(
    sectionId: string,
    userId: string,
    data: UpdateSectionData,
    callerTx?: DbTransaction,
  ): Promise<Section> {
    return this.withTx(callerTx, async (tx) => {
      const section = await this.sectionRepo.findById(sectionId, tx);
      if (!section) {
        throw new Error(SECTION_NOT_FOUND);
      }
      await this.workflowSvc.verifyAccess(section.workflowId, userId, "edit", tx);
      return this.sectionRepo.update(sectionId, data, tx);
    });
  }

  async deleteSection(
    sectionId: string,
    userId: string,
    callerTx?: DbTransaction,
  ): Promise<void> {
    await this.withTx(callerTx, async (tx) => {
      const initial = await this.sectionRepo.findById(sectionId, tx);
      if (!initial) {
        throw new Error(SECTION_NOT_FOUND);
      }
      await this.workflowSvc.verifyAccess(initial.workflowId, userId, "edit", tx);
      await this.sectionRepo.lockWorkflowStructure(initial.workflowId, tx);

      const section = await this.sectionRepo.findByIdAndWorkflow(
        sectionId,
        initial.workflowId,
        tx,
      );
      if (!section) {
        throw new Error(SECTION_NOT_FOUND);
      }

      await this.sectionRepo.delete(sectionId, tx);
      const activePages = await this.pageRepo.findByWorkflowId(initial.workflowId, tx);
      const remainingSections = await this.sectionRepo.findByWorkflowId(initial.workflowId, tx);
      assertValidSectionSpans(activePages, remainingSections);
    });
  }
}

export const sectionService = new SectionService();
