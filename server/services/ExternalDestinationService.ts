
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

type ConfigObject = Record<string, unknown>;

function isConfigObject(value: unknown): value is ConfigObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mapSensitiveConfig(config: unknown, transform: (value: string) => string): unknown {
    if (!isConfigObject(config)) {
        return config;
    }
    const result: ConfigObject = {};
    for (const [key, value] of Object.entries(config)) {
        if (typeof value === 'string' && SENSITIVE_KEYS.some(k => key.toLowerCase().includes(k))) {
            result[key] = transform(value);
            continue;
        }
        result[key] = isConfigObject(value) ? mapSensitiveConfig(value, transform) : value;
    }
    return result;
}

function encryptConfig(config: unknown): unknown {
    return mapSensitiveConfig(config, encrypt);
}

function decryptConfig(config: unknown): unknown {
    if (!isConfigObject(config)) {
        return config;
    }
    const result: ConfigObject = {};
    for (const [key, value] of Object.entries(config)) {
        if (typeof value === 'string' && SENSITIVE_KEYS.some(k => key.toLowerCase().includes(k))) {
            try {
                result[key] = decrypt(value);
            } catch {
                result[key] = value;
            }
            continue;
        }
        result[key] = isConfigObject(value) ? decryptConfig(value) : value;
    }
    return result;
}

function firstDestination(rows: ExternalDestination[]): ExternalDestination | undefined {
    return rows.length > 0 ? rows[0] : undefined;
}

export class ExternalDestinationService {
    constructor(private database = db) { }

    /**
     * Create a new external destination
     */
    async createDestination(data: InsertExternalDestination): Promise<ExternalDestination> {
        logger.info({ tenantId: data.tenantId, type: data.type }, "Creating external destination");

        // Validate config based on type (basic check)
        if (data.config === null || data.config === undefined) {
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
        const destinations = await this.database
            .select()
            .from(externalDestinations)
            .where(and(
                eq(externalDestinations.id, id),
                eq(externalDestinations.tenantId, tenantId)
            ));
        const destination = firstDestination(destinations);

        if (destination !== undefined) {
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
        if (updates.config !== null && updates.config !== undefined) {
            encryptedUpdates.config = encryptConfig(updates.config);
        }

        const updatedRows = await this.database
            .update(externalDestinations)
            .set({ ...encryptedUpdates, updatedAt: new Date() })
            .where(and(
                eq(externalDestinations.id, id),
                eq(externalDestinations.tenantId, tenantId)
            ))
            .returning();
        const updated = firstDestination(updatedRows);

        if (updated !== undefined) {
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
