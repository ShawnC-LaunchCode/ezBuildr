import { eq, and, inArray } from "drizzle-orm";

import { files, type File, type InsertFile } from "@shared/schema";

import { BaseRepository, type DbTransaction } from "./BaseRepository";

/**
 * Repository for file-related database operations
 * Handles file metadata storage and retrieval for answer attachments
 */
export class FileRepository extends BaseRepository<typeof files, File, InsertFile> {
  constructor() {
    super(files);
  }

  /**
   * Create file record
   */
  async create(file: InsertFile, tx?: DbTransaction): Promise<File> {
    const database = this.getDb(tx);
    const [newFile] = await database.insert(files).values(file as any).returning();
    return newFile;
  }

  /**
   * Bulk create file records
   */
  async bulkCreate(fileData: InsertFile[], tx?: DbTransaction): Promise<File[]> {
    const database = this.getDb(tx);
    return database.insert(files).values(fileData as any).returning();
  }

  /**
   * Find file by ID
   */
  async findById(id: string, tx?: DbTransaction): Promise<File | undefined> {
    const database = this.getDb(tx);
    const [file] = await database.select().from(files).where(eq(files.id, id));
    return file;
  }

  /**
   * Find files by answer ID
   */
  async findByAnswer(answerId: string, tx?: DbTransaction): Promise<File[]> {
    const database = this.getDb(tx);
    return database
      .select()
      .from(files)
      .where(eq(files.answerId, answerId))
      .orderBy(files.uploadedAt);
  }

  /**
   * Find files by multiple answer IDs (bulk query)
   */
  async findByAnswers(answerIds: string[], tx?: DbTransaction): Promise<File[]> {
    if (answerIds.length === 0) {
      return [];
    }

    const database = this.getDb(tx);
    return database
      .select()
      .from(files)
      .where(inArray(files.answerId, answerIds))
      .orderBy(files.uploadedAt);
  }

  /**
   * Update file metadata
   */
  async update(id: string, updates: Partial<InsertFile>, tx?: DbTransaction): Promise<File> {
    const database = this.getDb(tx);
    const [updatedFile] = await database
      .update(files)
      .set(updates as any)
      .where(eq(files.id, id))
      .returning();
    return updatedFile;
  }

  /**
   * Delete file by ID
   */
  async delete(id: string, tx?: DbTransaction): Promise<void> {
    const database = this.getDb(tx);
    await database.delete(files).where(eq(files.id, id));
  }

  /**
   * Delete files by answer ID
   */
  async deleteByAnswer(answerId: string, tx?: DbTransaction): Promise<void> {
    const database = this.getDb(tx);
    await database.delete(files).where(eq(files.answerId, answerId));
  }

  /**
   * Delete files by multiple answer IDs (bulk cleanup)
   */
  async deleteByAnswers(answerIds: string[], tx?: DbTransaction): Promise<void> {
    if (answerIds.length === 0) {
      return;
    }

    const database = this.getDb(tx);
    await database.delete(files).where(inArray(files.answerId, answerIds));
  }

  /**
   * Check if file exists
   */
  async exists(id: string, tx?: DbTransaction): Promise<boolean> {
    const file = await this.findById(id, tx);
    return !!file;
  }

  /**
   * Get total file size for an answer
   */
  async getTotalSizeByAnswer(answerId: string, tx?: DbTransaction): Promise<number> {
    const filesData = await this.findByAnswer(answerId, tx);
    return filesData.reduce((total, file) => total + file.size, 0);
  }

  /**
   * Count files by answer ID
   */
  async countByAnswer(answerId: string, tx?: DbTransaction): Promise<number> {
    const filesData = await this.findByAnswer(answerId, tx);
    return filesData.length;
  }

  /**
   * Get files with specific MIME types
   */
  async findByAnswerAndMimeType(
    answerId: string,
    mimeTypes: string[],
    tx?: DbTransaction
  ): Promise<File[]> {
    const database = this.getDb(tx);
    return database
      .select()
      .from(files)
      .where(and(eq(files.answerId, answerId), inArray(files.mimeType, mimeTypes)))
      .orderBy(files.uploadedAt);
  }
}

export const fileRepository = new FileRepository();
