---
name: design
description: >-
  Design direction and craft standards for building visually exceptional web
  UI — from professional product interfaces (the default: precise, edgy-tech,
  does-work) to full-throttle expressive, award-show-caliber sites when the
  project allows. Use this skill EVERY time you create or change anything the
  user will see in a browser: pages, components, landing pages, dashboards,
  forms, styling, layout, themes, animation, hero sections, redesigns, or
  small UI tweaks inside an existing app. Trigger on requests like "build a
  site/page", "make it look better/modern/pop", "polish the UI", "add a
  component", "design from this reference/screenshot", or any frontend work
  with a visual result — even when the user doesn't say "design". Also use it
  when given reference material (screenshots, sites, brands) to work from.
  Defer chart/graph internals to the dataviz skill; skip for purely
  non-visual code.
---

# Design — craft direction for everything the user sees

Two truths govern this skill. Most of what gets built here is professional
software that has to *do work* — an interface that gets out of the way earns
more trust than one that performs. But some projects earn full artistic
latitude, and when they do, timidity is the failure mode. Same fundamentals,
different amplitude. Your first job is knowing which project you're in.

## Step 0 — Read the room: pick a register

| Register | When | Energy |
|---|---|---|
| **R1 Utility** | Internal tools, admin panels, dense data UI | Invisible. Speed and clarity are the aesthetic. |
| **R2 Product** *(default)* | Real products, SaaS, dev tools, dashboards, client work | Edgy-tech confidence: precise, dark-friendly, opinionated but restrained. Linear / Vercel / Stripe energy. |
| **R3 Expressive** | Marketing sites, portfolios, launches, brand moments | Strong art direction with a memorable signature. Still ships, still fast. |
| **R4 Over-the-top** | Fun projects, showpieces, experiments — when the user says "go wild" | Awards-bait. Break conventions deliberately and commit hard. |

Choosing rules:

- **Default to R2** for anything that is a working product, unless told
  otherwise. This is the machine-level bias.
- **Explicit user signals override everything.** "Have fun with it", "go all
  out", "whimsical", "make it weird" → R3/R4. "Keep it clean/professional" →
  R2. When the signal is genuinely ambiguous *and* the register would change
  the work dramatically, ask — one question, with a recommendation.
- **Maintenance inherits.** A tweak or new component inside an existing
  product uses the product's existing register and design system. Consistency
  beats novelty; do not smuggle a redesign into a button fix.
- **Announce your register** in one line before designing, so the user can
  redirect cheaply ("Treating this as R3 — expressive but shippable").
- **One register per project.** Mixing registers is how design falls apart —
  an R4 splash page on an R1 admin tool reads as broken, not bold.

## Non-negotiables — every register, no exceptions

Award-level work is 90% fundamentals executed relentlessly; the flourish is
the last 10%. These hold from R1 to R4:

1. **Hierarchy is real.** A squinting user should still see what matters
   first, second, third. If everything is bold, nothing is.
2. **One spacing system.** Pick a base (4 or 8px) and derive every gap,
   padding, and margin from it. Arbitrary values are entropy.
3. **Type discipline.** Max two typefaces. Sizes from a scale, not vibes.
   Line-height tightens as size grows.
4. **Contrast passes.** 4.5:1 body text, 3:1 large text/UI — in both themes.
   Beautiful-but-unreadable is a failing grade at any register.
5. **Every interactive state is designed:** hover, focus-visible, active,
   disabled, loading, empty, error. The empty state is a design opportunity,
   not an afterthought.
6. **Motion has a job** (orient, confirm, connect, delight — pick one per
   animation) and respects `prefers-reduced-motion` with a fallback that
   still looks intentional.
7. **Consistency scales.** Radii, shadows, border weights each come from one
   small scale. Three shadow styles on one page means no shadow style.
8. **No AI-slop clichés.** Banned unless the concept demands them: default
   purple-to-blue gradients, glassmorphism cards on mesh-gradient blobs,
   emoji as bullet points, Inter-plus-gradient-text on everything, giant
   rounded cards with identical drop shadows, "🚀 Features" sections. These
   read as generated, and generated reads as cheap.

## Process — concept → tokens → moment → system → polish → proof

