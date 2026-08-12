/**
 * LD-1: Legal drafting primitives — hierarchical numbering, party plurality
 * agreement, and pronoun agreement.
 *
 * These are **template filters**, not a separate mechanism (TPL-O4): every
 * function here is merged into the `docxHelpers` object in `docxHelpers.ts`,
 * which is the single object `RenderCore` iterates to register
 * angular-expressions filters. There is one grammar and `RenderCore` owns it.
 * They live in their own leaf module only because `docxHelpers.ts` is already
 * near the 1000-line lint ceiling; registration is unchanged.
 *
 * Two conventions apply to everything below.
 *
 * **Numbering is pure, never stateful.** Each numbering filter is a function
 * of the ordinals the author passes it and nothing else — no hidden counter,
 * no render-order dependency. A stateful counter is invisible in the Word
 * document (the author cannot see why `3.` became `4.`) and silently
 * miscounts the moment a conditional section is skipped or a loop repeats a
 * row, which is exactly what legal templates do. The cost is that the author
 * supplies the ordinal (usually `{{ $index | add:1 | legalNumber }}` inside a
 * loop, or a literal for a fixed clause); that cost is visible and local.
 *
 * **Pronouns are never inferred.** There is deliberately no name list, no
 * honorific table, and no "guess from the first name" path anywhere in this
 * file. A name does not indicate anyone's pronouns, and a wrong guess
 * misgenders a real client in a document that gets signed. Pronouns come from
 * an explicit value only, and an absent or empty value resolves to they/them.
 */

/** Render any filter argument as text without throwing on null/undefined. */
function asText(value: unknown): string {
  if (value === null || value === undefined) { return ''; }
  return String(value);
}

/** First non-empty candidate, or `''`. Avoids truthiness on strings. */
function firstNonEmpty(...candidates: string[]): string {
  for (const candidate of candidates) {
    if (candidate !== '') { return candidate; }
  }
  return '';
}

// ===================================================================
// (a) Legal hierarchical numbering — pure functions of explicit ordinals
// ===================================================================

/**
 * Coerce one numbering level to a 1-based integer ordinal, or `undefined`
 * when it cannot be one. `undefined` is the "render blank" signal (rule 2):
 * a null/empty/unparseable level is a skipped or unanswered question, not a
 * template bug worth throwing over. Numeric strings coerce, because a step
 * value arriving from the runner is frequently a string. A fractional value
 * truncates toward zero; `0` and negatives have no legal-numbering label and
 * therefore render blank.
 */
function toOrdinal(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') { return undefined; }
  if (typeof value === 'boolean') { return undefined; }

  const parsed = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(parsed)) { return undefined; }

  const ordinal = Math.trunc(parsed);
  return ordinal >= 1 ? ordinal : undefined;
}

/**
 * Bijective base-26 label: 1 -> a, 26 -> z, 27 -> aa, 28 -> ab. The
 * spreadsheet-column scheme rather than a repeat scheme (`aa` not `a2`),
 * which is the convention a numbered legal outline continues with past (z).
 */
function letterLabel(ordinal: number): string {
  let remaining = ordinal;
  let label = '';

  while (remaining > 0) {
    const position = (remaining - 1) % 26;
    label = String.fromCharCode(97 + position) + label;
    remaining = Math.floor((remaining - 1) / 26);
  }

  return label;
}

