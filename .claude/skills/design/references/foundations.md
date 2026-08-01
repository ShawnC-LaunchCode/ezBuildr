# Foundations — the craft that holds at every register

These are the fundamentals that make work look *designed* rather than
assembled. Registers change how loudly you play; this file is how to play in
tune.

## Typography

Type is 80% of interface design. Get it right and mediocre layout survives;
get it wrong and nothing saves you.

- **Scale, not vibes.** Derive sizes from a ratio — 1.2 (minor third) for
  dense product UI, 1.25–1.333 for marketing, up to 1.5+ for editorial drama.
  Anchor body at 16px (product) or 18px (long-form). A working scale:
  13 / 14 / 16 / 20 / 25 / 31 / 39 / 49 / 61.
- **Line-height tightens as size grows.** Body: 1.5–1.7. Subheads: 1.2–1.3.
  Display: 0.95–1.1. A 64px headline at 1.5 line-height is the most common
  amateur tell on the web.
- **Letter-spacing follows the same law.** Large display type wants negative
  tracking (-0.01em to -0.04em); ALL-CAPS labels want positive (+0.05em to
  +0.12em) and a smaller size. Body stays at 0.
- **Measure:** 45–75 characters per line for body text. `max-width: 65ch` is
  a good default. Nothing reads worse than 140-character lines.
- **Two typefaces max.** One is usually enough with a good variable font
  (weight + optical-size axes give you a whole family). Classic pairings:
  grotesque display + humanist body; serif display + grotesque UI; anything +
  a monospace *accent* (mono for labels/data/code is a third "voice" that
  rarely counts against you in tech contexts).
- **Numbers in UI:** `font-variant-numeric: tabular-nums` anywhere digits
  align in columns or update in place (tables, timers, prices).
- **Font loading:** self-contained contexts (artifacts, single-file demos)
  block external fonts — design a real system stack instead of defaulting:
  `system-ui` is fine for R1/R2; for character try stacks led by
  `Avenir Next`, `Seravek`, `Georgia`, or `ui-monospace`. When you can load
  fonts, load two weights max per family and `font-display: swap`.

## Color

- **Structure: 60-30-10.** Dominant neutral field, secondary surface tone,
  one accent used so sparingly it means something. If the accent appears
  everywhere, you don't have an accent — you have a theme, and no emphasis.
- **Build in OKLCH** (or at least HSL) so you can shift lightness without
  hue rot. Derive a neutral ramp (9–11 steps) and *tint it* faintly toward
  your brand hue — pure gray reads dead; a 2–4% chroma tint reads expensive.
- **Dark themes are not inverted light themes.** Near-black (#0A0A0B-ish,
  or oklch ~15%) beats pure black; raise surfaces with lightness steps, not
  heavy shadows; desaturate accents slightly (full-chroma colors vibrate on
  dark); bump body text to ~90% lightness, not pure white.
- **Semantic colors** (success/warn/error/info) get the same treatment as
  the accent: one hue each, with fg/bg/border variants from the ramp.
- **Test both themes at contrast targets** (4.5:1 body, 3:1 large/UI). Do it
  with the actual values, not by eyeball.

## Spacing & layout

- **One base unit** (4px or 8px), one scale: 4/8/12/16/24/32/48/64/96/128.
  Related things sit closer than unrelated things — proximity *is* grouping;
  borders and boxes are what you reach for when spacing failed.
- **Whitespace is material.** Doubling the space around a hero costs nothing
  and reads as confidence. Cramped = cheap, at every register.
- **Grids are for breaking.** Set a 12-column (or 6/4) grid, align to it,
  then let the *one* important element violate it deliberately. Asymmetry
  reads as designed only when the surrounding order makes it legible.
- **Optical > mathematical.** Icons centered by eye, play-buttons nudged
  right, headings pulled slightly left of their box edge. Trust your eye at
  the final pass.
- **Responsive means composed at every size,** not shrunk. Check ~375px and
  ~1440px minimum; use `clamp()` for fluid type
  (e.g. `clamp(2rem, 1rem + 4vw, 4rem)`) and container queries for
  components that live in variable slots.

## Motion

- **Every animation has one job:** orient (where did it come from), confirm
  (that worked), connect (these are related), or delight (rare, earned). If
  you can't name the job, delete the animation.
- **Durations:** micro-interactions 120–200ms; panel/page transitions
  200–350ms; narrative/scroll moments 400–800ms. Past ~1s, users are waiting
  on you.
- **Easing:** default to `cubic-bezier(0.2, 0, 0, 1)` (fast out, soft
  landing) for entrances; `ease-in` only for exits; `linear` only for
  spinners/marquees. Springy overshoot is an R3/R4 spice, not an R2 default.
- **Choreograph, don't blast.** Stagger list entrances 20–40ms apart;
  parent-then-children. Everything animating at once reads as a glitch.
- **Animate only `transform` and `opacity`** (compositor-friendly). Height
  animations via `grid-template-rows: 0fr → 1fr` or clip-path.
- **`prefers-reduced-motion`:** provide a reduced variant that still feels
  finished — fade instead of fly, instant instead of scroll-driven. Gate
  autoplaying/looping motion behind it entirely.

## Depth, texture, and surface

- **One shadow system.** Two or three elevations, each a *layered* shadow
  (a tight dark one + a soft wide one) tinted toward the background hue —
  never `0 4px 8px rgba(0,0,0,0.5)` slabs on everything.
- **Borders vs shadows: pick a lead.** Crisp 1px borders (with shadows as
  whispers) is the modern product look; soft shadow-led depth suits
  friendlier registers. Mixing leads per-card looks accidental.
- **Kill flatness with texture, subtly:** a 2–3% noise/grain overlay, a
  faint radial glow behind heroes, a barely-there dot or line grid on empty
  fields. Texture at whisper volume is the cheapest "this was designed"
  signal there is.
- **Gradients:** small lightness ramps within one hue read premium;
  cross-hue rainbow sweeps read 2023-AI. If two hues, keep them adjacent
  (blue→violet) and shift lightness too.

## States & details — the last 10% that reads as the whole

- Focus: a visible custom `:focus-visible` ring (2px, offset, accent) — the
  browser default on your palette looks unfinished; *removing* it is worse.
- Loading: skeletons shaped like the real content beat spinners; reserve
  layout space to prevent shift.
- Empty states: an illustration or well-set message + the primary action.
  An empty table with just "No data" is a hole in the design.
- Selection color (`::selection`), scrollbar styling on overflow areas,
  a real favicon, `tabular-nums` in tables, non-breaking spaces before
  units, real en/em dashes and curly quotes in display copy.
- Real content. Lorem ipsum hides rhythm problems; write plausible copy at
  realistic lengths, including the long-name worst case.
