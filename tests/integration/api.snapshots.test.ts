import {  type Server } from "http";

import { eq } from "drizzle-orm";
import express, { type Express } from "express";
import request from "supertest";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

import * as schema from "@shared/schema";

import { db } from "../../server/db";
import { setupAuth } from "../../server/googleAuth";
import { registerRoutes } from "../../server/routes";
import { createGraphWorkflow, createGraphRun, createQuestionNode, createGraph } from "../factories/graphFactory";
describe("Stage 13: Workflow Snapshots & Versioning", () => {
    let app: Express;
    let server: Server;
    let baseURL: string;
    let tenantId: string;
    let userId: string;
    let projectId: string;
    let workflowId: string;
    let agent: any;
    // Hoisted state for auth
    const { authState } = vi.hoisted(() => ({ authState: { user: null as any } }));
    vi.mock("../../server/googleAuth", async (importOriginal) => {
        const actual = await importOriginal<any>();
        return {
            ...actual,
            setupAuth: (app: Express) => {
                // Restore user from state
                app.use((req, res, next) => {
                    const r = req as any;
                    if (authState.user) {
                        r.user = authState.user;
                        r.isAuthenticated = () => true;
                    } else {
                        r.isAuthenticated = () => false;
                    }
                    next();
                });
                app.post("/api/auth/google", (req, res) => {
                    // Backdoor login
                    if (req.body.user) {
                        authState.user = req.body.user;
                        return res.json({ message: "Logged in via backdoor", user: req.body.user });
                    }
                    res.status(400).json({ error: "No user provided" });
                });
            },
        };
    });
    // Mock auth middleware to respect req.user set by setupAuth
    vi.mock("../../server/middleware/auth", async (importOriginal) => {
        const actual = await importOriginal<any>();
        return {
            ...actual,
            hybridAuth: (req: any, res: any, next: any) => {
                if (req.user) {
                    req.tenantId = req.user.tenantId;
                    req.userId = req.user.id;
                    req.userRole = req.user.tenantRole;
                    req.systemRole = req.user.role;
                    return next();
                }
                return actual.hybridAuth(req, res, next);
            },
            optionalHybridAuth: (req: any, res: any, next: any) => {
                if (req.user) {return next();}
                return actual.optionalHybridAuth(req, res, next);
            }
        };
    });
    beforeAll(async () => {
        app = express();
        app.use(express.json());
        app.use(express.urlencoded({ extended: false }));
        setupAuth(app); // Call setupAuth to attach the middleware
        server = await registerRoutes(app);
        const port = await new Promise<number>((resolve) => {
            const testServer = server.listen(0, () => {
                const addr = testServer.address();
                const port = typeof addr === 'object' && addr ? addr.port : 5014;
                resolve(port);
            });
        });
        baseURL = `http://localhost:${port}`;
        agent = request.agent(baseURL);
        // Setup tenant
        const [tenant] = await db.insert(schema.tenants).values({
            name: "Test Tenant for Snapshots",
            plan: "pro",
        }).returning();
        tenantId = tenant.id;
        // Setup user with matching ID from mock
        userId = "test-user-id";
        const email = "test-snapshots@example.com";
        // Create user
        await db.insert(schema.users).values({
            id: userId,
            email: email,
            fullName: "Test User",
            tenantId: tenantId,
            tenantRole: "owner",
            createdAt: new Date(),
            updatedAt: new Date(),
        }).onConflictDoUpdate({
            target: schema.users.id,
            set: {
                tenantId: tenantId,
                tenantRole: "owner",
                email: email,
            }
        });
        // Login to establish session via backdoor
        await agent.post("/api/auth/google").send({
            user: {
                claims: {
                    sub: userId,
                    email: email,
                },
                id: userId,
                email,
                tenantId,
                tenantRole: "owner",
                role: "admin",
            }
        });
        // Create project
        const [project] = await db.insert(schema.projects).values({
            title: "Test Project for Snapshots",
            name: "Test Project for Snapshots",
            tenantId,
            creatorId: userId,
            ownerId: userId,
        }).returning();
        projectId = project.id;
    });
    afterAll(async () => {
        if (tenantId) {
            // Cleanup workflows to cascade delete runs and versions
            await db.delete(schema.workflows).where(eq(schema.workflows.creatorId, userId));
            await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
        }
        if (server) {
            await new Promise<void>((resolve) => {
                server.close(() => resolve());
            });
        }
    });
    it("should maintain immutability of runs across versions", async () => {
        // 1. Create Draft Workflow with Version 1 Graph
        const nodeV1 = createQuestionNode('q1', 'Version 1 Question');
        const graphV1 = createGraph([nodeV1]);
        const { workflow: wfData, version: vData } = createGraphWorkflow({
            projectId,
            creatorId: userId,
            ownerId: userId,
            name: "Versioning Test Workflow",
            status: "draft",
        }, graphV1);
        const [workflow] = await db.insert(schema.workflows).values(wfData).returning();
        workflowId = workflow.id;
        // 2. Publish Version 1
        const [version1] = await db.insert(schema.workflowVersions).values({
            ...vData,
            workflowId,
            name: "v1.0",
            published: true,
            publishedAt: new Date(),
            publishedBy: userId,
            versionNumber: 1,
            createdBy: userId,
        } as any).returning();
        // 3. Create Run on Version 1
        const run1Data = createGraphRun(version1.id, { createdBy: userId });
        const [run1] = await db.insert(schema.runs).values(run1Data).returning();
        // 4. Create Draft for Version 2 (Modify Graph)
        const nodeV2 = createQuestionNode('q1', 'Version 2 Question (Updated)');
        const graphV2 = createGraph([nodeV2]);
        // 5. Publish Version 2
        const [version2] = await db.insert(schema.workflowVersions).values({
            workflowId,
            graphJson: graphV2,
            name: "v2.0",
            published: true,
            publishedAt: new Date(),
            publishedBy: userId,
            versionNumber: 2,
            createdBy: userId,
        } as any).returning();
        // 6. Create Run on Version 2
        const run2Data = createGraphRun(version2.id, { createdBy: userId });
        const [run2] = await db.insert(schema.runs).values(run2Data).returning();
        // 7. Verify Run 1 still sees Version 1 Question
        const run1Response = await agent.get(`/api/runs/${run1.id}`);
        if (run1Response.status !== 200) {
            console.error("Run Fetch Failed Body:", JSON.stringify(run1Response.body, null, 2));
            console.error("Run Fetch Failed Text:", run1Response.text);
        }
        expect(run1Response.status).toBe(200);
        const run1Graph = run1Response.body.workflowVersion.graphJson;
        expect(run1Graph.nodes[0].config.question).toBe('Version 1 Question');
        // 8. Verify Run 2 sees Version 2 Question
        const run2Response = await agent.get(`/api/runs/${run2.id}`);
        expect(run2Response.status).toBe(200);
        const run2Graph = run2Response.body.workflowVersion.graphJson;
        expect(run2Graph.nodes[0].config.question).toBe('Version 2 Question (Updated)');
    });
});