const ROMAN_UNITS: ReadonlyArray<readonly [number, string]> = [
  [1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'],
  [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'],
  [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i'],
];

/** Largest value classical roman numerals represent without overbars. */
const MAX_ROMAN_ORDINAL = 3999;

function romanLabel(ordinal: number): string {
  if (ordinal > MAX_ROMAN_ORDINAL) { return ''; }

  let remaining = ordinal;
  let label = '';

  for (const [value, numeral] of ROMAN_UNITS) {
    while (remaining >= value) {
      label += numeral;
      remaining -= value;
    }
  }

  return label;
}

/**
 * Dotted decimal outline number from explicit ordinals: `1`, `1.1`, `1.1.1`.
 *
 * The input is the first (outermost) level; each colon argument adds one
 * deeper level, so `{{ article | legalNumber:clause:item }}` with 1, 1, 1
 * renders `1.1.1`. An array input supplies every level at once
 * (`[1, 2, 3]` -> `1.2.3`), which is what a List answer or a transform block
 * naturally produces.
 *
 * The path is only as deep as it is known: the first level that is not a
 * valid ordinal ends it, so `legalNumber(1, null, 3)` is `1`, not `1.3`. A
 * partial number is correct-but-shallow; a number that silently promotes a
 * third-level item to the second level is wrong.
 *
 * Deliberately renders no trailing period. Type the period in Word (`{{ ... }}.`)
 * when the house style wants `1.` at the top level, so one filter serves both
 * `1.` and `1.1` without a style argument.
 */
export function legalNumber(value: unknown, ...deeperLevels: unknown[]): string {
  const levels = Array.isArray(value)
    ? [...(value as unknown[]), ...deeperLevels]
    : [value, ...deeperLevels];

  const labels: string[] = [];
  for (const level of levels) {
    const ordinal = toOrdinal(level);
    if (ordinal === undefined) { break; }
    labels.push(String(ordinal));
  }

  return labels.join('.');
}

/** Parenthesised lowercase letter: 1 -> `(a)`, 27 -> `(aa)`. */
export function legalLetter(value: unknown): string {
  const ordinal = toOrdinal(value);
  return ordinal === undefined ? '' : `(${letterLabel(ordinal)})`;
}

/** Parenthesised uppercase letter: 1 -> `(A)`. */
export function legalUpperLetter(value: unknown): string {
  const ordinal = toOrdinal(value);
  return ordinal === undefined ? '' : `(${letterLabel(ordinal).toUpperCase()})`;
}

/** Parenthesised lowercase roman numeral: 1 -> `(i)`, 4 -> `(iv)`. */
export function legalRoman(value: unknown): string {
  const ordinal = toOrdinal(value);
  if (ordinal === undefined) { return ''; }

  const label = romanLabel(ordinal);
  return label === '' ? '' : `(${label})`;
}

/** Parenthesised uppercase roman numeral: 1 -> `(I)`, 4 -> `(IV)`. */
export function legalUpperRoman(value: unknown): string {
  const label = legalRoman(value);
  return label.toUpperCase();
}

// ===================================================================
// (b) Party plurality agreement
// ===================================================================

/**
 * How many parties a value stands for, or `undefined` when it stands for
 * none (render blank).
 *
 * - An array counts its items: two party records -> plural forms.
 * - A number (or numeric string) is the count itself, so a "number of
 *   signatories" question can drive agreement directly.
 * - Any other non-empty value — a single party name, a single party object —
 *   is **one** party. That is the drafting-correct reading: one party record
 *   takes singular forms.
 * - Null, undefined, `''` and whitespace count as none.
 */
function toPartyCount(value: unknown): number | undefined {
  if (value === null || value === undefined) { return undefined; }
  if (Array.isArray(value)) { return value.length; }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.trunc(value) : undefined;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') { return undefined; }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : 1;
  }

  return 1;
}

/**
 * Choose the form that agrees with a party count:
 * `{{ parties | plural:"party":"parties" }}`.
 *
 * Zero takes the plural form by default, which is what English does ("0
 * parties are named"). Supply a third argument when the drafting convention
 * differs for zero: `{{ parties | plural:"party":"parties":"no party" }}`.
 */
export function plural(
  value: unknown,
  singularForm: unknown,
  pluralForm: unknown,
  zeroForm?: unknown
): string {
  const count = toPartyCount(value);
  if (count === undefined) { return ''; }

  const pluralText = asText(pluralForm);
  if (count === 0) {
    const zeroText = asText(zeroForm);
    return zeroText === '' ? pluralText : zeroText;
  }

  return count === 1 ? asText(singularForm) : pluralText;
}

/** `party` / `parties` for the party count. */
export function partyParties(value: unknown): string {
  return plural(value, 'party', 'parties');
}

/** `is` / `are` for the party count. */
export function isAre(value: unknown): string {
  return plural(value, 'is', 'are');
}

/** `has` / `have` for the party count. */
export function hasHave(value: unknown): string {
  return plural(value, 'has', 'have');
}

/**
 * `its` / `their` for the party count. This is about how many parties there
 * are, not about anyone's pronouns — use `pronounPossessive` for a person.
 */
export function itsTheir(value: unknown): string {
  return plural(value, 'its', 'their');
}

// ===================================================================
// (c) Pronoun agreement — explicit values only, they/them by default
// ===================================================================

export interface PronounForms {
  /** they, she, he */
  subject: string;
  /** them, her, him */
  object: string;
  /** their, her, his — the determiner ("their counsel"), not "theirs" */
  possessive: string;
  /** themselves, herself, himself */
  reflexive: string;
  /** True when the set takes plural verb agreement ("they are"). */
  plural: boolean;
}

const THEY_THEM: PronounForms = {
  subject: 'they',
  object: 'them',
  possessive: 'their',
  reflexive: 'themselves',
  plural: true,
};

const SHE_HER: PronounForms = {
  subject: 'she',
  object: 'her',
  possessive: 'her',
  reflexive: 'herself',
  plural: false,
};

const HE_HIM: PronounForms = {
  subject: 'he',
  object: 'him',
  possessive: 'his',
  reflexive: 'himself',
  plural: false,
};

const IT_ITS: PronounForms = {
  subject: 'it',
  object: 'it',
  possessive: 'its',
  reflexive: 'itself',
  plural: false,
};

/**
 * Extra spellings an explicit pronoun answer may arrive as. The canonical
 * forms of each set are registered automatically; these are the ones that are
 * not a canonical form — possessive pronouns (`hers`), the singular reflexive
 * (`themself`), and the common slash spellings a pronoun question stores.
 */
const PRONOUN_ALIAS_LISTS: ReadonlyArray<readonly [PronounForms, readonly string[]]> = [
  [THEY_THEM, ['theirs', 'themself', 'they/them/theirs', 'they/them/their/themselves']],
  [SHE_HER, ['hers', 'she/her/hers', 'she/her/hers/herself']],
  [HE_HIM, ['his', 'he/him/his', 'he/him/his/himself']],
  [IT_ITS, ['it/its', 'it/its/itself']],
];

function buildPronounAliases(): Map<string, PronounForms> {
  const aliases = new Map<string, PronounForms>();

  for (const [forms, extraSpellings] of PRONOUN_ALIAS_LISTS) {
    const keys = [
      forms.subject,
      forms.object,
      forms.possessive,
      forms.reflexive,
      `${forms.subject}/${forms.object}`,
      `${forms.subject}/${forms.object}/${forms.possessive}`,
      ...extraSpellings,
    ];

    for (const key of keys) {
      if (!aliases.has(key)) { aliases.set(key, forms); }
    }
  }

  return aliases;
}

const PRONOUN_ALIASES = buildPronounAliases();

/** Lowercase and drop whitespace, so "She / Her" matches "she/her". */
function normalizePronounKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '');
}

