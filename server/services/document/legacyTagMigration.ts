import PizZip from 'pizzip';

/**
 * One-time conversion of stored DOCX templates from the deleted prefix grammar
 * to the pipe grammar RenderCore owns:
 *
 *   {{defaultValue client_name "Not provided"}}  ->  {{ client_name | defaultValue:"Not provided" }}
 *   {{formatDate dob "MMMM DD, YYYY"}}           ->  {{ dob | formatDate:"MMMM DD, YYYY" }}
 *
 * TPL's D1 deleted the prefix form outright ("one grammar, no compatibility
 * shim"), so a template still written in it fails EVERY tag at compile time and
 * renders nothing. This does not reintroduce the old form — it rewrites stored
 * files once, so the renderer never has to know it existed. The filters take
 * `(value, ...args)` in both grammars, so the rewrite changes syntax, not meaning.
 *
 * Deliberately narrow. It converts only a tag that is (a) intact inside one XML
 * text node, (b) headed by a registered filter, (c) followed by a value path and
 * plain arguments. Anything else that still looks like the prefix form — split
 * across Word runs, or a `{{#each x}}`-style section helper whose meaning differs
 * — is reported as unconvertible and left untouched, for a human to fix.
 */

export interface LegacyTagConversion {
  buffer: Buffer;
  converted: Array<{ part: string; from: string; to: string }>;
  unconvertible: Array<{ part: string; tag: string; reason: string }>;
}

const TEMPLATE_PARTS = /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/;
/** An intact tag: no markup between the delimiters. */
const INTACT_TAG = /\{\{([^{}<]*?)\}\}/g;
/** Any tag once markup is stripped (catches tags Word split across runs). */
const ANY_TAG = /\{\{(.*?)\}\}/g;
/** A path segment's name part; a trailing `[3]` index is stripped before this is tested. */
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const TRAILING_INDEX = /\[\d+\]$/;
const NUMERIC = /^-?[\d.]+$/;
const isValuePath = (s: string): boolean =>
  s.split('.').every((segment) => IDENTIFIER.test(segment.replace(TRAILING_INDEX, '')));
const isNumber = (s: string): boolean => NUMERIC.test(s) && Number.isFinite(Number(s));
const isBareArg = (s: string): boolean => isNumber(s) || ['true', 'false', 'null'].includes(s) || isValuePath(s);

const XML_ENTITIES: Record<string, string> = { '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>', '&amp;': '&' };
const decodeXml = (s: string): string => s.replace(/&(?:quot|apos|lt|gt|amp);/g, (e) => XML_ENTITIES[e]);
const encodeXml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Split a tag body into tokens, keeping quoted strings (straight or Word's curly quotes) whole. */
function tokenize(body: string): string[] | null {
  const tokens: string[] = [];
  const token = /"([^"]*)"|'([^']*)'|“([^”]*)”|‘([^’]*)’|([^\s"'“”‘’]+)/g;
  let consumed = 0;
  for (const m of body.matchAll(token)) {
    // Only whitespace may sit between tokens; anything else (a stray quote) is not a plain tag.
    if (body.slice(consumed, m.index).trim() !== '') { return null; }
    const quoted = m[1] ?? m[2] ?? m[3] ?? m[4];
    tokens.push(quoted !== undefined ? JSON.stringify(quoted) : m[5]);
    consumed = (m.index ?? 0) + m[0].length;
  }
  return body.slice(consumed).trim() === '' ? tokens : null;
}

/** The pipe-grammar rewrite of a prefix-form tag body, or null if it is not one. */
function rewriteTag(body: string, filters: ReadonlySet<string>): string | null {
  const text = body.trim();
  if (text.includes('|') || /^[#^/]/.test(text)) { return null; }
  const tokens = tokenize(text);
  if (!tokens || tokens.length < 2) { return null; }
  const [helper, value, ...args] = tokens;
  if (!filters.has(helper) || !isValuePath(value)) { return null; }
  if (!args.every((a) => a.startsWith('"') || isBareArg(a))) { return null; }
  return ` ${value} | ${[helper, ...args].join(':')} `;
}

/** Does this tag body still look like the prefix form (a registered filter followed by more)? */
function looksLegacy(body: string, filters: ReadonlySet<string>): boolean {
  const text = body.replace(/^[#^/]/, '').trim();
  if (text.includes('|')) { return false; }
  const [head, ...rest] = text.split(/\s+/);
  return filters.has(head) && rest.length > 0;
}

export function convertLegacyPrefixTags(docx: Buffer, filters: ReadonlySet<string>): LegacyTagConversion {
  const zip = new PizZip(docx);
  const converted: LegacyTagConversion['converted'] = [];
  const unconvertible: LegacyTagConversion['unconvertible'] = [];

  for (const part of Object.keys(zip.files).filter((name) => TEMPLATE_PARTS.test(name))) {
    const xml = zip.file(part)?.asText();
    if (xml === undefined) { continue; }

    const rewritten = xml.replace(INTACT_TAG, (whole, rawBody: string) => {
      const pipe = rewriteTag(decodeXml(rawBody), filters);
      if (pipe === null) { return whole; }
      converted.push({ part, from: decodeXml(whole), to: `{{${pipe}}}` });
      return `{{${encodeXml(pipe)}}}`;
    });

    // Whatever still reads as the prefix form once markup is stripped could
    // not be rewritten safely: report it rather than guess.
    for (const m of rewritten.replace(/<[^>]+>/g, '').matchAll(ANY_TAG)) {
      const body = decodeXml(m[1]);
      if (!looksLegacy(body, filters)) { continue; }
      const reason = /^[#^/]/.test(body.trim())
        ? 'section helper — its meaning differs in the pipe grammar'
        : xml.includes(`{{${m[1]}}}`) ? 'arguments are not plain values' : 'split across Word runs';
      unconvertible.push({ part, tag: `{{${body}}}`, reason });
    }

    if (rewritten !== xml) { zip.file(part, rewritten); }
  }

  const buffer = converted.length > 0
    ? zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' })
    : docx;
  return { buffer, converted, unconvertible };
}
