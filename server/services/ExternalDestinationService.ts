
import { eq, and } from "drizzle-orm";

import {
    externalDestinations,
    type ExternalDestination,
    type InsertExternalDestination
} from "@shared/schema";

import { db } from "../db";
import { logger } from "../logger";

export class ExternalDestinationService {
    constructor(private database = db) { }

    /**
     * Create a new external destination
     */
    async createDestination(data: InsertExternalDestination): Promise<ExternalDestination> {
        logger.info({ tenantId: data.tenantId, type: data.type }, "Creating external destination");

        // Validate config based on type (basic check)
        if (!data.config) {
            throw new Error("Configuration is required");
        }

        const [destination] = await this.database
            .insert(externalDestinations)
            .values(data)
            .returning();

        return destination;
    }

    /**
     * Get all destinations for a tenant
     */
    async getDestinations(tenantId: string): Promise<ExternalDestination[]> {
        return this.database
            .select()
            .from(externalDestinations)
            .where(eq(externalDestinations.tenantId, tenantId));
    }

    /**
     * Get a single destination by ID
     */
    async getDestination(id: string, tenantId: string): Promise<ExternalDestination | undefined> {
        const [destination] = await this.database
            .select()
            .from(externalDestinations)
            .where(and(
                eq(externalDestinations.id, id),
                eq(externalDestinations.tenantId, tenantId)
            ));

        return destination;
    }

    /**
     * Update a destination
     */
    async updateDestination(
        id: string,
        tenantId: string,
        updates: Partial<InsertExternalDestination>
    ): Promise<ExternalDestination | undefined> {
        logger.info({ id, tenantId }, "Updating external destination");

        const [updated] = await this.database
            .update(externalDestinations)
            .set({ ...updates, updatedAt: new Date() })
            .where(and(
                eq(externalDestinations.id, id),
                eq(externalDestinations.tenantId, tenantId)
            ))
            .returning();

        return updated;
    }

    /**
     * Delete a destination
     */
    async deleteDestination(id: string, tenantId: string): Promise<void> {
        logger.info({ id, tenantId }, "Deleting external destination");

        await this.database
            .delete(externalDestinations)
            .where(and(
                eq(externalDestinations.id, id),
                eq(externalDestinations.tenantId, tenantId)
            ));
    }
}

export const externalDestinationService = new ExternalDestinationService();