/**
 * Positional parse of a slash-form pronoun value that is not one of the
 * built-in sets, so an explicitly stated set outside them (`xe/xem/xyr/xyrs/xemself`)
 * is honoured rather than quietly replaced by they/them.
 *
 * Positions follow the widely used ordering subject/object/possessive
 * determiner/possessive pronoun/reflexive. A 4-part value is read as
 * subject/object/possessive/reflexive; a 5-part value takes its reflexive
 * from the last position. Anything not supplied is derived from the object
 * form the author *did* supply (`xem` -> `xemself`), never from a name.
 */
function parseSlashForm(raw: string): PronounForms | undefined {
  const parts = raw.split('/').map((part) => part.trim()).filter((part) => part !== '');
  if (parts.length < 2) { return undefined; }

  const [subject, object] = parts;
  const possessive = firstNonEmpty(parts[2] ?? '', `${object}s`);
  const reflexive = parts.length >= 5
    ? parts[4]
    : firstNonEmpty(parts[3] ?? '', `${object}self`);

  return { subject, object, possessive, reflexive, plural: subject === 'they' };
}

const PRONOUN_OBJECT_KEYS = ['subject', 'object', 'possessive', 'reflexive'] as const;

/**
 * Read an explicit pronoun object — `{ subject, object, possessive,
 * reflexive, plural }` — as supplied by a party record or a transform block.
 * Missing forms are derived from the forms that *are* present. Returns
 * `undefined` when the object states no pronoun at all, so the caller can
 * fall back to they/them.
 */
function fromPronounObject(source: Record<string, unknown>): PronounForms | undefined {
  const stated = PRONOUN_OBJECT_KEYS.map((key) => asText(source[key]).trim());
  const [subject, object, possessive, reflexive] = stated;

  const anchor = firstNonEmpty(object, subject);
  if (anchor === '') { return undefined; }

  return {
    subject: firstNonEmpty(subject, anchor),
    object: firstNonEmpty(object, anchor),
    possessive: firstNonEmpty(possessive, `${anchor}s`),
    reflexive: firstNonEmpty(reflexive, `${anchor}self`),
    plural: source.plural === true || firstNonEmpty(subject, anchor).toLowerCase() === 'they',
  };
}

