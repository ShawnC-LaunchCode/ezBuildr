import pino from "pino";
import { describe, it, expect } from "vitest";

/**
 * O-9 regression: `logger.error({ error }, "...")` used to drop the error's
 * message.
 *
 * An Error's `message`/`stack` are non-enumerable, and pino only auto-applies
 * its error serializer to a key literally named `err`. This codebase logs
 * `{ error }` in ~540 places, so every one of them emitted only the error's
 * enumerable own properties. A production 500 was logged as
 * `{"code":"VALIDATION_ERROR","message":""}` while the real text —
 * "Logic rule references non-existent step alias: ..." — never appeared.
 *
 * These tests pin the three properties the fix in `server/logger.ts` must keep:
 * the message survives, secrets are still redacted, and non-Error payloads are
 * passed through unchanged. They build a logger with the same options rather
 * than importing the singleton so output can be captured deterministically.
 */

const REDACT_PATHS = ["token", "password", "*.password", "*.token", "*.secret"];

function captureLog(
  opts: pino.LoggerOptions,
  emit: (l: pino.Logger) => void
): Record<string, unknown> {
  let line = "";
  const logger = pino({ level: "info", ...opts }, { write: (s: string) => { line = s; } });
  emit(logger);
  return JSON.parse(line) as Record<string, unknown>;
}

const withFix: pino.LoggerOptions = {
  serializers: { error: pino.stdSerializers.err, err: pino.stdSerializers.err },
  redact: { paths: REDACT_PATHS, remove: true },
};

describe("logger error serialization (O-9)", () => {
  it("keeps the message when an Error is logged under the `error` key", () => {
    const err = new Error("Logic rule references non-existent step alias: foo");
    const out = captureLog(withFix, (l) => { l.error({ error: err }, "boom"); });

    const serialized = out.error as Record<string, unknown>;
    expect(serialized.message).toBe("Logic rule references non-existent step alias: foo");
    expect(serialized.stack).toBeTruthy();
  });

  it("demonstrates the pre-fix behavior it guards against", () => {
    // Same call WITHOUT the serializers: the message is gone. If this ever
    // starts passing, pino's defaults changed and the fix may be redundant.
    const err = new Error("this message disappears");
    const out = captureLog(
      { redact: { paths: REDACT_PATHS, remove: true } },
      (l) => { l.error({ error: err }, "boom"); }
    );

    const serialized = out.error as Record<string, unknown>;
    expect(serialized.message).toBeUndefined();
  });

  it("still redacts secrets carried on the error and at the top level", () => {
    const err = Object.assign(new Error("boom"), {
      token: "SECRET_TOKEN",
      password: "SECRET_PW",
    });
    const out = captureLog(withFix, (l) => {
      l.error({ error: err, token: "TOP_LEVEL_SECRET" }, "boom");
    });

    const serialized = out.error as Record<string, unknown>;
    expect(serialized.message).toBe("boom");
    expect(serialized.token).toBeUndefined();
    expect(serialized.password).toBeUndefined();
    expect(out.token).toBeUndefined();
    expect(JSON.stringify(out)).not.toContain("SECRET");
  });

  it("passes non-Error payloads through unchanged", () => {
    const plain = captureLog(withFix, (l) => {
      l.error({ error: { code: "X", detail: "not an Error" } }, "m");
    });
    expect(plain.error).toEqual({ code: "X", detail: "not an Error" });

    const str = captureLog(withFix, (l) => { l.error({ error: "just a string" }, "m"); });
    expect(str.error).toBe("just a string");
  });
});
