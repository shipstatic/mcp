import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiKey, deployToken } from './fixtures/builders';

/**
 * @file The process boundary — `src/bin.ts`.
 *
 * This file had NO coverage before 2026-07-27, which meant the entire
 * credential-isolation doctrine was untested: the one line that decides which
 * identity every deployment lands under had nothing asserting it.
 *
 * The doctrine (`integrations/mcp/CLAUDE.md`, "Credential Isolation" and
 * "Dependency Injection") is a division of labour:
 *
 *   - `index.ts` owns the process. It reads the environment ONCE, forwards
 *     what it finds to the `Ship` constructor, and connects stdio.
 *   - `server.ts` and `call.ts` own no process state. They receive a
 *     constructed client and never reach for a credential themselves.
 *
 * That split is what makes an embedded MCP server predictable: the host's
 * environment cannot leak a credential in through a side door, because there
 * is exactly one door and it is in this file.
 *
 * **Recorded module mocks.** `bin.ts` calls `main()` at module scope and
 * owns real stdio — it cannot be driven any other way, so two collaborators
 * are replaced: the `Ship` constructor (to observe what it receives) and
 * `StdioServerTransport` (which would otherwise bind this process's stdin and
 * write JSON-RPC frames into the test runner's stdout). The stdio stand-in is
 * the SDK's own `InMemoryTransport`, not a hand-rolled fake, so the server
 * still performs a real connect.
 */

const mocks = vi.hoisted(() => ({
  shipConstructed: vi.fn<(options: unknown) => void>(),
  stdioConstructed: vi.fn<() => void>(),
  /** Set by a test to make construction fail, exercising the fatal path. */
  constructorError: null as Error | null,
}));

vi.mock('@shipstatic/ship', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@shipstatic/ship')>();
  class MockShip {
    constructor(options: unknown) {
      mocks.shipConstructed(options);
      if (mocks.constructorError) throw mocks.constructorError;
    }
  }
  // Everything else stays real — `server.ts` imports LABEL_CONSTRAINTS and
  // PASSWORD_CONSTRAINTS from here, and stubbing those would silently change
  // the tool descriptions this suite pins elsewhere.
  return { ...actual, default: MockShip, Ship: MockShip };
});

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', async () => {
  const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
  return {
    StdioServerTransport: class extends InMemoryTransport {
      constructor() {
        super();
        mocks.stdioConstructed();
      }
    },
  };
});

/** Re-executes `src/bin.ts` from scratch and waits for `main()` to settle. */
async function boot(): Promise<void> {
  vi.resetModules();
  await import('../src/bin.js');
  await vi.waitFor(() =>
    expect(
      mocks.stdioConstructed.mock.calls.length + (mocks.constructorError ? 1 : 0),
    ).toBeGreaterThan(0),
  );
}

/** The options object handed to `new Ship(...)` on the most recent boot. */
const constructedWith = () => mocks.shipConstructed.mock.calls.at(-1)?.[0];

