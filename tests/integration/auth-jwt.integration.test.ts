import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import { createServer, type Server } from "http";
import { registerRoutes } from "../../server/routes";
import { nanoid } from "nanoid";

// Mock repositories with in-memory storage
const mockUsers = new Map<string, any>();
const mockCredentials = new Map<string, any>();

vi.mock('../../server/repositories', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/repositories')>();
  return {
    ...actual,
    userRepository: {
      findByEmail: vi.fn(async (email) => {
        return Array.from(mockUsers.values()).find(u => u.email === email) || null;
      }),
      create: vi.fn(async (user) => {
        mockUsers.set(user.id, user);
        return user;
      }),
      findById: vi.fn(async (id) => {
        return mockUsers.get(id) || null;
      }),
      upsert: vi.fn(async (user) => {
        mockUsers.set(user.id, user);
        return true;
      }),
      updateUser: vi.fn(async (userId, data) => {
        const user = mockUsers.get(userId);
        if (user) {
          const updatedUser = { ...user, ...data };
          mockUsers.set(userId, updatedUser);
          return updatedUser;
        }
        throw new Error('User not found');
      }),
    },
    userCredentialsRepository: {
      createCredentials: vi.fn(async (userId, passwordHash) => {
        mockCredentials.set(userId, { userId, passwordHash });
        return { userId, passwordHash };
      }),
      findByUserId: vi.fn(async (userId) => {
        return mockCredentials.get(userId) || null;
      }),
    },
  };
});

/**
 * JWT Authentication Integration Tests
 * Tests JWT-based email/password authentication and RBAC
 */
