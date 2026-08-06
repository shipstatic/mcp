# CLAUDE.md

Claude Code instructions for the **ShipStatic MCP Server**.

**@shipstatic/mcp** — MCP server that exposes the ShipStatic SDK to AI agents via stdio. Thin wrapper over `@shipstatic/ship`. Published to the MCP Registry as `com.shipstatic/mcp`. **Maturity:** v1.0.x — Deployments + Domains (15 tools).

**The version says which platform it speaks to: the 1.x MCP is the one that speaks to the 2.x platform.** 1.0.0 is a true major for consumers — `SHIP_API_KEY` is no longer read (every existing server config breaks until its env var is renamed) and the delete tools were renamed (`deployments_remove` → `deployments_delete`, `domains_remove` → `domains_delete`), so a saved agent workflow naming the old tool stops resolving.

A **hosted Streamable-HTTP variant** lives at `https://mcp.shipstatic.com`, registered alongside this package under the same `com.shipstatic/mcp` registry entry (see `server.json` `remotes`). Source: `cloudflare/mcp/` in the monorepo. The hosted variant exposes only `deployments_upload` (anonymous-only). The user-facing strings — tool description, INSTRUCTIONS — must stay coordinated where they overlap; the hosted side documents the divergence boundaries.

## README positioning (public docs)

`README.md` ships to npm, Glama, and the MCP Registry. From the reader's perspective, **ShipStatic MCP is one product with two ways to use it**: the hosted endpoint (no install) and this package (full toolset). The README leads with hosted, presents the local install as the "want more" upgrade, and never reveals that the hosted variant lives in a separate, private repo (`cloudflare/mcp/`).

Voice mirrors the marketing site — keep these phrases verbatim when editing:

- Slogan: **"One URL. Your agent ships."**
- Action: **"Drop `https://mcp.shipstatic.com` into any MCP client."**
- Qualifier: **"No install, no signup, no API key."**
- Upgrade: **"Install this package for the full toolset (custom domains, listing, account-tied ops)."**

Do not surface in the README:
- That the hosted endpoint is a separate Worker / different codebase
- Implementation details (transport names, base64 file encoding, defensive caps, etc.)
- Anything about the `cloudflare/mcp/` repo

Keep the public surface coherent: one ShipStatic MCP, two doors in.

## Architecture

```
src/
├── index.ts     # Entry: env validation, Ship construction, stdio transport
├── server.ts    # createServer(ship) — pure factory, all 15 tools
└── call.ts      # call() wrapper + error mapping
```

## Quick Reference

```bash
pnpm build          # TypeScript → dist/
pnpm test --run     # All tests
```

## Core Patterns

### SDK Wrapper — No Business Logic

Every MCP tool maps 1:1 to a single `@shipstatic/ship` SDK method. The MCP layer handles only:
- Tool registration (name, schema, description)
- Response formatting (`call()` — JSON.stringify for data, "Done." for void)
- Error mapping (ShipError → `{ content, isError: true }` with auth hints)

No HTTP calls, no auth logic, no domain validation. The SDK handles everything.

### Tool Naming

`resource_action` — matches SDK's `ship.resource.action()` and CLI's `ship resource action`.

**One recorded exception: `whoami`.** It reads the account, so the law would
spell it `account_get` — but the CLI and SDK both surface this as `whoami`, and
a tool named for the word a user already knows beats one named for the rule.
The exception is the parity, not an oversight; every other tool obeys.

### `call()` — The Single Abstraction

Every tool handler is a one-liner that delegates to the SDK through `call()`:

```typescript
server.registerTool('deployments_get', {
  description: 'Get deployment details including URL, status, file count, size, labels, and password protection state.',
  annotations: READ,
  inputSchema: {
    deployment: z.string().describe('Deployment hostname (e.g. "happy-cat-abc1234.shipstatic.com"). Returned by deployments_upload or deployments_list.'),
  },
}, ({ deployment }) => call(() => ship.deployments.get(deployment)));
```

`call()` handles try/catch, JSON serialization, void→"Done.", and ShipError→MCP error conversion.

**The typed error contract terminates here, and that is the protocol's shape
rather than a bug.** `CallToolResult` carries text plus `isError`, so an agent
sees prose: `status`, `ErrorType`, and every `details` payload are dropped
except the Validation arm's, which is appended as text. A 429's
`details.expires` and its `Retry-After` header do not survive, so the caller
most in need of a precise backoff gets "try again in 9 minutes" and must read
English. This is survivable **only because the API's message law makes the
prose authoritative** — the wire message is authored for the end user at the
throw site (`cloudflare/api/CLAUDE.md`, "Message authoring law"), so it always
contains what the agent needs.

Recorded so nobody "fixes" it by rewording a message — the message is not the
problem. Two real futures if it ever bites: carry the machine-readable payload
in `structuredContent` on error results, or accept the prose permanently. The
hosted transport feels this hardest (a 5/hr per-caller anonymous bucket), and
it is the transport that already has `structuredContent` — see
`cloudflare/mcp/CLAUDE.md` for why adopting it here is a surface-wide call.

### Dependency Injection

