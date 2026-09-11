/**
 * Whether this instance can actually reach its configured AI provider (AI-P1).
 *
 * WHY THIS EXISTS. On 2026-09-09 production had `GEMINI_MODEL=gemini-2.0-flash`,
 * a model Google had withdrawn. Every AI workflow generation and AI Assist call
 * returned 500 — and `/health` reported `healthy` the entire time, because it
 * only ever checked the database and the PDF converter. Nobody found it from the
 * outside; it surfaced because a ticket's live proof forced a real provider call.
 *
 * `ProviderFactory.validateConfig` does not help here: it checks the config is
 * well FORMED (a provider, a key, a model) and never that the vendor still serves
 * that model. A registry row is not evidence a model is callable — only the
 * provider is.
 *
 * Deliberately a standalone module, following `pythonRuntime.ts`: `/health` has no
 * business importing the AI stack just to ask a yes/no question.
 */
import { ModelRegistry } from '../services/ai/ModelRegistry';
import { resolveAiProviderConfig } from '../services/ai/providerConfig';
import { createLogger } from '../logger';
import { safeFetch } from './safeFetch';

const logger = createLogger({ module: 'ai-runtime' });

/** How the answer was reached — so a green light never overstates what was checked. */
export type AiProbeKind = 'provider' | 'registry' | 'none';

export interface AiProviderHealth {
  /** An API key and model resolve at all. False means AI is simply not set up. */
  configured: boolean;
  /** Best known state. See `probe` for how strongly this is known. */
  available: boolean;
  /**
   * `provider` — the vendor was asked and answered.
   * `registry` — only checked that the model is one this codebase knows; NOT a
   *              network check. An operator reading `available: true` alongside
   *              this deserves to know the difference.
   * `none`     — nothing was checked, because nothing is configured.
   */
  probe: AiProbeKind;
  /** Generic. The raw error and the model name go to the log, never to a caller. */
  error?: string;
}

/**
 * Five minutes, not forever.
 *
 * `pythonRuntime` caches permanently and is right to: an interpreter is a property
 * of the container filesystem, which cannot change under a running process. A
 * vendor's model catalogue is not — a model can be withdrawn while this process is
 * alive, which is close to what happened. A TTL means the outage surfaces within
 * five minutes instead of at the next deploy, while still bounding an
 * unauthenticated endpoint to ~12 upstream calls an hour however hard it is polled.
 */
const TTL_MS = 5 * 60 * 1000;
const PROBE_TIMEOUT_MS = 3000;
const UNAVAILABLE = 'AI provider is not reachable with the configured model';

let cached: { at: number; value: AiProviderHealth } | undefined;
let inFlight: Promise<AiProviderHealth> | undefined;

/**
 * Ask Gemini which models it actually OFFERS, and look for this one.
 *
 * THE OBVIOUS PROBE DOES NOT WORK, and live proof caught that, not a test.
 * `GET /v1beta/models/gemini-2.0-flash` returns **200** and lists
 * `generateContent` among its `supportedGenerationMethods` — for a model whose
 * `:generateContent` answers **404 "no longer available"**. The per-model metadata
 * record outlives the model's ability to serve. Verified 2026-09-10.
 *
 * `ListModels` does not lie: the withdrawn model is simply absent from it — 55
 * models returned, `models/gemini-2.0-flash` not among them, while
 * `models/gemini-2.5-flash` is.
 *
 * A minimal `generateContent` would be the only fully authoritative check, but it
 * spends tokens and quota on every probe of an unauthenticated endpoint. This
 * detects WITHDRAWAL and MISCONFIGURATION, which is what took production down. It
 * does NOT detect an exhausted quota or a revoked key — a model can be listed and
 * still refuse a generation. That residual gap is deliberate and worth stating
 * rather than papering over.
 */
async function askGemini(
  model: string,
  apiKey: string,
): Promise<{ ok: boolean; detail: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => { controller.abort(); }, PROBE_TIMEOUT_MS);
  try {
    // Through `safeFetch`, not raw `fetch`. This was raw once, on the argument
    // that the host is a compile-time constant and that DNS pinning adds failure
    // modes a health probe should not have. The repo's rule is enforced by a CI
    // grep with no per-line exception (Deployment Safety Check → Security Scan),
    // and it went red on exactly this line. The rule wins: a fixed vendor host
    // resolves to public addresses, so `safeFetch` passes it through unchanged
    // apart from pinning the socket to the address it validated.
    const response = await safeFetch(
      `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000&key=${encodeURIComponent(apiKey)}`,
      { method: 'GET', signal: controller.signal },
    );
    if (!response.ok) {
      return { ok: false, detail: `ListModels HTTP ${String(response.status)}` };
    }
    // `json()` is `any`; funnel it through `unknown` and narrow explicitly rather
    // than letting an unchecked shape flow into the comparison below.
    const raw: unknown = await response.json();
    const models = (raw as { models?: Array<{ name?: string }> } | null)?.models ?? [];
    const offered = new Set(models.map((entry) => entry.name));
    return offered.has(`models/${model}`)
      ? { ok: true, detail: 'listed' }
      : { ok: false, detail: `not offered; ${String(offered.size)} models listed` };
  } catch (err: unknown) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Only Gemini is network-probed. Not an oversight: its mechanism was verified
 * against the real vendor, INCLUDING the trap that the obvious endpoint reports a
 * withdrawn model as fine. No equivalent has been proven for OpenAI or Anthropic
 * here, and claiming `provider` for a call nobody has watched succeed would be the
 * unearned green light this field exists to prevent. They report `registry`.
 */
function probeKindFor(provider: string): AiProbeKind {
  return provider === 'gemini' ? 'provider' : 'registry';
}

async function run(): Promise<AiProviderHealth> {
  let config;
  try {
    config = resolveAiProviderConfig();
  } catch {
    // Throws when no key is set at all. That is a deployment with AI switched
    // off, not a fault — say so rather than reporting a failure.
    return { configured: false, available: false, probe: 'none' };
  }

  const registered = ModelRegistry.isRegistered(config.provider, config.model);
  const kind = probeKindFor(config.provider);

  if (kind === 'registry') {
    if (!registered) {
      logger.error(
        { provider: config.provider, model: config.model },
        'Configured AI model is not in the registry',
      );
    }
    return {
      configured: true,
      available: registered,
      probe: 'registry',
      ...(registered ? {} : { error: 'Configured AI model is not recognised' }),
    };
  }

  const { ok, detail } = await askGemini(config.model, config.apiKey);
  if (!ok) {
    // The model name is the single most useful thing an operator needs here, and
    // the single thing an unauthenticated caller must not be handed. Log it.
    logger.error(
      { provider: config.provider, model: config.model, detail },
      'AI provider unreachable or model withdrawn — generation and AI Assist will fail',
    );
  }
  return {
    configured: true,
    available: ok,
    probe: 'provider',
    ...(ok ? {} : { error: UNAVAILABLE }),
  };
}

/**
 * Cached for `TTL_MS`, and concurrent callers share one in-flight probe so a burst
 * of health checks cannot fan out into a burst of upstream requests.
 */
export function checkAiProvider(): Promise<AiProviderHealth> {
  const now = Date.now();
  if (cached && now - cached.at < TTL_MS) {
    return Promise.resolve(cached.value);
  }
  inFlight ??= run()
    .then((value) => {
      cached = { at: Date.now(), value };
      return value;
    })
    .finally(() => { inFlight = undefined; });
  return inFlight;
}

/** Test seam: forget the cached result so a suite can assert several postures. */
export function resetAiProviderProbe(): void {
  cached = undefined;
  inFlight = undefined;
}
