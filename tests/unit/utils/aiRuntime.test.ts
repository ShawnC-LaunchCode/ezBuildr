/**
 * AI provider readiness probe (AI-P1).
 *
 * The bug this exists for: production ran a Gemini model the vendor had withdrawn,
 * every generation call returned 500, and `/health` said `healthy` throughout
 * because it only checked the database and the PDF converter. No test could have
 * caught the retirement itself — only the vendor knows — but these pin the five
 * things that decide whether the probe is worth having:
 *
 *   1. a withdrawn model is reported as unavailable rather than crashing;
 *   2. the model name and the raw error NEVER reach the caller (`/health` is
 *      unauthenticated) and DO reach the log;
 *   3. `probe` never claims the vendor was asked when it was not;
 *   4. it is cached, because an unauthenticated endpoint must not fan out into
 *      unbounded upstream requests;
 *   5. it goes through `safeFetch`, never raw `fetch` — CI's SSRF grep fails the
 *      build on a raw `fetch(` anywhere in `server/`, and did on this probe.
 *
 * `safeFetch` is stubbed rather than really called: the point is the probe's own
 * behaviour, and a suite that depended on Google's uptime would be worse than no
 * suite. The real vendor round-trip is proven live, not here.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const loggerError = vi.fn();
const safeFetchMock = vi.fn();

vi.mock('../../../server/logger', () => ({
  logger: { error: loggerError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  createLogger: () => ({ error: loggerError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

vi.mock('../../../server/utils/safeFetch', () => ({ safeFetch: safeFetchMock }));

const SAVED = { ...process.env };

/** Fresh module each time: the cache is module state. */
async function load() {
  vi.resetModules();
  return import('../../../server/utils/aiRuntime');
}

/**
 * Models the REAL vendor behaviour, which is the whole point.
 *
 * A withdrawn model does NOT make ListModels fail — the call returns 200 and the
 * model is simply absent from the list. (The per-model GET is worse than useless
 * here: it returns 200 and advertises `generateContent` for a model that answers
 * 404 to an actual generation. Verified live 2026-09-10.)
 */
function stubListModels(names: string[], status = 200) {
  safeFetchMock.mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve({ models: names.map((n) => ({ name: `models/${n}` })) }),
  });
  return safeFetchMock;
}

beforeEach(() => {
  loggerError.mockClear();
  safeFetchMock.mockReset();
  for (const key of ['GEMINI_API_KEY', 'GEMINI_MODEL', 'AI_API_KEY', 'AI_PROVIDER', 'AI_MODEL_WORKFLOW']) {
    delete process.env[key];
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...SAVED };
});