/**
 * Resolve an explicit pronoun value to its agreeing forms.
 *
 * Accepted, in order: a `{ pronouns: ... }` wrapper (so a whole party record
 * can be piped), an explicit forms object, a recognised pronoun string in any
 * of its spellings, and a slash-form set outside the built-ins. Anything
 * absent, empty, or not a pronoun at all resolves to they/them.
 *
 * There is no other input. In particular there is no name, title, or
 * honorific path: a value that is not a pronoun is never mined for a guess,
 * it just yields the safe default.
 */
export function resolvePronouns(value: unknown): PronounForms {
  if (value === null || value === undefined) { return THEY_THEM; }

  if (typeof value === 'object' && !Array.isArray(value)) {
    const source = value as Record<string, unknown>;
    if (source.pronouns !== undefined && source.pronouns !== null) {
      return resolvePronouns(source.pronouns);
    }
    return fromPronounObject(source) ?? THEY_THEM;
  }

  const key = normalizePronounKey(asText(value));
  if (key === '') { return THEY_THEM; }

  return PRONOUN_ALIASES.get(key) ?? parseSlashForm(key) ?? THEY_THEM;
}

/** Subject form of an explicit pronoun value: `they`, `she`, `he`. */
export function pronounSubject(value: unknown): string {
  return resolvePronouns(value).subject;
}

/** Object form of an explicit pronoun value: `them`, `her`, `him`. */
export function pronounObject(value: unknown): string {
  return resolvePronouns(value).object;
}

/** Possessive determiner: `their`, `her`, `his` — as in "their counsel". */
export function pronounPossessive(value: unknown): string {
  return resolvePronouns(value).possessive;
}

/** Reflexive form: `themselves`, `herself`, `himself`. */
export function pronounReflexive(value: unknown): string {
  return resolvePronouns(value).reflexive;
}

/**
 * Irregular third-person singular verbs whose plural form is not just the
 * singular minus its `-s`. Everything else is handled by the suffix rules in
 * `pluralizeVerb`.
 */
const IRREGULAR_VERB_PLURALS: Record<string, string> = {
  is: 'are',
  was: 'were',
  has: 'have',
  does: 'do',
  goes: 'go',
};

/** Third-person singular -> plural: `is` -> `are`, `agrees` -> `agree`. */
function pluralizeVerb(singular: string): string {
  const irregular = IRREGULAR_VERB_PLURALS[singular];
  if (irregular !== undefined) { return irregular; }

  if (singular.endsWith('ies') && singular.length > 3) {
    return `${singular.slice(0, -3)}y`;
  }
  if (/(?:ss|sh|ch|x|z)es$/.test(singular)) {
    return singular.slice(0, -2);
  }
  if (singular.endsWith('s') && !singular.endsWith('ss')) {
    return singular.slice(0, -1);
  }

  return singular;
}

/**
 * Verb agreement for an explicit pronoun value — the reason a pronoun filter
 * family is not just four string lookups. they/them takes plural agreement,
 * so `{{ client_pronouns | pronounVerb:"is" }}` renders `are` for they/them
 * and `is` for she/her. Supply the plural form explicitly as a second
 * argument when the derived one is wrong: `pronounVerb:"is":"are"`.
 *
 * A capitalised singular ("Is") keeps its capital in the plural result.
 */
export function pronounVerb(value: unknown, singularForm: unknown, pluralForm?: unknown): string {
  const singular = asText(singularForm).trim();
  if (singular === '') { return ''; }

  if (!resolvePronouns(value).plural) { return singular; }

  const explicitPlural = asText(pluralForm).trim();
  if (explicitPlural !== '') { return explicitPlural; }

  const lowered = singular.toLowerCase();
  const derived = pluralizeVerb(lowered);
  const isCapitalised = singular.charAt(0) !== lowered.charAt(0);

  return isCapitalised ? derived.charAt(0).toUpperCase() + derived.slice(1) : derived;
}

/**
 * The three drafting-primitive families, ready to merge into the
 * `docxHelpers` object (`docxHelpers.ts`), which is the only registration
 * path — `RenderCore` iterates that object.
 */
export const draftingPrimitives = {
  // Hierarchical numbering (pure — see this file's header)
  legalNumber,
  legalLetter,
  legalUpperLetter,
  legalRoman,
  legalUpperRoman,

  // Party plurality agreement
  plural,
  partyParties,
  isAre,
  hasHave,
  itsTheir,

  // Pronoun agreement (explicit values only, they/them default)
  pronounSubject,
  pronounObject,
  pronounPossessive,
  pronounReflexive,
  pronounVerb,
};
