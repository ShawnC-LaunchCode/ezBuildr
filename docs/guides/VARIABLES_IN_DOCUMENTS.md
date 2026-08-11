# Variables in Word documents

Use this guide when authoring a `.docx` template for ezBuildr. The examples in
this guide are rendered through the production DOCX engine by
`tests/unit/services/document/docSamples.test.ts`; their sample IDs match the
test names.

> **Not the same as script helpers.** The `helpers.*` functions in
> [the Helper Library](../scripting/helper-library.md) are for sandboxed lifecycle and
> document-hook *scripts*, and are not available as template filters. Some names overlap with
> different meanings, and several — `now`, `format`, `diff`, `slug`, `clamp`, `sum`, `avg` —
> have no filter equivalent. An unknown filter name **rejects the upload**, so a wrong guess
> fails loudly at authoring time rather than quietly at render time.

## Quick rules

- Insert tags as ordinary text in Microsoft Word. Tags use double braces.
- Variable names are case-sensitive workflow aliases, not question labels.
- Use dot paths for nested data and brackets for array positions.
- Apply filters after the value with a pipe. Chain filters from left to right.
- Pass filter arguments after colons. Parenthesised arguments do not parse.
- Use section tags to repeat or conditionally include text and table rows.
- A missing top-level variable raises an error. A known variable whose value is
  empty renders blank.
- The statement and comment delimiters `{%` and `{#` are reserved. They are not
  ezBuildr section tags.

## Variables and expressions

### Values, nested paths, and array positions

| Sample | Text to type in Word | Example data | Rendered text |
|---|---|---|---|
| V1 | `{{client_name}}` | `client_name` is Ada Lovelace | Ada Lovelace |
| V2 | `{{client.address.city}}` | `client.address.city` is Chicago | Chicago |
| V3 | `{{Children[0].name}}` | the first child's name is Ada | Ada |

An indexed tag is associated with its top-level workflow alias during template
analysis. For example, V3 depends on `Children`. An index beyond the end of an
array renders blank.

### Filters, chains, and arguments

A pipe sends the value on its left into the filter on its right. Filters may be
chained; V4 trims the value before converting it to uppercase:

`{{client_name | trim | upper}}` → `ADA LOVELACE` when `client_name` is
`"  Ada Lovelace  "`.

Filter arguments use colons. An argument may be a literal or another variable:

`{{amount | add:tax}}` → `108` when `amount` is `100` and `tax` is `8` (F13).

Do not put filter arguments in parentheses. This tag does not parse:

`{{name | default("N/A")}}` (F14)

It raises a template syntax error whose detail says that the scope parser for
the tag failed to compile. Write `default:"N/A"` instead.

Word may replace straight quotes with curly quotes while you type. ezBuildr
normalises those quotes inside filter arguments. This renders correctly:

`{{date_of_birth | formatDate:“MM/DD/YYYY”}}` → `01/05/2026` when the value is
`2026-01-05` (F15).

### Comparisons and conditional expressions

Section expressions may compare variables, indexed values, or literals. Both
the opening and closing tags contain the same expression:

`{{#count > 9}}Additional schedule attached.{{/count > 9}}` (V5)

The sentence renders when `count` is `10` and renders nothing when `count` is
`9`. Expressions inside a loop can also read variables from the parent scope.

## Filter vocabulary

These named filters are the stable authoring vocabulary. Every example below is
covered by the executable documentation test.

| Filter | Copy-paste example | Example input | Output |
|---|---|---|---|
| `longdate` | `{{value | longdate}}` | `2026-01-05` | January 5, 2026 |
| `shortdate` | `{{value | shortdate}}` | `2026-01-05` | 01/05/2026 |
| `usd` | `{{value | usd}}` | `1234.5` | $1,234.50 |
| `currency` | `{{value | currency:"USD"}}` | `1234.5` | $1,234.50 |
| `number` | `{{value | number}}` | `1234.5` | 1,235 |
| `percent` | `{{value | percent}}` | `42.345` | 42% |
| `upper` | `{{value | upper}}` | Ada Lovelace | ADA LOVELACE |
| `lower` | `{{value | lower}}` | ADA@EXAMPLE.COM | ada@example.com |
| `titlecase` | `{{value | titlecase}}` | ada lovelace | Ada Lovelace |
| `yesno` | `{{value | yesno}}` | `true` | Yes |
| `trim` | `{{value | trim}}` | `"  signed  "` | signed |
| `default` | `{{value | default:"N/A"}}` | empty string | N/A |

The renderer also exposes lower-level filters for calculations and custom
formatting. Their arguments follow the same colon form. Prefer the named
filters above when one fits: they make templates consistent and easier to
review.

### Date arithmetic and month ends

Date arithmetic accepts numeric colon arguments. Month addition uses the
destination month's last valid day instead of spilling into the following
month:

`{{start_date | addMonths:1}}` → `02/28/2026` when `start_date` is
`2026-01-31` (D1).

This clamp is the convention for shorter destination months. Date filters
return formatted calendar dates and reject non-date inputs instead of silently
producing a wrong date.

## Missing values: strict-undefined

ezBuildr distinguishes a typo or deleted question from an unanswered optional
question:

- U1: `Phone: [{{phone}}]` renders `Phone: []` when `phone` exists in the data
  contract but its value is empty.
- U2: the same text raises `undefined variable "phone" is not present in the
  submitted data` when the top-level `phone` key does not exist.
- U3: `{{phone | default:"Not provided"}}` renders `Not provided` even when the
  key is missing. `default` is the explicit opt-out from strict-undefined.

