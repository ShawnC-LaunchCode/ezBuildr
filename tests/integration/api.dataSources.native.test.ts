import { nanoid } from "nanoid";
import request from "supertest";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

import * as schema from "@shared/schema";

import { db } from "../../server/db";
import { setupIntegrationTest, type IntegrationTestContext } from "../helpers/integrationTestHelper";
describe.sequential("Data Sources API - Native Catalog", () => {
    let ctx: IntegrationTestContext;
    beforeAll(async () => {
        ctx = await setupIntegrationTest({
            tenantName: "Test Tenant for Native Catalog",
            createProject: true,
            projectName: "Test Project",
            userRole: "creator",
            tenantRole: "owner",
        });
    });
    afterAll(async () => {
        await ctx.cleanup();
    });
    it("should list databases and databases' tables in the catalog", async () => {
        // 1. Create a Native Database
        const dbName = `TestDB-${nanoid()}`;
        const dbResponse = await db.insert(schema.datavaultDatabases).values({
            name: dbName,
            tenantId: ctx.tenantId,
        }).returning();
        const databaseId = dbResponse[0].id;
        // 2. Create a Table inside that Database
        const tableName = `TableInDB-${nanoid()}`;
        await db.insert(schema.datavaultTables).values({
            name: tableName,
            slug: tableName.toLowerCase(),
            tenantId: ctx.tenantId,
            ownerUserId: ctx.userId,
            databaseId: databaseId,
        });
        // 3. Create an Orphan Table (no database)
        const orphanTableName = `OrphanTable-${nanoid()}`;
        await db.insert(schema.datavaultTables).values({
            name: orphanTableName,
            slug: orphanTableName.toLowerCase(),
            tenantId: ctx.tenantId,
            ownerUserId: ctx.userId,
            databaseId: null,
        });
        // 4. Call the Catalog Endpoint
        const response = await request(ctx.baseURL)
            .get("/api/data-sources/native/catalog")
            .set("Authorization", `Bearer ${ctx.authToken}`)
            .expect(200);
        const catalog = response.body;
        // 5. Assertions
        expect(catalog).toHaveProperty("databases");
        expect(catalog).toHaveProperty("orphanTables");
        // Check Database
        const foundDB = catalog.databases.find((d: any) => d.id === databaseId);
        expect(foundDB).toBeDefined();
        expect(foundDB.name).toBe(dbName);
        // Check Table inside Database
        const foundTableInDB = foundDB.tables.find((t: any) => t.name === tableName);
        expect(foundTableInDB).toBeDefined();
        // Check Orphan Table
        const foundOrphan = catalog.orphanTables.find((t: any) => t.name === orphanTableName);
        expect(foundOrphan).toBeDefined();
    });
    it("should create a native_table data source", async () => {
        // 1. Create a table
        const tableName = `SourceTable-${nanoid()}`;
        const tableRes = await db.insert(schema.datavaultTables).values({
            name: tableName,
            slug: tableName.toLowerCase(),
            tenantId: ctx.tenantId,
            ownerUserId: ctx.userId,
        }).returning();
        const tableId = tableRes[0].id;
        // 2. Create Data Source via API
        const response = await request(ctx.baseURL)
            .post("/api/data-sources")
            .set("Authorization", `Bearer ${ctx.authToken}`)
            .send({
                name: `Source-${tableName}`,
                type: "native_table",
                config: { tableId },
            })
            .expect(201);
        expect(response.body).toHaveProperty("id");
        expect(response.body.type).toBe("native");
        expect(response.body.config).toHaveProperty("tableId", tableId);
        expect(response.body.config).toHaveProperty("isNativeTable", true);
    });
});