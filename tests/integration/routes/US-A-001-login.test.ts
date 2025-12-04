import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import { __setGoogleClient } from "../../../server/googleAuth";
import { registerRoutes } from "../../../server/routes";

/**
 * US-A-001: User Login with Google OAuth
 *
 * As a user,
 * I want to log in using my Google account,
 * So that I can access the Vault-Logic platform securely.
 */
describe("Authentication Integration Tests", () => {
  let app: Express;

  beforeAll(async () => {
    // Mock Google OAuth verification
    const mockOAuth2Client = {
      verifyIdToken: vi.fn().mockResolvedValue({
        getPayload: () => ({
          email: "testuser@example.com",
          given_name: "Test",
          family_name: "User",
          picture: "https://example.com/avatar.jpg",
          email_verified: true,
          sub: "google-user-id",
        }),
      }),
    } as any;
    __setGoogleClient(mockOAuth2Client);

    // Setup app
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    await registerRoutes(app);
  });

  afterAll(() => {
    __setGoogleClient(null);
    vi.clearAllMocks();
  });

  describe("US-A-001: User Login", () => {
    it("should successfully log in with valid Google ID token", async () => {
      const mockIdToken = "valid.google.id.token";

      const response = await request(app)
        .post("/api/auth/google")
        .set("Origin", "http://localhost:5000")
        .send({ idToken: mockIdToken })
        .expect(200);

      expect(response.body).toHaveProperty("user");
      expect(response.body.user).toHaveProperty("email", "testuser@example.com");
      expect(response.headers["set-cookie"]).toBeDefined(); // Session cookie
    });

    it("should reject login with missing ID token", async () => {
      const response = await request(app)
        .post("/api/auth/google")
        .set("Origin", "http://localhost:5000")
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty("error");
    });
  });

  describe("US-A-002: Get Current User", () => {
    it("should return current user if authenticated", async () => {
      // Login first to get session cookie
      const loginResponse = await request(app)
        .post("/api/auth/google")
        .set("Origin", "http://localhost:5000")
        .send({ idToken: "valid.token" })
        .expect(200);

      const cookies = loginResponse.headers["set-cookie"];

      const response = await request(app)
        .get("/api/auth/user")
        .set("Origin", "http://localhost:5000")
        .set("Cookie", cookies)
        .expect(200);

      expect(response.body).toHaveProperty("id");
      expect(response.body).toHaveProperty("email");
    });

    it("should return 401 if not authenticated", async () => {
      const response = await request(app)
        .get("/api/auth/user")
        .set("Origin", "http://localhost:5000")
        .expect(401);

      expect(response.body).toHaveProperty("message", "Authentication required");
    });
  });

  describe("US-A-003: User Logout", () => {
    it("should successfully log out authenticated user", async () => {
      // Login first
      const loginResponse = await request(app)
        .post("/api/auth/google")
        .set("Origin", "http://localhost:5000")
        .send({ idToken: "valid.token" })
        .expect(200);

      const cookies = loginResponse.headers["set-cookie"];

      // Logout
      const response = await request(app)
        .post("/api/auth/logout")
        .set("Origin", "http://localhost:5000")
        .set("Cookie", cookies)
        .expect(200);

      expect(response.body).toHaveProperty("message", "Logout successful");

      // Verify session is destroyed
      await request(app)
        .get("/api/auth/user")
        .set("Origin", "http://localhost:5000")
        .set("Cookie", cookies)
        .expect(401);
    });

    it("should handle logout when not logged in", async () => {
      const response = await request(app)
        .post("/api/auth/logout")
        .set("Origin", "http://localhost:5000")
        .expect(200);

      expect(response.body).toHaveProperty("message", "Logout successful");
    });
  });
});
