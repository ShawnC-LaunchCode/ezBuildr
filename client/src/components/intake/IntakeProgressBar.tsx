/**
 * Stage 17: Intake Progress Bar Component
 *
 * Branded progress bar for intake portals using tenant branding CSS variables
 */

export interface IntakeProgressBarProps {
  /** Current step number (1-indexed) */
  currentStep: number;

  /** Total number of steps */
  totalSteps: number;

  /** Show percentage text */
  showPercentage?: boolean;

  /** Show step count text */
  showStepCount?: boolean;

  /** Additional CSS classes */
  className?: string;
}

/**
 * Themed intake portal progress bar
 *
 * Uses CSS variables from BrandingProvider:
 * - --brand-primary (progress bar color)
 * - --brand-surface (background)
 * - --brand-border (bar background)
 * - --brand-text-muted (text color)
 */
export default function IntakeProgressBar({
  currentStep,
  totalSteps,
  showPercentage = true,
  showStepCount = true,
  className = '',
}: IntakeProgressBarProps) {
  // Calculate percentage
  const percentage = Math.round((currentStep / totalSteps) * 100);

  return (
    <div className={`intake-progress ${className}`}>
      {/* Progress Text */}
      {(showStepCount || showPercentage) && (
        <div
          className="flex justify-between items-center mb-2 text-sm"
          style={{
            color: 'var(--brand-text-muted, #64748B)',
          }}
        >
          {showStepCount && (
            <span>
              Step {currentStep} of {totalSteps}
            </span>
          )}
          {showPercentage && <span>{percentage}%</span>}
        </div>
      )}

      {/* Progress Bar */}
      <div
        className="h-2 rounded-full overflow-hidden"
        style={{
          backgroundColor: 'var(--brand-border, #E2E8F0)',
        }}
      >
        <div
          className="h-full transition-all duration-300 ease-out"
          style={{
            width: `${percentage}%`,
            backgroundColor: 'var(--brand-primary, #3B82F6)',
          }}
        />
      </div>
    </div>
  );
}
