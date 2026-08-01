# R3 Expressive & R4 Over-the-top — going loud without going broken

This register exists for the projects that have earned latitude: launches,
portfolios, playful brands, showpieces, anything where the user said "have
fun". The failure mode here is not excess — it's *timid* excess. A half-wild
site reads as a mistake; a fully-committed one reads as a decision.

## Art direction: the concept does the heavy lifting

1. **Write three mood words** from the brief ("nocturnal, conspiratorial,
   buttery") — then translate each into a concrete visual decision (palette:
   near-black + amber glow; type: secretive mono + fat display serif;
   texture: film grain). If a decision doesn't trace back to a mood word,
   it's decoration.
2. **Pick one organizing conceit** — the site *is* something: a menu, a
   dossier, a ticket stub, a terminal, a museum wall, a VHS tape. The
   conceit answers every layout question ("what would the dossier do?") and
   is what juries and friends remember.
3. **Commit past the comfort point.** Whatever the conceit, apply it to the
   scroll behavior, the cursor, the 404 copy, the favicon. R4 is reached
   when the details agree with each other, not when effects are added.

## The signature-moment toolkit

Every expressive site gets one Moment as its spine (SKILL.md). Amplitude
options, roughly ascending:

- **Type as hero:** one enormous display setting (10–20vw), tightly
  kerned, maybe split/staggered on entrance. Cheapest path to memorable.
- **Scroll choreography:** pinned sections, horizontal sequences, images
  that scale/reveal on scroll (CSS scroll-driven animations or
  IntersectionObserver). Scroll should *tell an order of events*, not just
  trigger fades.
- **Cursor as character:** custom cursor that reacts to hoverables — grows,
  inverts, picks up labels ("DRAG", "EAT"). R4: trails, magnetism.
- **Loader as theater:** a 1–2s branded intro (counter, wordmark assembly)
  — once per session, skippable, never on repeat visits.
- **Living background:** generative canvas, flowing gradient mesh in the
  brand hues, particle field reacting to pointer — at low contrast so
  content stays readable.
- **Physicality:** draggable elements, inertia, things that tilt toward the
  pointer, marquees you can grab. Toys make people stay.
- **Sound (R4, opt-in only):** tiny UI ticks and a mute toggle; never
  autoplay music.

Pick the Moment first, budget most of your effort there, and let the rest
of the page be its straight man — over-the-top *everything* flattens into
noise; over-the-top *one thing* with a disciplined field around it is the
award formula.

## The atmosphere pass — where "fine" becomes "above average"

Field-validated finding: a page can have the right register, real typefaces,
disciplined tokens, and a good conceit — and still read as merely "fine."
Structure is the floor. What observers actually register as "a cut above" is
**ambient life in the periphery** — the extra bits that make the scene feel
lit and inhabited. After the layout is right, run this as its own pass:

1. **Ambient particles.** 8–12 fireflies/embers/dust motes drifting in the
   background field — CSS-only `<i>` elements, per-particle `--x/--y/--dur/
   --delay` custom properties, opacity+transform keyframes. Behind content
   (`z-index: -1` in an isolated hero), in front of large backdrop objects
   for depth.
2. **Light that responds.** A soft brand-colored cursor glow on fine
   pointers (`mix-blend-mode: screen`, rAF-lerped follow, blooms wider over
   interactive elements, hidden on `pointer: coarse`). Cheapest "the page
   knows I'm here" signal that exists.
3. **Depth cues.** Backdrop objects parallax slower than the page (rAF
   scroll handler, transform-only, on an animation-free wrapper so inline
   transforms never fight keyframes). A fixed photographic vignette. The
   scene stops being a flat poster.
4. **Living hero details on slow loops.** Steam wisps, a drip that forms /
   hangs / falls, one crumb tumbling — cycles of 6–10s with long rests.
   **Slow loops with long pauses read as alive; fast constant motion reads
   as busy.** A detail the viewer only catches on the second look ("patience
   rewarded") is worth three they catch immediately.
5. **Interstitial texture.** A full-bleed band of enormous outlined display
   type rolling between sections (`margin-inline: calc(50% - 50vw)` inside a
   contained column) — breaks section monotony and restates the brand voice
   at poster scale.

Floor still holds: everything transform/opacity, reduced-motion gets a
*designed still* (the drop hangs glossy mid-form; the band sits static),
no-JS shows all content. A full working exemplar of this pass lives at
[../assets/exemplar-midnight-waffle.html](../assets/exemplar-midnight-waffle.html)
— a single-file page where every technique above is implemented and
commented; study it before building R3/R4 rather than re-deriving.

## Layout courage

- Break the grid deliberately: overlap type on images, run text vertically,
  let elements bleed off-canvas — while keeping an underlying column rhythm
  so the breaks read as intent.
- Editorial scale contrast: pair 12px mono captions with 12vw display type.
  Middle sizes are where drama goes to die.
- Whitespace or saturation — both work, but choose: an airy gallery or a
  maximal collage. The unforgivable middle is "pretty full".
- Rotate things. 1–3° of tilt on stickers, photos, badges reads playful;
  keep body text level.

## Color & type courage

- Expressive palettes still follow 60-30-10 — the drama comes from *which*
  hues (acid green on cream, oxblood on pink, cobalt on butter), not from
  using ten of them.
- Display faces earn their keep here: a fat serif, a weirdo grotesque, a
  variable font animated along its axes. Pair the weird one with a quiet
  workhorse for everything small.
- Text-as-texture is allowed (marquees, giant outlined repeats, watermark
  numerals) — as long as *reading* text stays crisp and contrast-legal.

## The floor that never drops (even at R4)

Over-the-top fails when it's slow or hostile, never because it's too much:

- **Performance:** effects on `transform`/`opacity`/canvas; lazy-load the
  heavy Moment; the page is interactive in ~2s on a mid phone. Jank kills
  whimsy dead.
- **Reduced motion:** the `prefers-reduced-motion` experience is a designed
  *still* version — beautiful poster, not broken animation stubs.
- **Keyboard & screen readers:** the toy layer is skippable; real content
  is real HTML underneath; focus is never trapped in a gimmick.
- **Readability:** body copy still passes contrast on whatever chaos it
  sits over — scrims, panels, or discipline.
- **An exit:** navigation stays findable inside the conceit. Lost users
  don't feel whimsy, they feel lost.

## Whimsy that ships (cheap, high-yield details)

Hover states with personality (buttons that squish, links that highlight
like a marker), copy in the brand's voice everywhere (buttons say "let me
in", the 404 stays in character), one easter egg (konami code, a clickable
mascot, console message), selection color and scrollbar on-theme, a favicon
that participates. Ten small jokes that agree beat one big effect that
doesn't.

## Self-check before proof

- Can you name the conceit in five words, and do the cursor/404/favicon
  know about it?
- Is there exactly one Moment, and does everything else defer to it?
- Reduced-motion pass looks intentional? Phone pass playable? Body text
  legible over every background it crosses?
- Would a stranger screenshot any single frame of this? Which one? That's
  your hero — make sure it loads first.
