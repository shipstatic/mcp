/**
 * @file Suite-wide hermeticity. Two invariants, enforced here rather than by
 * convention.
 *
 *   1. **No ambient credentials.** `src/index.ts` reads the process
 *      environment to construct the SDK client, and the SDK layers its own
 *      `SHIP_*` fallbacks underneath. A developer who has exported a real
 *      credential would otherwise turn the "no key configured" assertions
 *      green for the wrong reason — the anonymous path would be silently
 *      authenticated.
 *
 *   2. **No outbound network.** The SDK's default API URL is PRODUCTION. A
 *      fake that fails to intercept, or a future test that builds a real
 *      `Ship`, would reach it. Anything that is not loopback fails loudly,
 *      naming the URL, instead of quietly deploying something somewhere real.
 *
 * Ported from `npm/ship/tests/setup.ts` — same two invariants, same reasons.
 * The jsdom Blob shim is deliberately absent: this suite is Node-only.
 */

// -----------------------------------------------------------------------------
// 1. Scrub ambient credentials
// -----------------------------------------------------------------------------

for (const key of Object.keys(process.env)) {
  if (key.startsWith('SHIP_')) delete process.env[key];
}

// -----------------------------------------------------------------------------
// 2. No-network guard
// -----------------------------------------------------------------------------

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

const realFetch = globalThis.fetch;

/**
 * Throws synchronously rather than rejecting: real `fetch` never throws
 * synchronously, so a `fetch(...).catch(...)` chain inside the SDK cannot
 * swallow this into a plausible-looking network error and surface it as an
 * ordinary tool failure. The offending test fails naming its URL.
 */
function assertLoopback(url: string): void {
  let hostname: string;
  try {
    hostname = new URL(url, 'http://localhost/').hostname;
  } catch {
    hostname = 'localhost';
  }
  if (LOOPBACK_HOSTS.has(hostname)) return;
  throw new Error(
    `[no-network guard] blocked an outbound request to ${url}\n` +
      `MCP tests must never reach a real host. The ship SDK is a collaborator ` +
      `here, not the subject — drive it through the fake in tests/mocks/ship.ts. ` +
      `See tests/setup.ts.`,
  );
}

// Parameters are derived from the real `fetch` rather than restated, so the
// wrapper cannot drift from the signature it replaces.
type FetchArgs = Parameters<typeof globalThis.fetch>;

globalThis.fetch = ((input: FetchArgs[0], init?: FetchArgs[1]) => {
  const url =
    typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
  assertLoopback(url);
  return realFetch(input, init);
}) as typeof globalThis.fetch;
