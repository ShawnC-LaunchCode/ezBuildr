import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./client/index.html", "./client/src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
        },
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        success: "var(--success)",
        warning: "var(--warning)",
        chart: {
          "1": "var(--chart-1)",
          "2": "var(--chart-2)",
          "3": "var(--chart-3)",
          "4": "var(--chart-4)",
          "5": "var(--chart-5)",
        },
        sidebar: {
          DEFAULT: "var(--sidebar)",
          foreground: "var(--sidebar-foreground)",
          primary: "var(--sidebar-primary)",
          "primary-foreground": "var(--sidebar-primary-foreground)",
          accent: "var(--sidebar-accent)",
          "accent-foreground": "var(--sidebar-accent-foreground)",
          border: "var(--sidebar-border)",
          ring: "var(--sidebar-ring)",
        },
        block: {
          read: {
            DEFAULT: "var(--block-read)",
            foreground: "var(--block-read-foreground)",
            border: "var(--block-read-border)",
          },
          write: {
            DEFAULT: "var(--block-write)",
            foreground: "var(--block-write-foreground)",
            border: "var(--block-write-border)",
          },
          logic: {
            DEFAULT: "var(--block-logic)",
            foreground: "var(--block-logic-foreground)",
            border: "var(--block-logic-border)",
          },
          action: {
            DEFAULT: "var(--block-action)",
            foreground: "var(--block-action-foreground)",
            border: "var(--block-action-border)",
          },
        },
        // Question-type tiles, one entry per BLOCK_REGISTRY category.
        // Consumed through the static CATEGORY_TILE map in QuestionTypeIcon —
        // never interpolated, so the JIT always sees whole class names.
        qtype: {
          text: {
            DEFAULT: "var(--qtype-text)",
            foreground: "var(--qtype-text-foreground)",
            border: "var(--qtype-text-border)",
          },
          boolean: {
            DEFAULT: "var(--qtype-boolean)",
            foreground: "var(--qtype-boolean-foreground)",
            border: "var(--qtype-boolean-border)",
          },
          validated: {
            DEFAULT: "var(--qtype-validated)",
            foreground: "var(--qtype-validated-foreground)",
            border: "var(--qtype-validated-border)",
          },
          datetime: {
            DEFAULT: "var(--qtype-datetime)",
            foreground: "var(--qtype-datetime-foreground)",
            border: "var(--qtype-datetime-border)",
          },
          choice: {
            DEFAULT: "var(--qtype-choice)",
            foreground: "var(--qtype-choice-foreground)",
            border: "var(--qtype-choice-border)",
          },
          numeric: {
            DEFAULT: "var(--qtype-numeric)",
            foreground: "var(--qtype-numeric-foreground)",
            border: "var(--qtype-numeric-border)",
          },
          advanced: {
            DEFAULT: "var(--qtype-advanced)",
            foreground: "var(--qtype-advanced-foreground)",
            border: "var(--qtype-advanced-border)",
          },
          display: {
            DEFAULT: "var(--qtype-display)",
            foreground: "var(--qtype-display-foreground)",
            border: "var(--qtype-display-border)",
          },
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Inter", "sans-serif"],
        serif: ["var(--font-serif)", "Georgia", "serif"],
        mono: ["var(--font-mono)", "Menlo", "monospace"],
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;
