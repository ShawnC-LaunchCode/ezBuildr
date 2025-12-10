
export const PLAN_TIERS = {
    FREE: 'free',
    PRO: 'pro',
    TEAM: 'team',
    ENTERPRISE: 'enterprise'
};

export const DEFAULT_PLANS = [
    {
        name: 'Free',
        type: PLAN_TIERS.FREE,
        priceMonthly: 0,
        priceYearly: 0,
        features: {
            scripting: false,
            advanced_blocks: false,
            versioning: false,
            marketplace: false
        },
        limits: {
            workflows: 2,
            runs: 50,
            documents: 20,
            seats: 1,
            storage_mb: 100
        }
    },
    {
        name: 'Pro',
        type: PLAN_TIERS.PRO,
        priceMonthly: 2900, // $29.00
        priceYearly: 29000,
        features: {
            scripting: true,
            advanced_blocks: true,
            versioning: true,
            marketplace: true,
            hot_reload: true
        },
        limits: {
            workflows: 10,
            runs: 1000,
            documents: 200,
            seats: 3,
            storage_mb: 1000
        }
    },
    {
        name: 'Team',
        type: PLAN_TIERS.TEAM,
        priceMonthly: 9900, // $99.00 base
        priceYearly: 99000,
        features: {
            scripting: true,
            advanced_blocks: true,
            versioning: true,
            marketplace: true,
            hot_reload: true,
            team_templates: true,
            custom_branding: true
        },
        limits: {
            workflows: -1, // Unlimited
            runs: 10000,
            documents: 2000,
            seats: -1, // Unlimited (billed per seat)
            storage_mb: 10000
        }
    },
    {
        name: 'Enterprise',
        type: PLAN_TIERS.ENTERPRISE,
        priceMonthly: 0, // Custom
        priceYearly: 0,
        features: {
            scripting: true,
            advanced_blocks: true,
            versioning: true,
            marketplace: true,
            hot_reload: true,
            team_templates: true,
            custom_branding: true,
            sso: true,
            audit_log_retention_extended: true,
            sla: true
        },
        limits: {
            workflows: -1,
            runs: -1,
            documents: -1,
            seats: -1,
            storage_mb: -1
        }
    }
];

export const METRIC_LIMITS = {
    workflow_run: 'runs',
    document_generated: 'documents',
    storage_bytes: 'storage_mb' // needs conversion logic
};
