# R1 Utility & R2 Product — the edgy-tech register, deconstructed

This is the default register: software that does work, designed by people
with taste. The reference class is Linear, Vercel, Stripe, Raycast — but the
goal is to understand *why* those feel the way they do, not to cosplay them.

## What actually produces the feel

The edgy-tech look is about **ten small decisions applied everywhere**, not
any single flourish:

1. **Near-black, tinted.** Backgrounds around oklch 13–16% lightness with a
   faint hue tint (usually cool). Pure #000 is harsh; #1a1a1a gray is dead.
   Light-mode equivalents: warm-white paper (~98%) with the same tint logic.
2. **Tight display type.** Headings in a good grotesque at heavy-ish weight
   (550–650 variable), negative tracking (-0.02em), short line-heights.
   The headline says one confident thing, not a paragraph.
3. **A monospace voice.** Labels, badges, keyboard hints, data, section
   eyebrows in small caps/mono with letterspacing. This one move does more
   "dev-tool credibility" than any illustration.
4. **1px borders as the depth system.** Hairlines at ~12–18% lightness above
   surface, shadows barely present. Cards read as *panels*, not floating
   slabs.
5. **One accent, rationed.** A single confident hue that appears on the
   primary action, active states, and maybe one hero glow — and almost
   nowhere else. Restraint is what makes it read as intentional.
6. **Fast, crisp motion.** 120–200ms, decisive easing, no bounce. The app
   should feel like it's ahead of you. Hover states respond instantly
   (transition on the way in ~120ms, slightly slower out).
7. **Density with breathing room.** Compact rows and controls (32–36px),
   but generous *section* spacing. Dense ≠ cramped: the small scale is
   local, the big scale is airy.
8. **Keyboard-first affordances.** Visible `⌘K` hints, kbd-styled shortcut
   chips, focus rings that look designed. Even decorative, these signal
   "built by people who use software".
9. **Data honesty.** Tabular numerals, right-aligned numbers, real units,
   subdued secondary text (~60% lightness contrast), timestamps humanized.
   Truth well-set is the aesthetic.
10. **Whisper texture.** A faint grid, grain, or radial glow behind the hero
    or empty states — one texture, quiet, everywhere it appears.

"Edgy" means the design has **one or two sharp opinions** — an aggressive
contrast ratio, brutalist mono labels, an unexpected accent hue, oversized
section numerals — executed consistently. It does not mean costume: skulls,
glitch effects, and neon-everything read as trying too hard in this register.

## R2 landing pages (dev tools, SaaS)

- **Hero formula:** one-line claim (what it is, for whom) + one supporting
  sentence + primary action + *proof artifact*. The proof artifact — a live
  terminal, code diff, dashboard screenshot in a styled frame, animated
  product moment — is usually the Moment. Invest there.
- Show the product doing something real. Fake-looking product shots are the
  #1 credibility leak on dev-tool sites.
- **Section rhythm:** alternate density — big claim → dense proof → quiet
  logos → feature trio → deep-dive → CTA. Same-weight sections all the way
  down reads as a template.
- Feature sections: lead with the *outcome* in the heading, the mechanism in
  the body. Icons optional; if used, one consistent stroke style, never
  emoji.
- Code samples are design elements: real syntax highlighting tuned to your
  palette, window chrome, correct language, short enough to actually read.
- Social proof quietly: grayscale/dimmed logos, real quotes with names and
  faces beat star ratings.

## R1/R2 application UI (dashboards, tools)

- **Tables:** hairline row separators only (no zebra unless huge), 40–48px
  rows, sticky header, right-aligned numerics with tabular-nums, row hover,
  and a designed empty state. Column headers in the mono/label voice.
- **Forms:** labels above fields, 8px label gap, one column unless fields
  are truly paired, inline validation on blur, primary action
  right-anchored. Input height matches button height (36–40px).
- **Navigation:** sidebar 220–260px with compact items (32–36px), section
  labels in the mono voice, active item gets accent text + subtle fill —
  not a giant pill.
- **Micro-interaction catalog** (steal freely): button press scales to
  0.98; copy buttons flip to a checkmark for 1.2s; save affordances show
  pending → success within the control; toasts slide 12px + fade over
  180ms; skeletons shimmer at ~1.4s; command palette opens in ≤150ms with
  results staggered 20ms. Every one of these is `transform`/`opacity` only.
- **Density modes:** if the tool is data-heavy, design the compact mode
  first; comfortable mode is the derivative, not the other way around.

## Anti-patterns for this register

- Marketing gradients inside the app; the product UI is neutrals + one
  accent, full stop.
- Rounded-everything (20px radii on inputs reads consumer-toy; 6–10px is
  the zone here; pick radii from one scale, e.g. 6/10/16).
- Cards inside cards inside cards — nesting depth ≥3 means the layout
  needs restructuring, not more borders.
- Shadow soup: if panels have hairlines, shadows stay at whisper level.
- Center-aligned body text anywhere except short hero decks.
- Disabled-gray primary buttons that are actually enabled; low-contrast
  "aesthetic" text under 4.5:1; placeholder-as-label forms.
- Dumping Tailwind defaults unstyled (default blue-500, default shadows,
  default focus ring) — tokens exist so the framework doesn't show.

## Checklist before proof

- The accent appears in ≤ 5 places per screen.
- Every number that can align, aligns; every date is humanized.
- Hover, focus-visible, active, disabled, loading, empty, error: designed.
- Hero holds up at 375px; table has a mobile answer (stack, scroll, or cut).
- Squint: primary action wins; headings ladder correctly; no orphan floats.
