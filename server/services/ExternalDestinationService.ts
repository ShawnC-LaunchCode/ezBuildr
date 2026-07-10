
import { eq, and } from "drizzle-orm";

import {
    externalDestinations,
    type ExternalDestination,
    type InsertExternalDestination
} from "@shared/schema";

import { db } from "../db";
import { logger } from "../logger";
import { encrypt, decrypt } from "../utils/encryption";

const SENSITIVE_KEYS = ['password', 'token', 'secret', 'key', 'apikey', 'apisecret', 'clientsecret', 'authorization'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function encryptConfig(config: any): any {
    if (!config || typeof config !== 'object') { return config; }
    const result = { ...config };
    for (const [key, value] of Object.entries(result)) {
        if (typeof value === 'string' && SENSITIVE_KEYS.some(k => key.toLowerCase().includes(k))) {
            result[key] = encrypt(value);
        } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            result[key] = encryptConfig(value);
        }
    }
    return result;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function decryptConfig(config: any): any {
    if (!config || typeof config !== 'object') { return config; }
    const result = { ...config };
    for (const [key, value] of Object.entries(result)) {
        if (typeof value === 'string' && SENSITIVE_KEYS.some(k => key.toLowerCase().includes(k))) {
            try {
                result[key] = decrypt(value);
            } catch {
                // If it fails to decrypt, assume it's legacy plaintext
            }
        } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            result[key] = decryptConfig(value);
        }
    }
    return result;
}

export class ExternalDestinationService {
    constructor(private database = db) { }

    /**
     * Create a new external destination
     */
    async createDestination(data: InsertExternalDestination): Promise<ExternalDestination> {
        logger.info({ tenantId: data.tenantId, type: data.type }, "Creating external destination");

        // Validate config based on type (basic check)
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions -- config may be null/undefined
        if (!data.config) {
            throw new Error("Configuration is required");
        }

        const encryptedData = { ...data, config: encryptConfig(data.config) };

        const [destination] = await this.database
            .insert(externalDestinations)
            .values(encryptedData)
            .returning();

        destination.config = decryptConfig(destination.config);
        return destination;
    }

    /**
     * Get all destinations for a tenant
     */
    async getDestinations(tenantId: string): Promise<ExternalDestination[]> {
        const dests = await this.database
            .select()
            .from(externalDestinations)
            .where(eq(externalDestinations.tenantId, tenantId));
            
        return dests.map(d => ({ ...d, config: decryptConfig(d.config) }));
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

        if (destination) {
            destination.config = decryptConfig(destination.config);
        }
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

        const encryptedUpdates = { ...updates };
        if (updates.config) {
            encryptedUpdates.config = encryptConfig(updates.config);
        }

        const [updated] = await this.database
            .update(externalDestinations)
            .set({ ...encryptedUpdates, updatedAt: new Date() })
            .where(and(
                eq(externalDestinations.id, id),
                eq(externalDestinations.tenantId, tenantId)
            ))
            .returning();

        if (updated) {
            updated.config = decryptConfig(updated.config);
        }
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
