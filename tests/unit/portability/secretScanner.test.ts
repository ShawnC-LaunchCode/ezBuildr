import { describe, it, expect } from 'vitest';
import { scanForSecrets } from '../../../server/services/portability/redaction';

const scan = (code: string) => scanForSecrets('transform_blocks', { code }, ['code']);
const flags = (code: string) => scan(code).length > 0;

describe('scanForSecrets', () => {
  // Precision matters as much as recall here. A scanner that fires on ordinary
  // hook code produces warning fatigue, and a user who has learned to skip the
  // warnings will skip the one that is real.
  describe('does not flag ordinary hook code', () => {
    it.each([
      ['plain logic', 'const total = items.length;'],
      ['a comment mentioning a token', '// fetch the auth token from context'],
      // The documented, correct way to reach a secret in this codebase.
      ['reading a secret through the service', 'const apiKey = ctx.secrets.get("STRIPE");'],
      ['a UUID literal', 'emit({ id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" });'],
      ['a credential-ish identifier not assigned a literal', 'const tokenCount = data.tokens.length;'],
      ['a field name containing "password"', 'if (!user.password_reset_requested) return;'],
      ['a log line mentioning a credential', 'log("validating credential expiry");'],
    ])('%s', (_label, code) => {
      expect(flags(code)).toBe(false);
    });
  });

  describe('flags secret-shaped literals', () => {
    it.each([
      ['an OpenAI-style key', 'const apiKey = "sk-abcdefghijklmnopqrstuvwx";'],
      ['a Stripe live key', 'const apiKey = "sk_live_51H8xKzAbCdEfGhIjKlMn";'],
      ['a GitHub token', 'const t = "ghp_1234567890abcdefghijklmnop";'],
      ['an AWS access key id', 'const k = "AKIAIOSFODNN7EXAMPLE";'],
      ['a password assigned a literal', 'password: "hunter2hunter2",'],
      ['a long opaque literal', 'const blob = "dGhpcyBpcyBhIHZlcnkgbG9uZyBiYXNlNjQgc3RyaW5n";'],
    ])('%s', (_label, code) => {
      expect(flags(code)).toBe(true);
    });
  });

  it('reports the line number and never quotes the match', () => {
    const secret = 'ghp_1234567890abcdefghijklmnop';
    const warnings = scan(`const a = 1;\nconst b = 2;\nconst t = "${secret}";`);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      type: 'secret_scan',
      entity: 'transform_blocks',
      column: 'code',
      line: 3,
    });
    expect(warnings[0]?.message).not.toContain(secret);
  });

  it('returns nothing when the descriptor declares no scanPaths', () => {
    expect(scanForSecrets('steps', { code: 'const t = "ghp_1234567890abcdefghijklmnop";' }, undefined)).toEqual([]);
    expect(scanForSecrets('steps', { code: 'const t = "ghp_1234567890abcdefghijklmnop";' }, [])).toEqual([]);
  });
});
