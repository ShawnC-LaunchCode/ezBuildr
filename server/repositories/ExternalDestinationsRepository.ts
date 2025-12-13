import { db } from "../db";
import { externalDestinations } from "@shared/schema";
import { eq } from "drizzle-orm";
import type { ExternalDestination } from "@shared/types/blocks";

export class ExternalDestinationsRepository {
    async findById(id: string): Promise<ExternalDestination | null> {
        const [result] = await db
            .select()
            .from(externalDestinations)
            .where(eq(externalDestinations.id, id))
            .limit(1);

        if (!result) return null;

        // Map DB type to Shared Type if needed (or cast)
        // Drizzle result `authConfig` is jsonb, typically cast to Record<string, any>
        // Shared `ExternalDestination.config` is Record<string, any>.
        // Validation? For now assuming Schema matches.

        return result as unknown as ExternalDestination;
    }
}

export const externalDestinationsRepository = new ExternalDestinationsRepository();
