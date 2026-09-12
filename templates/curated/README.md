# Curated starter templates (LD-2)

GH-173 AC2/AC3 asks for three curated starter templates — an NDA, a Retainer
Agreement, and an Intake Questionnaire — each with a sample `.docx` and
pre-configured variable mappings, authored in the shipped template vocabulary
(LD-1's drafting primitives + BIZ-1's business-day filters).

## Where this content lives, and why

**Top-level `templates/curated/`, one folder per template, as plain data.**
Not `client/src/templates/` (that tree is bundled into the Vite client build,
and a `.docx` binary plus a workflow-shaped JSON document have no reason to
ship in client JS), and not a database row via the `workflow_templates` table
or the `marketplaceTemplates` stub in `server/lib/templates/MarketplaceService.ts`
(that table doesn't exist yet — `MarketplaceService` is unimplemented TODO
scaffolding reading `TemplateManifest.workflow: unknown`, i.e. graph JSON from
before the graph-builder removal; wiring into it would mean resurrecting a
dead shape, which is exactly the kind of mechanism this ticket's scope guard
says not to add).

A top-level content directory mirrors `migrations/` and `tickets/` — data an
editor can find, read, and hand-edit without touching application code, and
without any of it being a route, a state machine, or a new runtime path. If a
future ticket wires a "start from template" gallery into the product, it
reads from here; this ticket only authors the content and proves it renders.

## Structure

```
templates/curated/
  README.md                       this file
  nda/
    workflow.json                 curated starter workflow: title, settings, pages/steps
    mapping.md                    alias -> docx tag table + notes
    template.docx                 sample DOCX using the shipped grammar
  retainer-agreement/
    workflow.json
    mapping.md                    includes the hand-checked business-day-across-a-holiday proof (AC4)
    template.docx
  intake-questionnaire/
    workflow.json                 includes settings.intakeConfig (existing field, see its mapping.md)
    mapping.md
    template.docx
```

`workflow.json` is **descriptive content**, not an import format: a
`{ title, description, settings, pages: [{ title, steps: [{ alias, type,
title, required, config?, visibleIf? }] }] }` shape that mirrors the real
`pages`/`steps` schema (`shared/schema/workflow.ts`) closely enough to be a
faithful spec for someone building the workflow by hand in the builder UI, or
for a future importer to consume — but nothing here imports it today. No
route, service, or repository reads these files.

## How these are proven, not just written

`tests/unit/services/document/curatedTemplates.test.ts` loads each
`template.docx` from disk and renders it through
`server/services/document/RenderCore.ts` — the same single production
rendering entry point `docSamples.test.ts` uses for the authoring guide's
executable examples — with realistic run data built from each `workflow.json`
(every alias present, including `null` for intentionally-unanswered optional
questions, mirroring how `RunDataService` seeds a real run). That is what "a
sample DOCX with pre-configured variable mappings that resolve against a real
run" means here: the mapping is the identity alias-to-tag convention
documented in each `mapping.md`, and the test is the proof it resolves.

The `.docx` fixtures themselves are built with the same minimal-but-valid
OOXML construction `docSamples.test.ts` uses (`PizZip` + `[Content_Types].xml`
+ `_rels/.rels` + `word/document.xml`) — the codebase's own definition of a
"real" DOCX for this rendering pipeline, since `RenderCore`/docxtemplater is
what determines whether a `.docx` is well-formed, not Word-specific parts
these fixtures don't need (styles, core properties, etc.).

## Scope note — Intake Questionnaire is content, not the removed pipeline

`intake-questionnaire/` is a curated **workflow** (questions + a rendered
summary memo), not the removed `/intake/*` portal. It adds no route and no
state machine, and does not reintroduce `intakeStateMachine` (deleted,
LIST2-10). Its `workflow.json.settings.intakeConfig` uses the existing,
still-live `workflows.intakeConfig` field — see
`intake-questionnaire/mapping.md` for exactly which part of that field is
demonstrated and why.
