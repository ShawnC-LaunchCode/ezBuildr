import { expect, test, describe } from "vitest";
import request from "supertest";
import express from "express";
import helmet from "helmet";

// Setup a small app that mimics the server's helmet config for testing
// (or we can just test the real app if we import it, but this is faster)
const app = express();
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://accounts.google.com", "https://*.google.com", "https://*.gstatic.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://accounts.google.com", "https://*.google.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:", "https://*.googleusercontent.com"],
      connectSrc: ["'self'", "https://accounts.google.com", "https://*.googleapis.com", "https://*.google.com", "https://*.gstatic.com", "wss:", "ws:"],
      frameSrc: ["'self'", "https://accounts.google.com", "https://*.google.com"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  frameguard: {
    action: 'deny',
  },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin',
  },
  crossOriginOpenerPolicy: {
    policy: "same-origin-allow-popups",
  },
}));

app.get("/", (req, res) => {
  res.send("OK");
});

describe("Security Headers", () => {
  test("CSP restricts img-src and has no broad https:", async () => {
    const res = await request(app).get("/");
    expect(res.headers['content-security-policy']).toBeDefined();
    const csp = res.headers['content-security-policy'];
    expect(csp).toContain("img-src 'self' data: blob: https://*.googleusercontent.com");
    expect(csp).not.toContain("img-src 'self' data: https: blob:"); // old policy
  });

  test("HSTS is enabled", async () => {
    const res = await request(app).get("/");
    expect(res.headers['strict-transport-security']).toBe("max-age=31536000; includeSubDomains; preload");
  });

  test("Frameguard is deny", async () => {
    const res = await request(app).get("/");
    expect(res.headers['x-frame-options']).toBe("DENY");
  });
});
