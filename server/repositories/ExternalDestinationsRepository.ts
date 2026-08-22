import { eq } from "drizzle-orm";

import { externalDestinations } from "@shared/schema";
import type { ExternalDestination } from "@shared/types/blocks";

import { withCurrentTenant } from "../utils/rlsContext";

import type { DbTransaction } from "./BaseRepository";

export class ExternalDestinationsRepository {
    /**
     * `tx` is optional and, when omitted, this opens its own tenant-scoped
     * transaction. `external_destinations` is RLS-covered, so the bare-pool
     * read this used to do returned nothing under enforcement and every
     * external send resolved its destination to null.
     */
    async findById(id: string, tx?: DbTransaction): Promise<ExternalDestination | null> {
        const [result] = tx
            ? await tx
                .select()
                .from(externalDestinations)
                .where(eq(externalDestinations.id, id))
                .limit(1)
            : await withCurrentTenant((scopedTx) => scopedTx
                .select()
                .from(externalDestinations)
                .where(eq(externalDestinations.id, id))
                .limit(1));

        if (result === undefined) {return null;}

        // Map DB type to Shared Type if needed (or cast)
        // Drizzle result `authConfig` is jsonb, typically cast to Record<string, any>
        // Shared `ExternalDestination.config` is Record<string, any>.
        // Validation? For now assuming Schema matches.

        return result as unknown as ExternalDestination;
    }
}

export const externalDestinationsRepository = new ExternalDestinationsRepository();
