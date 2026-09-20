# Example: Advance Healthcare Directive (sample)

A small, complete ezBuildr example: a three-page interview that produces one Word document.

> **Sample only.** The generated document is a demonstration. It is not legal advice and is
> not a valid advance directive in any state.

## Import it

1. In ezBuildr, open **Workflows → Import** (`/workflows/import`).
2. Upload `advance-healthcare-directive.ezb`.
3. The preview should list 1 project, 1 workflow, 4 pages, 14 steps and 1 template, with no
   warnings. Apply it.

You get a project called **Advance Healthcare Directive (Sample)** containing the workflow and its
template. Imports always arrive as a **draft**, so publish it if you want a public link.

## What's in the interview

| Page | Questions |
|---|---|
| 1. About You | Full legal name, date of birth, phone, email (optional) |
| 2. Your Healthcare Agent | Agent's name, relationship (choice), agent's phone, alternate agent (optional) |
| 3. Your Wishes | Life-sustaining treatment (choice), pain relief (yes/no), organ donation (choice), other wishes (optional), today's date |
| 4. Your Document | Final Documents step that generates the directive as a DOCX |

## Files

| File | What it is |
|---|---|
| `advance-healthcare-directive.ezb` | The import bundle: project, workflow, pages, steps and the DOCX template |
| `advance-healthcare-directive-template.docx` | The template on its own, to read or edit in Word |
| `sample-output-jordan-rivera.docx` | A document the workflow generated from a filled-in run |

## How the template reads answers

The template uses the standard `{{ alias | filter }}` grammar
(see `docs/guides/VARIABLES_IN_DOCUMENTS.md`):

- `{{ date_of_birth | longdate }}` prints a date as "March 14, 1958".
- `{{ pain_relief | yesno }}` prints a yes/no answer as "Yes" or "No".
- `{{ alternate_agent_name | default:"No alternate agent named." }}` supplies text when an
  optional question is left blank.
- Choice answers print their option text directly, because each option's stored value is its
  label.

## How it was verified

It was built through the app's own API on a throwaway local database, then run to completion. The
export was imported into a separate new account, and the imported copy was run with different
answers, including blank optional fields. Both generated documents were checked for every answer
and for no leftover `{{ }}` tags.