`index.ts` owns the process: reads `SHIP_TOKEN` from the environment, constructs `new Ship({ token })`, passes it to `createServer(ship)`. The factory never touches `process.env` or constructs its own dependencies. Tests pass a fake directly, and `tests/index.test.ts` fences the split — `server.ts` and `call.ts` must contain no `process.env` read at all.

### Credential Isolation

`SHIP_TOKEN` is **optional**. Without it, deployments go to the public account and expire in 3 days; with it, they go to the user's account permanently. The token is forwarded explicitly to the `Ship` constructor — and that's all MCP needs to do.

**One slot, any platform token.** Since ship 2.0 there is a single `token` option. The value's prefix says what it is — `ship-` API key, `deploy-` deploy token, anything else an opaque bearer — and the *server* classifies it. MCP never inspects or routes on the credential, which is why adding a new credential kind never requires a release here.

The SDK's strict-isolation contract (synchronous constructor, no filesystem reads, only documented `SHIP_*` env-var fallbacks) is what keeps embedded credentials predictable. See `npm/ship/CLAUDE.md` "Strict-isolation contract for embedded hosts" for the full rationale.

### Deployment Tracking

`deployments_upload` sets `via: 'mcp'` — matching CLI's `via: 'cli'` for origin tracking.

## Testing

```bash
pnpm test --run     # the whole suite
pnpm coverage       # the same suite, plus the ratchet
pnpm typecheck      # tsc over src AND tests, 0 errors
pnpm lint           # biome, 0 warnings
```

```
tests/
├── architecture/
│   ├── test-integrity.test.ts   # fence: every test file reaches src/
│   └── test-naming.test.ts      # fence: the layout law
├── fixtures/builders.ts         # the only fixture source — wire shapes, cited
├── mocks/ship.ts                # the one fake, typed against the SDK contract
├── harness.ts                   # real Client ↔ real server, InMemoryTransport
├── setup.ts                     # SHIP_* scrub + no-network guard
├── call.test.ts                 # call() → CallToolResult, every error arm
├── index.test.ts                # the process boundary + credential isolation
├── server.test.ts               # the tool CATALOGUE (tools/list, instructions)
└── server-calls.test.ts         # tool CALLS (wiring, payloads, claim, errors)
```

**Tests run through the protocol.** A real `Client` drives the real server
over `InMemoryTransport.createLinkedPair()`. Nothing pokes a handler
function directly — that was the previous design, and under it zod never ran,
`tools/list` was never issued, and the wire format was never exercised. If a
test cannot be expressed as something an MCP client does, it is testing the
wrong thing.

**The catalogue is the product.** An agent's entire understanding of
ShipStatic is the `initialize` instructions plus one `tools/list` response.
`server.test.ts` pins that response exactly — names, descriptions, JSON
Schema, required fields, annotations. A reworded description turns it red on
purpose; the fix is to accept the new wording in the pinned catalogue, which
makes every copy change a decision.

**One fake, at one boundary.** `tests/mocks/ship.ts` is the only mock. Its
methods are parameterised by the real resource interfaces
(`vi.fn<DeploymentResource['upload']>()`), so a wrong-shaped
`mockResolvedValue` is a compile error, and an SDK signature change breaks
`pnpm typecheck` in one file. Ship 2.0's injectable `fetch` makes a real
`Ship` over a wire-truth handler *possible*, and it is still declined on
purpose — MCP would then maintain a second, undetected-drift twin of
`cloudflare/api` to re-prove what ship's suite already proves. The full
reasoning is in that file's header; don't re-litigate it from the tooling
alone.

**`tests/**` is typechecked.** `pnpm typecheck` runs `tsconfig.check.json`
over `src` and `tests` together. Load-bearing: vitest transpiles through
esbuild WITHOUT checking types, and the predecessor config
(`tsconfig.test.json`) was wired into no script or hook — it had 9 errors
sitting in it, and under that gap the ship fake was `as any` with five return
shapes the API cannot produce.

