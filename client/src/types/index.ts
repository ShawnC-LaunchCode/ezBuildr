/**
 * Client-Side Type Definitions
 * 
 * Re-exports API types and defines UI-specific type aliases.
 * This file resolves the "@/types" module import used throughout the client.
 */

export * from "../lib/vault-api";

import { ApiStep } from "../lib/vault-api";

// Alias ApiStep to Step for UI components
export type Step = ApiStep;