describe("JWT Authentication Integration Tests", () => {
  let app: Express;
  let server: Server;
  let baseURL: string;

  beforeAll(async () => {
    // Create Express app
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));

    // Register all routes including auth
    server = await registerRoutes(app);

    // Find available port
    const port = await new Promise<number>((resolve) => {
      const testServer = server.listen(0, () => {
        const addr = testServer.address();
        const port = typeof addr === 'object' && addr ? addr.port : 5002;
        resolve(port);
      });
    });

    baseURL = `http://localhost:${port}`;
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  });

  describe("POST /api/auth/register", () => {
    it("should register a new user with email and password", async () => {
      const email = `test-${nanoid()}@example.com`;
      const password = "TestPassword123";

      const response = await request(baseURL)
        .post("/api/auth/register")
        .send({
          email,
          password,
          firstName: "Test",
          lastName: "User",
        })
        .expect("Content-Type", /json/)
        .expect(201);

      expect(response.body).toHaveProperty("message", "Registration successful");
      expect(response.body).toHaveProperty("token");
      expect(response.body).toHaveProperty("user");
      expect(response.body.user).toHaveProperty("email", email);
      expect(response.body.user).toHaveProperty("firstName", "Test");
      expect(response.body.user).toHaveProperty("lastName", "User");

      // Token should be a non-empty string
      expect(typeof response.body.token).toBe("string");
      expect(response.body.token.length).toBeGreaterThan(0);
    });

    it("should reject registration with weak password", async () => {
      const email = `test-${nanoid()}@example.com`;
      const password = "weak"; // Too short, no uppercase, no numbers

      const response = await request(baseURL)
        .post("/api/auth/register")
        .send({ email, password })
        .expect("Content-Type", /json/)
        .expect(400);

      expect(response.body).toHaveProperty("error", "weak_password");
      expect(response.body).toHaveProperty("message");
    });

    it("should reject registration with invalid email", async () => {
      const response = await request(baseURL)
        .post("/api/auth/register")
        .send({
          email: "not-an-email",
          password: "TestPassword123",
        })
        .expect("Content-Type", /json/)
        .expect(400);

      expect(response.body).toHaveProperty("error", "invalid_email");
    });

    it("should reject registration with missing fields", async () => {
      const response = await request(baseURL)
        .post("/api/auth/register")
        .send({ email: `test-${nanoid()}@example.com` })
        .expect("Content-Type", /json/)
        .expect(400);

      expect(response.body).toHaveProperty("error", "missing_fields");
    });

    it("should reject duplicate email registration", async () => {
      const email = `test-${nanoid()}@example.com`;
      const password = "TestPassword123";

      // First registration
      await request(baseURL)
        .post("/api/auth/register")
        .send({ email, password, firstName: "Test", lastName: "User" })
        .expect(201);

      // Second registration with same email
      const response = await request(baseURL)
        .post("/api/auth/register")
        .send({ email, password, firstName: "Test2", lastName: "User2" })
        .expect("Content-Type", /json/)
        .expect(409);

      expect(response.body).toHaveProperty("error", "user_exists");
    });
  });

  describe("POST /api/auth/login", () => {
    const testEmail = `test-login-${nanoid()}@example.com`;
    const testPassword = "TestPassword123";

    beforeAll(async () => {
      // Register a test user
      await request(baseURL)
        .post("/api/auth/register")
        .send({
          email: testEmail,
          password: testPassword,
          firstName: "Login",
          lastName: "Test",
        })
        .expect(201);
    });

    it("should login with valid credentials", async () => {
      const response = await request(baseURL)
        .post("/api/auth/login")
        .send({ email: testEmail, password: testPassword })
        .expect("Content-Type", /json/)
        .expect(200);

      expect(response.body).toHaveProperty("message", "Login successful");
      expect(response.body).toHaveProperty("token");
      expect(response.body).toHaveProperty("user");
      expect(response.body.user).toHaveProperty("email", testEmail);

      // Token should be a non-empty string
      expect(typeof response.body.token).toBe("string");
      expect(response.body.token.length).toBeGreaterThan(0);
    });

    it("should reject login with wrong password", async () => {
      const response = await request(baseURL)
        .post("/api/auth/login")
        .send({ email: testEmail, password: "WrongPassword123" })
        .expect("Content-Type", /json/)
        .expect(401);

      expect(response.body).toHaveProperty("error", "invalid_credentials");
    });

    it("should reject login with non-existent email", async () => {
      const response = await request(baseURL)
        .post("/api/auth/login")
        .send({ email: `nonexistent-${nanoid()}@example.com`, password: testPassword })
        .expect("Content-Type", /json/)
        .expect(401);

      expect(response.body).toHaveProperty("error", "invalid_credentials");
    });

    it("should reject login with missing fields", async () => {
      const response = await request(baseURL)
        .post("/api/auth/login")
        .send({ email: testEmail })
        .expect("Content-Type", /json/)
        .expect(400);

      expect(response.body).toHaveProperty("error", "missing_fields");
    });
  });

  describe("GET /api/auth/me", () => {
    let authToken: string;
    const testEmail = `test-me-${nanoid()}@example.com`;

    beforeAll(async () => {
      // Register and login to get token
      const registerResponse = await request(baseURL)
        .post("/api/auth/register")
        .send({
          email: testEmail,
          password: "TestPassword123",
          firstName: "Me",
          lastName: "Test",
        })
        .expect(201);

      authToken = registerResponse.body.token;
    });

    it("should return current user with valid token", async () => {
      const response = await request(baseURL)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${authToken}`)
        .expect("Content-Type", /json/)
        .expect(200);

      expect(response.body).toHaveProperty("email", testEmail);
      expect(response.body).toHaveProperty("firstName", "Me");
      expect(response.body).toHaveProperty("lastName", "Test");
      expect(response.body).toHaveProperty("authProvider", "local");
    });

    it("should reject request without token", async () => {
      const response = await request(baseURL)
        .get("/api/auth/me")
        .expect("Content-Type", /json/)
        .expect(401);

      expect(response.body).toHaveProperty("error", "unauthorized");
    });

    it("should reject request with invalid token", async () => {
      const response = await request(baseURL)
        .get("/api/auth/me")
        .set("Authorization", "Bearer invalid-token")
        .expect("Content-Type", /json/)
        .expect(401);

      expect(response.body).toHaveProperty("error", "unauthorized");
    });
  });

  describe("POST /api/auth/logout", () => {
    it("should logout successfully", async () => {
      const response = await request(baseURL)
        .post("/api/auth/logout")
        .expect("Content-Type", /json/)
        .expect(200);

      expect(response.body).toHaveProperty("message", "Logout successful");
    });
  });

  describe("RBAC and Tenant Tests", () => {
    let ownerToken: string;
    let builderToken: string;
    let viewerToken: string;
    let tenantId: string;

    beforeAll(async () => {
      // Create a tenant first
      const ownerEmail = `owner-${nanoid()}@example.com`;
      const ownerRegisterResponse = await request(baseURL)
        .post("/api/auth/register")
        .send({
          email: ownerEmail,
          password: "OwnerPassword123",
          firstName: "Owner",
          lastName: "User",
          tenantRole: "owner",
        })
        .expect(201);

      ownerToken = ownerRegisterResponse.body.token;

      // Create tenant
      const tenantResponse = await request(baseURL)
        .post("/api/tenants")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          name: "Test Tenant",
          plan: "pro",
        })
        .expect(201);

      tenantId = tenantResponse.body.tenant.id;

      // Register builder and viewer users
      const builderEmail = `builder-${nanoid()}@example.com`;
      const builderRegisterResponse = await request(baseURL)
        .post("/api/auth/register")
        .send({
          email: builderEmail,
          password: "BuilderPassword123",
          firstName: "Builder",
          lastName: "User",
          tenantId,
          tenantRole: "builder",
        })
        .expect(201);

      builderToken = builderRegisterResponse.body.token;

      const viewerEmail = `viewer-${nanoid()}@example.com`;
      const viewerRegisterResponse = await request(baseURL)
        .post("/api/auth/register")
        .send({
          email: viewerEmail,
          password: "ViewerPassword123",
          firstName: "Viewer",
          lastName: "User",
          tenantId,
          tenantRole: "viewer",
        })
        .expect(201);

      viewerToken = viewerRegisterResponse.body.token;
    });

    it("should allow owner to access tenant information", async () => {
      const response = await request(baseURL)
        .get("/api/tenants/current")
        .set("Authorization", `Bearer ${ownerToken}`)
        .expect("Content-Type", /json/)
        .expect(200);

      expect(response.body).toHaveProperty("name", "Test Tenant");
      expect(response.body).toHaveProperty("plan", "pro");
    });

    it("should allow builder to access tenant information", async () => {
      const response = await request(baseURL)
        .get("/api/tenants/current")
        .set("Authorization", `Bearer ${builderToken}`)
        .expect("Content-Type", /json/)
        .expect(200);

      expect(response.body).toHaveProperty("name", "Test Tenant");
    });

    it("should allow viewer to access tenant information", async () => {
      const response = await request(baseURL)
        .get("/api/tenants/current")
        .set("Authorization", `Bearer ${viewerToken}`)
        .expect("Content-Type", /json/)
        .expect(200);

      expect(response.body).toHaveProperty("name", "Test Tenant");
    });

    it("should only allow owner to update tenant", async () => {
      // Builder should be denied
      await request(baseURL)
        .put(`/api/tenants/${tenantId}`)
        .set("Authorization", `Bearer ${builderToken}`)
        .send({ name: "Updated Name" })
        .expect(403);

      // Viewer should be denied
      await request(baseURL)
        .put(`/api/tenants/${tenantId}`)
        .set("Authorization", `Bearer ${viewerToken}`)
        .send({ name: "Updated Name" })
        .expect(403);

      // Owner should succeed
      const response = await request(baseURL)
        .put(`/api/tenants/${tenantId}`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ name: "Updated Tenant Name" })
        .expect(200);

      expect(response.body.tenant).toHaveProperty("name", "Updated Tenant Name");
    });
  });
});
