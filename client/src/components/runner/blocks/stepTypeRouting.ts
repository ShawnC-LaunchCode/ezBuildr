/**
 * Runner step-type routing.
 *
 * The classification (which types render, which are hidden/execution-only,
 * which are intentionally unsupported) lives in `shared/types/runnerStepTypes`
 * so the client routing here and the client/server validators all agree —
 * see RUN2-3. This module re-exports it for existing call sites.
 */
export type {
  RunnerStepType,
  RunnerStepTypeStatus,
} from "@shared/types/runnerStepTypes";

export {
  RUNNER_RENDERED_STEP_TYPES,
  RUNNER_HIDDEN_STEP_TYPES,
  RUNNER_INTENTIONALLY_UNSUPPORTED_STEP_TYPES,
  normalizeRunnerStepType,
  getRunnerStepTypeStatus,
  isRunnerRequirableStepType,
} from "@shared/types/runnerStepTypes";