**Hermeticity.** `tests/setup.ts` scrubs every `SHIP_*` variable (a
developer's exported credential would otherwise authenticate the "no key
configured" assertions) and wraps `fetch` to throw on any non-loopback host
(the SDK's default API URL is production).

| Fence | Catches |
|---|---|
| `test-integrity.test.ts` | A test file reaching NO production code — the tautology class. Acute here, where most assertions are about strings: a file asserting its own constants looks exactly like a test of the tool surface. Reach resolves transitively through `harness.ts`/`mocks/`, but importing only `fixtures/builders` does not count. |
| the `ErrorType` sweep in `call.test.ts` | An error arm nobody thought about. It enumerates `Object.values(ErrorType)` rather than a hand-written list, so "exhaustive" is derived from types, not claimed in prose. Coverage is blind to this class: `handleError` has three branches, so six arms exercise them all and the other five sit untested at 100% — which is how a transport failure moving from `internal_server_error` to `network_error` reached agents unasserted. Bidirectional: a hint added to `call.ts` without recording it in `HINTED` turns the arm red, and a hint removed turns it red too. |
| `test-naming.test.ts` | Layout drift: a filename describing the test instead of its subject, a mirror file with no `src/` counterpart, an aspect split not recorded below. |
| `coverage.thresholds` | Coverage decay. 100/100/100/100 — MCP has no in-process-unreachable corner, so the bar is the ceiling and an untested new tool fails the run. |

**Recorded aspect splits** — one subject, more than one mirror file. The
naming fence fails the suite if a split is not named here by full basename.

| Module | Files | Why |
|---|---|---|
| `src/server.ts` | `server`, `server-calls` | Two separable contracts on one module. `server.test.ts` asserts the STATIC surface an agent reads before acting — `tools/list`, instructions, schemas — and is a pinned table. `server-calls.test.ts` asserts BEHAVIOUR: the 1:1 SDK wiring, pass-through payload fidelity, the anonymous claim story, and the error surfaces. A single file would mix a specification with a test suite. |

## Publishing

The CI workflow (`.github/workflows/ci.yml`) runs on pushes to `main` and `development`. The guarded publish step publishes to npm only when `package.json` holds a version not yet on the registry, with the dist-tag derived from the version (`-` suffix → `beta`, else `latest`). The MCP Registry publish is **stable-only** — the registry has no channel concept, so betas live on npm's `beta` dist-tag alone. `package.json` is the single source of truth for the version — CI patches both `.version` and `.packages[0].version` in `server.json` with `jq` before registry publish. **The version in the tracked `server.json` is therefore a placeholder and is stale on purpose** (it reads `0.2.0`); never run `mcp-publisher publish` by hand from a checkout, which would register that literal. DNS authentication uses an Ed25519 key on `shipstatic.com`.

**`server.json`** — MCP Registry metadata. `mcpName` in `package.json` must match `name` in `server.json` (`com.shipstatic/mcp`).

## Adding New Tools

1. Add `server.registerTool()` in `server.ts`
2. Handler is a one-liner: `(args) => call(() => ship.resource.action(args))`
3. Add wiring test in `server.test.ts`

## User Configuration

```json
{
  "mcpServers": {
    "shipstatic": {
      "command": "npx",
      "args": ["@shipstatic/mcp"],
      "env": { "SHIP_TOKEN": "ship-..." }
    }
  }
}
```

## Option Completeness

**Every SDK option an agent could meaningfully choose is exposed, and every
absence is a recorded decision.** That is the standing bar — when the SDK
grows an option, it belongs here unless a line below says otherwise.

**Pagination — taken 2026-08-06.** Both list tools accept `{limit, cursor}`
and pass them straight through. The contract an agent must learn is taught in
the schema itself: `cursor` is an opaque position from the previous response,
omitted for the first page, and **`cursor: null` is the entire has-more
signal** — there is no `total` and no boolean, because a count is an aggregate
over a collection, not a property of a page.

**The MCP states no page-size cap**, in the schema or the prose. The API
clamps an unusable `limit` server-side and owns that number; restating it here
would give one fact two owners and let them drift. `min(1)` is not a cap — it
rejects a value that could never mean anything. (`PAGINATION_INPUT` in
`src/server.ts` is one shared shape for both tools, because it is one contract
rather than two.)

**Idempotency — taken 2026-08-06.** `deployments_upload` accepts
`idempotencyKey`. A deploy is not naturally idempotent, and **agents are the
audience**: a human notices a duplicate deployment, an automated retry does
not. The `describe()` teaches the law — key the ATTEMPT (a run id, a commit
sha, a uuid minted before the first try), never the try. MCP never mints,
derives or normalizes the key; a key the agent did not choose cannot identify
the agent's attempt.

**No `tokens_*` tools — recorded, do not add without a new product call.** The
SDK has `tokens.get`/`tokens.list`/`tokens.create`; this server exposes none.
An MCP server's credential is *configured by the human* in the server config,
never minted by the agent that would then hold it. Same shape as web/my's
"deploy tokens are CLI-only" and the SDK's own `/activities` absence.

**A labels tool stays an open product call.** The SDK has `GET /labels`; no
tool exposes it. Unlike `tokens_*` this is undecided rather than closed —
decide before wiring.

**No `ping` tool — decided, not overlooked.** `ship.ping()` exists. An agent's
*next tool call is already the reachability probe*: a tool answering "the
server is up" spends a turn to learn what the following turn tells you anyway,
and if the platform is down the real call fails with a `network_error` the
agent can act on. A probe earns its place when a caller must decide whether to
proceed; an agent has nothing else to do with the answer.

**No `getLimits` tool — decided, not overlooked.** `ship.getLimits()` exists,
and the platform teaches its caps *reactively*: an over-cap deploy fails with a
validation error naming the limit, which reaches the agent as actionable text
(the same mechanism that surfaced "Labels must be at least 3 characters long"
during live verification). A proactive lookup would buy a round trip and a
second number to keep true. The SDK already fetches dynamic limits for its own
client-side pre-validation, so the agent gets that protection without a tool.

**Deliberately not agent knobs.** `signal` (a process-level cancellation
concern), `pathDetect` / `spaDetect` (local-detection defaults). These are not
absences to close.

---

*This file provides Claude Code guidance. User-facing documentation lives in README.md.*
