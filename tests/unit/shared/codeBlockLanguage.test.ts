/**
 * CB-11: the Code Block `language` field, read side.
 *
 * `language` is optional on `JsQuestionConfig` for the same reason `trigger` and
 * `repeat` are: every Code Block stored before CB-11 has no such key, and a
 * required field would have needed a backfill over live rows to add a switch.
 * The default therefore has to hold at READ time, in one place — which is what
 * these pin. If `resolveCodeBlockLanguage` ever stops defaulting, every existing
 * block starts asking a `undefined` sandbox to run it.
 */
import { describe, it, expect } from 'vitest';

import {
  CODE_BLOCK_LANGUAGES,
  CODE_BLOCK_LANGUAGES_TUPLE,
  DEFAULT_CODE_BLOCK_LANGUAGE,
  resolveCodeBlockLanguage,
} from '@shared/types/steps';

describe('resolveCodeBlockLanguage', () => {
  it('defaults a config that predates the field to JavaScript (AC 5)', () => {
    expect(resolveCodeBlockLanguage({})).toBe('javascript');
    expect(resolveCodeBlockLanguage({ language: undefined })).toBe('javascript');
  });

  it('returns the declared language when the author has chosen one', () => {
    expect(resolveCodeBlockLanguage({ language: 'python' })).toBe('python');
    expect(resolveCodeBlockLanguage({ language: 'javascript' })).toBe('javascript');
  });

  it('agrees with the exported default, so the two cannot drift apart', () => {
    expect(resolveCodeBlockLanguage({})).toBe(DEFAULT_CODE_BLOCK_LANGUAGE);
  });
});

describe('CODE_BLOCK_LANGUAGES', () => {
  it('is exactly the transformBlockLanguageEnum pair the executor handles', () => {
    // Not an arbitrary list: `ScriptEngine.execute` branches on these two names
    // and returns "Unsupported language" for anything else, and the DB enum that
    // lifecycle_hooks/document_hooks still use carries the same two values.
    expect([...CODE_BLOCK_LANGUAGES]).toEqual(['javascript', 'python']);
  });

  it('shares one definition with the zod tuple used at the route boundary', () => {
    // Two hand-written copies would let the API accept a value the editor cannot
    // produce, or reject one it can.
    expect([...CODE_BLOCK_LANGUAGES]).toEqual([...CODE_BLOCK_LANGUAGES_TUPLE]);
  });
});
