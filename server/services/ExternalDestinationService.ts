
import { eq, and } from "drizzle-orm";

import {
    externalDestinations,
    type ExternalDestination,
    type InsertExternalDestination
} from "@shared/schema";

import { db } from "../db";
import { logger } from "../logger";
import { encrypt, decrypt } from "../utils/encryption";
import { withCurrentTenant } from "../utils/rlsContext";
import type { DbTransaction } from "../repositories/BaseRepository";

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
     * Run `fn` inside a tenant-scoped transaction (RLS-7).
     *
     * `external_destinations` is RLS-covered and every method here reached it
     * through `this.database` — a bare `db` held in a constructor-default
     * FIELD, which is why `scripts/audit-rls-surface.ts` never saw this file
     * (it matches `db.select(`, not `this.database.select(`; the same alias
     * blind spot that hid `DataSourceService`). Unscoped under enforcement,
     * `getDestination` returned undefined and every external-send block failed
     * with "Destination not found" for a destination that exists.
     *
     * The injected `database` is honoured when a caller supplied one (tests
     * pass an explicit instance); only the default singleton gets scoped.
     */
    private async withTx<T>(fn: (tx: DbTransaction) => Promise<T>): Promise<T> {
        if (this.database !== db) {
            return fn(this.database as unknown as DbTransaction);
        }
        return withCurrentTenant(fn);
    }

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

        const [destination] = await this.withTx((tx) => tx
            .insert(externalDestinations)
            .values(encryptedData)
            .returning());

        destination.config = decryptConfig(destination.config);
        return destination;
    }

    /**
     * Get all destinations for a tenant
     */
    async getDestinations(tenantId: string): Promise<ExternalDestination[]> {
        const dests = await this.withTx((tx) => tx
            .select()
            .from(externalDestinations)
            .where(eq(externalDestinations.tenantId, tenantId)));
            
        return dests.map(d => ({ ...d, config: decryptConfig(d.config) }));
    }

    /**
     * Get a single destination by ID
     */
    async getDestination(id: string, tenantId: string): Promise<ExternalDestination | undefined> {
        const destinations = await this.withTx((tx) => tx
            .select()
            .from(externalDestinations)
            .where(and(
                eq(externalDestinations.id, id),
                eq(externalDestinations.tenantId, tenantId)
            )));
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

        const updatedRows = await this.withTx((tx) => tx
            .update(externalDestinations)
            .set({ ...encryptedUpdates, updatedAt: new Date() })
            .where(and(
                eq(externalDestinations.id, id),
                eq(externalDestinations.tenantId, tenantId)
            ))
            .returning());
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

        await this.withTx((tx) => tx
            .delete(externalDestinations)
            .where(and(
                eq(externalDestinations.id, id),
                eq(externalDestinations.tenantId, tenantId)
            )));
    }
}

export const externalDestinationService = new ExternalDestinationService();