describe('credential isolation', () => {
  beforeEach(() => {
    mocks.constructorError = null;
    // `tests/setup.ts` has already scrubbed every SHIP_* variable, so each
    // test starts from a genuinely unconfigured host.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    delete process.env.SHIP_TOKEN;
  });

  it('forwards a configured SHIP_TOKEN to the Ship constructor', async () => {
    const token = apiKey('a');
    process.env.SHIP_TOKEN = token;

    await boot();

    expect(constructedWith()).toEqual({ token });
  });

  it.each([
    ['an API key', apiKey('a')],
    ['a deploy token', deployToken('b')],
    ['an opaque bearer', 'ya29.a0AfH6SMBexample-oauth-access-token'],
  ])('forwards %s unchanged — MCP never classifies the credential', async (_kind, token) => {
    // One slot, any platform token. The value's PREFIX says what it is and the
    // server classifies it; a client that tried to route by kind would have to
    // be redeployed every time the platform learned a new one.
    process.env.SHIP_TOKEN = token;

    await boot();

    expect(constructedWith()).toEqual({ token });
  });

  it('constructs an anonymous client when no token is configured', async () => {
    await boot();

    // `{ token: undefined }`, not `{}` — the variable is read unconditionally
    // and forwarded as whatever it is. Anonymous deploys are a first-class
    // mode here, not an error path: they are the product's headline promise.
    expect(constructedWith()).toEqual({ token: undefined });
  });

  it('forwards an empty SHIP_TOKEN verbatim rather than guessing', async () => {
    // Empty is what shell expansion of an unset variable produces in CI and
    // Docker. `index.ts` deliberately does not special-case it: the SDK
    // coerces empty to absent (its own contract, proved in ship's suite), so
    // a branch here would be a second, divergent opinion about credentials.
    process.env.SHIP_TOKEN = '';

    await boot();

    expect(constructedWith()).toEqual({ token: '' });
  });

  it('passes no other option — the client gets a credential and nothing else', async () => {
    process.env.SHIP_TOKEN = apiKey('b');

    await boot();

    // Notably no `apiUrl`, and no `session`. An MCP server that let its host
    // redirect the API would ship a user's files somewhere they did not
    // choose; the SDK's own documented `SHIP_API_URL` fallback is the host's
    // decision to make, not one MCP re-implements.
    expect(Object.keys(constructedWith() as object)).toEqual(['token']);
  });

  it('reads the environment exactly once, at construction', async () => {
    process.env.SHIP_TOKEN = apiKey('c');

    await boot();

    expect(mocks.shipConstructed).toHaveBeenCalledTimes(1);
  });

  it('no module below the process boundary reaches for the environment', async () => {
    // The other half of the dependency-injection doctrine. `createServer` is a
    // pure factory over an injected client; if it — or `call()` — grew a
    // `process.env` read, credentials would have two sources of truth and the
    // tests above would stop describing the whole story.
    const sourceOf = (file: string) =>
      readFileSync(fileURLToPath(new URL(`../src/${file}`, import.meta.url)), 'utf8');

    for (const file of ['server.ts', 'call.ts', 'vocabulary.ts', 'index.ts']) {
      expect(sourceOf(file), file).not.toMatch(/process\.env/);
    }

    // …and the boundary itself does read it, so this fence cannot pass by
    // the environment simply never being consulted anywhere. The key derives
    // from `SHIP_ENV` (types 2.5.0-beta.21) — the SDK's own statement of its
    // ambient pair — matching ship's `readEnvConfig` and the extension's
    // `mcp-entry.ts`, so the pattern pins the derived read, not a literal.
    expect(sourceOf('bin.ts')).toMatch(/process\.env\[SHIP_ENV\.TOKEN\]/);
  });
});

describe('stdio startup', () => {
  beforeEach(() => {
    mocks.constructorError = null;
  });

  it('connects the server over a stdio transport', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await boot();

    expect(mocks.stdioConstructed).toHaveBeenCalledTimes(1);
  });

  it('announces readiness on stderr, never on stdout', async () => {
    // Load-bearing for a stdio MCP server: stdout IS the JSON-RPC channel. A
    // single `console.log` anywhere in the startup path emits a non-frame line
    // into it and every client fails to parse the session.
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await boot();

    expect(error).toHaveBeenCalledWith('ShipStatic MCP Server running on stdio');
    expect(log).not.toHaveBeenCalled();
  });

  it('reports a startup failure on stderr and exits non-zero', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    mocks.constructorError = new Error('boom');

    await boot();
    await vi.waitFor(() => expect(exit).toHaveBeenCalled());

    expect(error).toHaveBeenCalledWith('Fatal error:', mocks.constructorError);
    expect(exit).toHaveBeenCalledWith(1);
    // The banner must NOT appear — a server that failed to start must not
    // claim it is running.
    expect(error).not.toHaveBeenCalledWith('ShipStatic MCP Server running on stdio');
  });
});
