import confetti from "canvas-confetti";

import { useUserPreferences } from "./useUserPreferences";

export type ConfettiPreset = "success" | "ai" | "party" | "gentle";

interface PresetConfig {
  colors: string[];
  spread: number;
  scalar: number;
}

const PRESETS: Record<ConfettiPreset, PresetConfig> = {
  success: {
    colors: ["#34d399", "#10b981", "#6ee7b7"],
    spread: 70,
    scalar: 1.0
  },
  ai: {
    colors: ["#818cf8", "#c084fc", "#f9a8d4"],
    spread: 80,
    scalar: 1.1
  },
  party: {
    colors: ["#facc15", "#f472b6", "#60a5fa", "#4ade80"],
    spread: 100,
    scalar: 1.2
  },
  gentle: {
    colors: ["#a5f3fc", "#d9f99d", "#fde68a"],
    spread: 60,
    scalar: 0.8
  },
};

// Detect mobile devices for performance optimization
const isMobile = () => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  ) || window.innerWidth < 768;
};

/**
 * Universal confetti hook for celebration moments across the app.
 * Automatically respects user preferences for celebration effects.
 *
 * @example
 * const { fire, cascade } = useConfetti();
 *
 * // Single burst
 * fire("success");
 *
 * // Continuous cascade (1 second)
 * cascade("party");
 */
export function useConfetti() {
  const { prefs } = useUserPreferences();
  const celebrationEffectsEnabled = prefs?.celebrationEffects ?? true;

  // Disable in test environments
  if (import.meta.env.MODE === "test") {
    return {
      fire: () => {},
      cascade: () => {}
    };
  }

  // Disable if user has turned off celebration effects
  if (!celebrationEffectsEnabled) {
    return {
      fire: () => {},
      cascade: () => {}
    };
  }

  /**
   * Fire a single confetti burst with the specified preset.
   *
   * @param preset - The confetti style preset to use
   * @param opts - Additional canvas-confetti options to override defaults
   */
  function fire(preset: ConfettiPreset = "success", opts = {}) {
    const config = PRESETS[preset] || PRESETS.success;
    const mobile = isMobile();

    confetti({
      particleCount: mobile ? 60 : 120, // Reduce particles on mobile
      origin: { y: 0.6 },
      ticks: 200,
      gravity: 0.8,
      ...config,
      ...opts,
    });
  }

  /**
   * Fire a continuous cascade of confetti from both sides of the screen.
   * Runs for 1 second with confetti shooting from left and right edges.
   *
   * @param preset - The confetti style preset to use
   */
  function cascade(preset: ConfettiPreset = "party") {
    const config = PRESETS[preset];
    const mobile = isMobile();
    const particleCount = mobile ? 3 : 5;
    const duration = 1000; // 1 second
    const end = Date.now() + duration;

    const frame = () => {
      // Left side
      confetti({
        ...config,
        particleCount,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
      });

      // Right side
      confetti({
        ...config,
        particleCount,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    };

    frame();
  }

  return { fire, cascade };
}