Known workflow aliases are supplied to the renderer even when unanswered, so
an optional unanswered field normally follows U1. The loud U2 case identifies
a misspelling, a deleted alias, or data that does not satisfy the template's
contract. A missing sibling field on one item inside a loop, an out-of-range
array position, or a path below a `null` parent renders blank rather than
raising a top-level-contract error.

## Structural constructs in Word

The recipes below use Word table coordinates: A is the first cell, B is the
second, and the row number starts at 1. Type the tags into the stated content
cells; do not add hidden marker rows. Header rows are ordinary content and do
not contain section tags.

### S1: Repeat one table row for every array item

Create a two-column table:

| Word row | Cell A | Cell B |
|---|---|---|
| 1 | Child | Number |
| 2 | `{{#Children}}{{name}}` | `{{$index}}{{/Children}}` |

The opening tag is at the start of A2. The matching closing tag is at the end of
B2, in the same template row. With children Ada and Alan, Word row 2 is cloned
and the rendered rows are `Ada | 0` and `Alan | 1`. `$index` is zero-based.

### S2: Include or remove one table row

Create this two-column table:

| Word row | Cell A | Cell B |
|---|---|---|
| 1 | Role | Name |
| 2 | `{{#include_guardian}}Guardian` | `{{guardian_name}}{{/include_guardian}}` |

Put the opening tag at the start of A2 and the closing tag at the end of B2. If
`include_guardian` is false, Word row 2 is removed entirely. If it is true, the
row remains and the tags disappear, leaving `Guardian | Grace` for a guardian
named Grace.

The section expression may be a comparison rather than a boolean variable; the
cell-placement rule is unchanged.

### S3: Include or remove a span of content rows

For two conditional content rows, use this supported form:

| Word row | Cell A | Cell B |
|---|---|---|
| 1 | Field | Value |
| 2 | `{{#show_details}}Address` | `{{address}}` |
| 3 | Phone | `{{phone}}{{/show_details}}` |

Put the opening tag in A2, the first content cell of the span. Put the closing
tag in B3, the last content cell of the span. When `show_details` is true, rows
2 and 3 remain with their content. When it is false, both rows are removed.

### S4: Authoring trap—do not use dedicated marker rows

This form is broken when the condition is true:

| Word row | Cell A | Cell B |
|---|---|---|
| 1 | Field | Value |
| 2 | `{{#show_details}}` | empty |
| 3 | Address | `{{address}}` |
| 4 | Phone | `{{phone}}` |
| 5 | empty | `{{/show_details}}` |

Rows 2 and 5 are dedicated marker rows. When `show_details` is false, the whole
span disappears cleanly. When it is true, those two rows survive as empty Word
rows around the content. This is a rendering limitation, not a supported layout.

Use S3 instead: put the opening tag in the first content row (A2) and the
closing tag in the last content row (B3). That supported form renders correctly
whether the condition is true or false.

### S5: Nest a loop inside a row loop

Create this two-column table:

| Word row | Cell A | Cell B |
|---|---|---|
| 1 | Person | Assets |
| 2 | `{{#people}}{{name}}` | `{{#assets}}{{asset}} {{/assets}}{{/people}}` |

The outer `people` section opens at the start of A2 and closes at the end of B2,
so row 2 repeats for each person. The inner `assets` section opens and closes in
B2 around the asset text. With Ada owning a House and Car and Grace owning a
Boat, the rendered rows are `Ada Lovelace | House Car` and
`Grace Hopper | Boat`.

### S6: Put conditional text in the middle of a sentence

This construct is not a table. Type both tags in the same Word paragraph:

`Contingent Gift{{#has_children}} to My Children{{/has_children}}.`

When true it renders `Contingent Gift to My Children.`; when false it renders
`Contingent Gift.`. Keep the spaces that belong to the optional phrase inside
the section so the false result has correct punctuation and spacing.

### S7: Push an object into scope

An object section changes the current scope to that object; it does not iterate
the object's keys. Create one row:

| Word row | Cell A | Cell B |
|---|---|---|
| 1 | `{{#fees}}Filing fee` | `{{filing | usd}}{{/fees}}` |

The `fees` object opens at the start of A1 and closes at the end of B1. Inside
the section, `filing` resolves from `fees.filing`. A filing value of `350`
renders `Filing fee | $350.00`.

## Reserved delimiters and docxtpl migration

ezBuildr section tags use double braces, as in S1–S7. Jinja/docxtpl statement
and comment delimiters are reserved for possible future language features and
are rejected today.

R1, a docxtpl-style statement:

`{% if approved %}Approved{% endif %}`

raises:

`Template syntax error: statement syntax is reserved and not yet supported: {% if approved %}`

R2, a Jinja-style comment:

`{# drafting note #}`

raises:

`Template syntax error: statement syntax is reserved and not yet supported: {# drafting note #}`

If you are migrating from docxtpl, rewrite statements as ezBuildr section tags
and use the Word row-placement recipes above. Do not upload a template expecting
these delimiters to be ignored.

## Authoring and troubleshooting checklist

1. Assign stable, case-sensitive aliases to workflow questions.
2. Type tags in Word using the examples above; keep structural opening and
   closing tags in the specified content cells.
3. Use pipes for filters and colons for every argument.
4. Use `default` only where a missing or empty value has an intentional fallback.
5. Test both true and false branches of every section and zero, one, and several
   items for every row loop.
6. If a tag fails compilation, check for parenthesised arguments, unbalanced
   section tags, or a tag split across different table cells or rows.
7. If generation reports an undefined variable, compare the named path with the
   workflow alias inventory. Do not hide an accidental typo with `default`.

Tags split into multiple Word text runs are repaired during upload. Tags split
across a table-cell or table-row boundary cannot be repaired; keep each opening
or closing tag wholly inside the cell named by the recipe.
