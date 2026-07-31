import { env } from "../config/environment";

export enum FeatureFlag {
    // Core Systems
    BLOCKS_V2 = "blocks_v2_enabled",
    SCRIPTING_V1 = "scripting_v1_enabled",
    VALIDATION_V2 = "validation_v2_enabled",
    VERSIONING = "workflow_versioning_enabled",
    ANALYTICS_V1 = "analytics_v1_enabled",
    COLLAB_V1 = "collaboration_v1_enabled",

    // Preview
    PREVIEW_HOT_RELOAD = "preview_hot_reload_enabled",
    AUTO_TEST_RUNNER = "auto_test_runner_enabled",

    // Integrations & Blocks
    DOCGEN_V2 = "docgen_v2_enabled",
    SIGNATURE_V2 = "signature_v2_enabled",
    SIGNATURE_MOCK = "signature_mock_mode_enabled", // If true, don't send real envelopes

    // Experimental
    AI_AUTOFILL = "ai_autofill_enabled",
    EXPERIMENTAL_MODE = "experimental_mode"
}

export const DEFAULT_FLAGS: Record<FeatureFlag, boolean> = {
    [FeatureFlag.BLOCKS_V2]: true,
    [FeatureFlag.SCRIPTING_V1]: true,
    [FeatureFlag.VALIDATION_V2]: true,
    [FeatureFlag.VERSIONING]: true,
    [FeatureFlag.ANALYTICS_V1]: true,
    [FeatureFlag.COLLAB_V1]: false, // Still in dev
    [FeatureFlag.PREVIEW_HOT_RELOAD]: true,
    [FeatureFlag.AUTO_TEST_RUNNER]: true,
    [FeatureFlag.DOCGEN_V2]: true,
    [FeatureFlag.SIGNATURE_V2]: true,
    [FeatureFlag.SIGNATURE_MOCK]: env.NODE_ENV !== "production", // Default to mock in non-prod
    [FeatureFlag.AI_AUTOFILL]: false,
    [FeatureFlag.EXPERIMENTAL_MODE]: false,
};

/**
 * Resolve the initial state of flags based on environment variables.
 * Env vars override defaults.
 */
export const getInitialFeatureFlags = (): Record<FeatureFlag, boolean> => {
    return {
        [FeatureFlag.BLOCKS_V2]: env.VITE_ENABLE_BLOCKS_V2 ?? DEFAULT_FLAGS[FeatureFlag.BLOCKS_V2],
        [FeatureFlag.SCRIPTING_V1]: env.VITE_ENABLE_SCRIPTING_V1 ?? DEFAULT_FLAGS[FeatureFlag.SCRIPTING_V1],
        [FeatureFlag.VALIDATION_V2]: env.VITE_ENABLE_VALIDATION_V2 ?? DEFAULT_FLAGS[FeatureFlag.VALIDATION_V2],
        [FeatureFlag.VERSIONING]: env.VITE_ENABLE_VERSIONING ?? DEFAULT_FLAGS[FeatureFlag.VERSIONING],
        [FeatureFlag.ANALYTICS_V1]: env.VITE_ENABLE_ANALYTICS_V1 ?? DEFAULT_FLAGS[FeatureFlag.ANALYTICS_V1],
        [FeatureFlag.COLLAB_V1]: env.VITE_ENABLE_COLLAB_V1 ?? DEFAULT_FLAGS[FeatureFlag.COLLAB_V1],
        [FeatureFlag.PREVIEW_HOT_RELOAD]: env.VITE_ENABLE_PREVIEW_HOT_RELOAD ?? DEFAULT_FLAGS[FeatureFlag.PREVIEW_HOT_RELOAD],
        [FeatureFlag.AUTO_TEST_RUNNER]: env.VITE_ENABLE_AUTO_TEST_RUNNER ?? DEFAULT_FLAGS[FeatureFlag.AUTO_TEST_RUNNER],
        [FeatureFlag.DOCGEN_V2]: DEFAULT_FLAGS[FeatureFlag.DOCGEN_V2],
        [FeatureFlag.SIGNATURE_V2]: DEFAULT_FLAGS[FeatureFlag.SIGNATURE_V2],
        [FeatureFlag.SIGNATURE_MOCK]: DEFAULT_FLAGS[FeatureFlag.SIGNATURE_MOCK],
        [FeatureFlag.AI_AUTOFILL]: DEFAULT_FLAGS[FeatureFlag.AI_AUTOFILL],
        [FeatureFlag.EXPERIMENTAL_MODE]: DEFAULT_FLAGS[FeatureFlag.EXPERIMENTAL_MODE],
    };
};
