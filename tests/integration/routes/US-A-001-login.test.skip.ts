import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import app from "../../../server/index";
import { createTestUser } from "../../factories/userFactory";

/**
 * US-A-001: User Login with Google OAuth
 *
 * As a user,
 * I want to log in using my Google account,
 * So that I can access the Vault-Logic platform securely.
 */
describe("US-A-001: User Login", () => {
  beforeAll(() => {
    // Mock Google OAuth verification
    vi.mock("../../../server/googleAuth", () => ({
      OAuth2Client: vi.fn().mockImplementation(() => ({
        verifyIdToken: vi.fn().mockResolvedValue({
          getPayload: () => ({
            email: "testuser@example.com",
            given_name: "Test",
            family_name: "User",
            picture: "https://example.com/avatar.jpg",
          }),
        }),
      })),
    }));
  });

  afterAll(() => {
    vi.clearAllMocks();
  });

  it("should successfully log in with valid Google ID token", async () => {
    const mockIdToken = "valid.google.id.token";

    const response = await request(app)
      .post("/api/login")
      .send({ idToken: mockIdToken })
      .expect(200);

    expect(response.body).toHaveProperty("id");
    expect(response.body).toHaveProperty("email", "testuser@example.com");
    expect(response.body).toHaveProperty("firstName", "Test");
    expect(response.body).toHaveProperty("lastName", "User");
    expect(response.body).toHaveProperty("role");
    expect(response.headers["set-cookie"]).toBeDefined(); // Session cookie
  });

  it("should reject login with invalid ID token", async () => {
    const response = await request(app)
      .post("/api/login")
      .send({ idToken: "invalid.token" })
      .expect(401);

    expect(response.body).toHaveProperty("error");
  });

  it("should reject login with missing ID token", async () => {
    const response = await request(app)
      .post("/api/login")
      .send({})
      .expect(400);

    expect(response.body).toHaveProperty("error");
  });

  it("should create new user on first login", async () => {
    const mockIdToken = "new.user.token";

    const response = await request(app)
      .post("/api/login")
      .send({ idToken: mockIdToken })
      .expect(200);

    expect(response.body).toHaveProperty("id");
    expect(response.body.role).toBe("creator"); // Default role
  });

  it("should retrieve existing user on subsequent logins", async () => {
    const mockIdToken = "existing.user.token";

    // First login
    const firstLogin = await request(app)
      .post("/api/login")
      .send({ idToken: mockIdToken })
      .expect(200);

    // Second login
    const secondLogin = await request(app)
      .post("/api/login")
      .send({ idToken: mockIdToken })
      .expect(200);

    expect(firstLogin.body.id).toBe(secondLogin.body.id);
    expect(firstLogin.body.email).toBe(secondLogin.body.email);
  });
});

describe("US-A-002: Get Current User", () => {
  it("should return current user if authenticated", async () => {
    // Simulate authenticated session
    const agent = request.agent(app);
    await agent.post("/api/login").send({ idToken: "valid.token" });

    const response = await agent.get("/api/user").expect(200);

    expect(response.body).toHaveProperty("id");
    expect(response.body).toHaveProperty("email");
  });

  it("should return 401 if not authenticated", async () => {
    const response = await request(app).get("/api/user").expect(401);

    expect(response.body).toHaveProperty("error", "Not authenticated");
  });
});

describe("US-A-003: User Logout", () => {
  it("should successfully log out authenticated user", async () => {
    // Login first
    const agent = request.agent(app);
    await agent.post("/api/login").send({ idToken: "valid.token" });

    // Logout
    const response = await agent.post("/api/logout").expect(200);

    expect(response.body).toHaveProperty("message", "Logged out successfully");

    // Verify session is destroyed
    await agent.get("/api/user").expect(401);
  });

  it("should handle logout when not logged in", async () => {
    const response = await request(app).post("/api/logout").expect(200);

    expect(response.body).toHaveProperty("message", "Logged out successfully");
  });
});
