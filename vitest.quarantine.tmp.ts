import { defineConfig } from "vitest/config";
import path from "path";

const root = __dirname;

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    pool: "forks",
    setupFiles: [path.join(root, "tests/setup.ts")],
    testTimeout: 30000,
    hookTimeout: 120000,
    include: process.env.QFILES ? process.env.QFILES.split(",") : [],
    poolOptions: { forks: { singleFork: true } },
  },
  resolve: {
    alias: {
      "@": path.resolve(root, "./client/src"),
      "@server": path.resolve(root, "./server"),
      "@shared": path.resolve(root, "./shared"),
    },
  },
});
