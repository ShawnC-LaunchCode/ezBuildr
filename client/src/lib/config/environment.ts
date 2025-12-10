import { z } from "zod";

/**
 * Environment Configuration Schema
 * Centralizes all environment variable access and validation.
 */

const envSchema = z.object({
    // Base
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.string().transform(Number).default("5000"),

    // App
    VITE_API_URL: z.string().optional(), // Used by client
    APP_URL: z.string().optional(), // Used by server

    // Database
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

    // Security
    SESSION_SECRET: z.string().default("dev_secret_do_not_use_in_prod"),
    VITE_GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),

    // Feature Flags (Optional overrides, otherwise defaults apply)
    // These map to the flags in featureFlags/definitions.ts
    VITE_ENABLE_BLOCKS_V2: z.string().transform(v => v === 'true').optional(),
    VITE_ENABLE_SCRIPTING_V1: z.string().transform(v => v === 'true').optional(),
    VITE_ENABLE_VALIDATION_V2: z.string().transform(v => v === 'true').optional(),
    VITE_ENABLE_VERSIONING: z.string().transform(v => v === 'true').optional(),
    VITE_ENABLE_ANALYTICS_V1: z.string().transform(v => v === 'true').optional(),
    VITE_ENABLE_COLLAB_V1: z.string().transform(v => v === 'true').optional(),
    VITE_ENABLE_PREVIEW_HOT_RELOAD: z.string().transform(v => v === 'true').optional(),
    VITE_ENABLE_AUTO_TEST_RUNNER: z.string().transform(v => v === 'true').optional(),

    // Integrations
    SLACK_BOT_TOKEN: z.string().optional(),
    SLACK_SIGNING_SECRET: z.string().optional(),
    SENDGRID_API_KEY: z.string().optional(),
    OPENAI_API_KEY: z.string().optional(),
    ANTHROPIC_API_KEY: z.string().optional(),

    // Observability
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

// Process the environment
// Note: In Vite, import.meta.env has client-side vars, process.env has server-side.
// This file is designed to be shared, but strict validation might need to differ slightly between client/server
// or be careful about what is accessed where.
// For now, we'll try to use a unified approach, prioritizing process.env for Node and import.meta.env for Vite if available.

const getRawEnv = () => {
    if (typeof process !== 'undefined' && process.env) {
        return process.env;
    }
    // @ts-ignore - Vite specific
    if (import.meta && import.meta.env) {
        // @ts-ignore
        return import.meta.env;
    }
    return {};
};

const rawEnv = getRawEnv();

// Parse and validate
// We use safeParse to avoid crashing the app immediately if loaded in a context 
// where not all vars are needed (like simple unit tests), but we log errors.
const parsed = envSchema.safeParse(rawEnv);

if (!parsed.success) {
    console.warn("⚠️  Environment validation failed:", parsed.error.format());
}

export const env = parsed.success ? parsed.data : (rawEnv as any);

// Helper to check if we are in production
export const isProduction = env.NODE_ENV === "production";
export const isDevelopment = env.NODE_ENV === "development";
export const isTest = env.NODE_ENV === "test";
