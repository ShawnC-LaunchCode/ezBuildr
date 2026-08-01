/**
 * Outbound HTTP to **operator-configured internal infrastructure**.
 *
 * This is the one sanctioned exception to the repo's "all outbound HTTP goes
 * through `safeFetch`" rule, and the only file besides `safeFetch.ts` excluded
 * from CI's raw-fetch guard (`.github/workflows/ci.yml`, "SSRF Guard").
 *
 * ## Why `safeFetch` cannot be used here
 *
 * `safeFetch` exists to stop SSRF via *user-supplied* URLs: it resolves DNS and
 * rejects anything landing on an internal or reserved address
 * (`safeFetch.ts` -> `isInternalIp`). Calls made through *this* module are the
 * opposite case — they target infrastructure the operator deployed and named in
 * an environment variable, which is *deliberately* private
 * (`gotenberg.railway.internal`, a sidecar, a service-mesh address). Routing
 * them through `safeFetch` would reject every request by design.
 *
 * ## The invariant, and why the signature enforces it
 *
 * The danger in exempting anything from the SSRF guard is that a URL derived
 * from user input or a database row later flows through the hole. So this
 * function **cannot be given a destination**: it takes a `baseUrl` (which must
 * come from configuration) plus a *path*, and builds the URL itself. There is
 * no argument that lets a caller redirect the request to another host, which
 * makes "the origin is operator-configured" a property of the type signature
 * rather than a convention reviewers have to police.
 *
 * If you find yourself wanting to pass a full URL, you want `safeFetch`.
 */

/** Trim a trailing slash so `${base}${path}` never doubles up. */
function normalizeBaseUrl(url: string): string {
    return url.replace(/\/$/, '');
}

/**
 * Request a path on an operator-configured internal service.
 *
 * @param baseUrl Origin from configuration (an env var) — never user input.
 * @param path Absolute path beginning with `/`.
 */
export async function internalServiceRequest(
    baseUrl: string,
    path: string,
    init: RequestInit = {}
): Promise<Response> {
    if (!path.startsWith('/')) {
        throw new Error(`internalServiceRequest: path must start with "/" (got "${path}")`);
    }

    const base = new URL(normalizeBaseUrl(baseUrl));

    if (base.protocol !== 'http:' && base.protocol !== 'https:') {
        throw new Error(`internalServiceRequest: unsupported protocol ${base.protocol}`);
    }
    // Credentials in an infrastructure URL are almost always a copy-paste of a
    // user-supplied value, which is exactly what must not reach this function.
    if (base.username !== '' || base.password !== '') {
        throw new Error('internalServiceRequest: baseUrl must not embed credentials');
    }

    // eslint-disable-next-line no-restricted-globals -- see module header: operator-configured internal endpoint, unreachable via safeFetch by design
    return fetch(`${normalizeBaseUrl(base.toString())}${path}`, init);
}