1. **Concept first, one sentence.** Before any code, write the art
   direction: "X meets Y for Z" ("Swiss timetable meets terminal UI for
   people who ship at 2am"). If you can't say it, you can't build it.
   Register R3/R4: spend real thought here — the concept *is* the site.
2. **Tokens before components.** Colors, type scale, spacing, radii,
   shadows, durations as CSS custom properties. Every later decision gets
   cheaper and more consistent.
3. **Design the Moment.** Every project gets exactly one signature moment —
   the thing someone describes to a friend. In R2 it might be a perfect
   command palette or a hero that types itself; in R4 it might be the whole
   scroll experience. Registers change the Moment's amplitude, never its
   existence. Design it early, while courage is high.
4. **Systematize quietly.** Everything that isn't the Moment supports it.
   Repetition and rhythm in the supporting cast make the Moment land.
5. **Polish pass.** States, micro-interactions, focus rings, selection
   color, scrollbar, favicon, real content instead of lorem. Detail density
   is what separates "nice" from "how long did this take?".
6. **Proof.** See "Prove it" below. Never present unverified UI.

## Working within an existing design system

If the project has one (component library, tokens, an established look —
e.g. a Radix + Tailwind `ui/` directory), **extend it, don't fight it**. Read
neighboring components before writing one; reuse their primitives, spacing,
and variant patterns. Your craft shows in how seamlessly new work sits next
to old — a foreign-looking component is a defect even if it's prettier.
Propose system-level changes to the user instead of forking the style locally.

## When given reference material

Screenshots, links, "make it feel like X" — read
[references/working-from-reference.md](references/working-from-reference.md)
first. Short version: inventory the reference's decisions, find the one move
doing the most work, extract tokens, transpose to your content — never trace,
and never reproduce another brand's assets or trade dress.

## Register deep dives

Read the file matching your register before designing (foundations always
applies):

- [references/foundations.md](references/foundations.md) — typography, color,
  spacing, motion, depth, states. **Read for every project.**
- [references/register-professional.md](references/register-professional.md)
  — R1/R2: the edgy-tech feel deconstructed; dashboards, dev-tool landing
  pages, micro-interactions.
- [references/register-expressive.md](references/register-expressive.md) —
  R3/R4: art direction, signature moments, scroll choreography, how to go
  over the top without going broken.

If output is a claude.ai Artifact, also load `artifact-design` (harness
requirement) — this skill still governs the design thinking.

## Prove it — and iterate. One pass is a draft, always.

The single biggest quality lever in this skill is not the initial build — it
is **the number of honest look→critique→fix cycles you run before
presenting**. A one-shot page, from any model at any register, lands around
B-: competent, forgettable, "fine". The distance from there to an A is
iteration with eyes. Budget for it:

- **Minimum two full cycles** before presenting anything (build → render →
  critique → fix → re-render). **Three or more for R3/R4.**
- Each cycle: open it in the browser pane and **look** — screenshot desktop
  and mobile widths, dark mode if the surface has one. If rendering is
  unavailable, say so plainly and present the work as an unverified draft,
  never as finished.

The critique pass, each cycle — answer these against the actual render:

1. **Squint test:** does hierarchy survive blur? **First-second test:** what
   do you see first, and is it the right thing?
2. **The "fine" test:** if your honest reaction is "looks fine," R1/R2 may
   pass (invisible is success there) — but **R3/R4 has failed.** Those
   registers must provoke a reaction. The cure is usually not more layout —
   it's the **atmosphere pass** in register-expressive.md (ambient particles,
   responsive cursor light, parallax depth, living details on slow loops,
   interstitial texture). Structure gets a page to "fine"; atmosphere is
   what observers register as a cut above.
3. **The sameness test:** does this look like every other AI-generated page
   of its genre? Name the one element nobody else would ship. If you can't,
   the concept isn't in the pixels yet.
4. **Worst-element pass:** find the single weakest thing on the page and fix
   it. Repeat next cycle — this converges fast.
5. **Mechanics:** non-negotiables checklist, `prefers-reduced-motion` if
   animated, keyboard-tab through interactive elements.

Fix what fails, re-render, re-look. Then present *with the screenshot*.
"It should look good now" without having looked is not a claim this skill
permits.

**Fonts are not optional polish.** System stacks are the floor for
constrained media (artifacts, single-file demos). The moment the project can
load assets, choose and load real typefaces (self-hosted woff2, two weights)
— a characterful display face is the cheapest single upgrade a page can
get, and its absence is the most common reason a well-built page still
reads "fine".