describe('checkAiProvider', () => {
  it('reports "not configured" rather than a failure when no key is set', async () => {
    const { checkAiProvider } = await load();

    // A deployment with AI switched off is not a broken deployment. An operator
    // has to be able to tell those apart.
    await expect(checkAiProvider()).resolves.toEqual({
      configured: false, available: false, probe: 'none',
    });
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('asks the vendor and reports a served model as available', async () => {
    process.env.GEMINI_API_KEY = 'k';
    process.env.GEMINI_MODEL = 'gemini-2.5-flash';
    const fetchSpy = stubListModels(['gemini-2.5-flash', 'gemini-3.5-flash']);
    const { checkAiProvider } = await load();

    await expect(checkAiProvider()).resolves.toEqual({
      configured: true, available: true, probe: 'provider',
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    // A ListModels GET, never a generation — a completion on every health poll
    // would burn tokens and rate limit.
    expect(fetchSpy.mock.calls[0][1]).toMatchObject({ method: 'GET' });
  });

  it('goes through safeFetch and never touches raw fetch', async () => {
    process.env.GEMINI_API_KEY = 'k';
    process.env.GEMINI_MODEL = 'gemini-2.5-flash';
    const raw = vi.fn().mockRejectedValue(new Error('raw fetch must not be used'));
    vi.stubGlobal('fetch', raw);
    const guarded = stubListModels(['gemini-2.5-flash']);
    const { checkAiProvider } = await load();

    await expect(checkAiProvider()).resolves.toMatchObject({ available: true });
    expect(guarded).toHaveBeenCalledTimes(1);
    expect(String(guarded.mock.calls[0][0])).toMatch(/^https:\/\/generativelanguage\.googleapis\.com\//);
    expect(raw).not.toHaveBeenCalled();
  });

  it('reports a WITHDRAWN model as unavailable — the AI-P1 posture', async () => {
    process.env.GEMINI_API_KEY = 'k';
    process.env.GEMINI_MODEL = 'gemini-2.0-flash';
    // 200 OK, model absent — exactly how a withdrawal presents.
    stubListModels(['gemini-2.5-flash', 'gemini-3.5-flash']);
    const { checkAiProvider } = await load();

    const health = await checkAiProvider();

    expect(health.configured).toBe(true);
    expect(health.available).toBe(false);
    expect(health.probe).toBe('provider');
    expect(health.error).toBe('AI provider is not reachable with the configured model');
  });

  it('keeps the model name, the key and the raw status out of the payload', async () => {
    process.env.GEMINI_API_KEY = 'super-secret-key';
    process.env.GEMINI_MODEL = 'gemini-2.0-flash';
    stubListModels(['gemini-2.5-flash']);
    const { checkAiProvider } = await load();

    const body = JSON.stringify(await checkAiProvider());
    expect(body).not.toContain('super-secret-key');
    expect(body).not.toContain('gemini-2.0-flash');
    expect(body).not.toContain('not offered');

    // ...but the operator gets all of it server-side, which is the only place the
    // model name is actually actionable.
    expect(loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'gemini', model: 'gemini-2.0-flash' }),
      expect.stringContaining('AI provider unreachable or model withdrawn'),
    );
  });

  it('survives a network error without throwing', async () => {
    process.env.GEMINI_API_KEY = 'k';
    process.env.GEMINI_MODEL = 'gemini-2.5-flash';
    safeFetchMock.mockRejectedValue(new Error('ECONNRESET'));
    const { checkAiProvider } = await load();

    await expect(checkAiProvider()).resolves.toMatchObject({
      configured: true, available: false, probe: 'provider',
    });
  });

  it('probes ONCE and caches — /health is unauthenticated', async () => {
    process.env.GEMINI_API_KEY = 'k';
    process.env.GEMINI_MODEL = 'gemini-2.5-flash';
    const fetchSpy = stubListModels(['gemini-2.5-flash']);
    const { checkAiProvider } = await load();

    await Promise.all([checkAiProvider(), checkAiProvider(), checkAiProvider()]);
    await checkAiProvider();

    // Four calls, one upstream request. Without this a health-check poller becomes
    // a denial-of-service amplifier pointed at the vendor.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('re-probes after the test seam clears the cache', async () => {
    process.env.GEMINI_API_KEY = 'k';
    process.env.GEMINI_MODEL = 'gemini-2.5-flash';
    const fetchSpy = stubListModels(['gemini-2.5-flash']);
    const { checkAiProvider, resetAiProviderProbe } = await load();

    await checkAiProvider();
    resetAiProviderProbe();
    await checkAiProvider();

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('says `registry` — never `provider` — for a vendor it does not call', async () => {
    process.env.AI_API_KEY = 'k';
    process.env.AI_PROVIDER = 'anthropic';
    process.env.AI_MODEL_WORKFLOW = 'claude-sonnet-5';
    const fetchSpy = stubListModels(['gemini-2.5-flash']);
    const { checkAiProvider } = await load();

    const health = await checkAiProvider();

    // The honesty requirement: `available: true` here rests on the model being
    // registered, NOT on anyone confirming it is served. Reporting `provider`
    // would be a green light nobody earned.
    expect(health.probe).toBe('registry');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('flags an unregistered model on a non-probed provider', async () => {
    process.env.AI_API_KEY = 'k';
    process.env.AI_PROVIDER = 'anthropic';
    process.env.AI_MODEL_WORKFLOW = 'claude-does-not-exist';
    const { checkAiProvider } = await load();

    await expect(checkAiProvider()).resolves.toMatchObject({
      configured: true, available: false, probe: 'registry',
    });
  });
});
