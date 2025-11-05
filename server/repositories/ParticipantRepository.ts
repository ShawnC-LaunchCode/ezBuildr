import { BaseRepository, type DbTransaction } from "./BaseRepository";
import { participants, type Participant, type InsertParticipant } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { db } from "../db";

/**
 * Repository for participant data access
 */
export class ParticipantRepository extends BaseRepository<
  typeof participants,
  Participant,
  InsertParticipant
> {
  constructor(dbInstance?: typeof db) {
    super(participants, dbInstance);
  }

  /**
   * Find participants by creator ID
   */
  async findByCreatorId(creatorId: string, tx?: DbTransaction): Promise<Participant[]> {
    const database = this.getDb(tx);
    return await database
      .select()
      .from(participants)
      .where(eq(participants.creatorId, creatorId));
  }

  /**
   * Find participant by email and creator
   */
  async findByEmailAndCreator(
    email: string,
    creatorId: string,
    tx?: DbTransaction
  ): Promise<Participant | undefined> {
    const database = this.getDb(tx);
    const [participant] = await database
      .select()
      .from(participants)
      .where(and(eq(participants.email, email), eq(participants.creatorId, creatorId)));
    return participant;
  }
}

// Singleton instance
export const participantRepository = new ParticipantRepository();
