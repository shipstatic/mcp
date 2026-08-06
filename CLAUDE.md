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
├── bin.ts        # THE EXECUTABLE (dist/bin.js) — env read, Ship construction, stdio transport
├── index.ts      # The LIBRARY entry — curated exports, no side effects
├── server.ts     # createServer(ship, {version, via}) — stdio's own upload tool + INSTRUCTIONS
├── tools.ts      # registerAccountTools() — the 14 tools identical on EVERY transport
├── call.ts       # createCall() — the result envelope + error mapping, parameterised by hints
└── vocabulary.ts # What BOTH transports say: annotations + shared param descriptions
```

## One product, two transports — the shape that survives OAuth

The hosted Streamable-HTTP server (`cloudflare/mcp`, private) is gaining OAuth,
after which **both transports offer the complete toolset for authenticated
callers and the anonymous deploy for everyone else**. The architecture is built
for that end state, not the one-tool present, because the alternative is that
someone copies fourteen tool definitions into a second repo — and the copy is
the moment two surfaces begin to drift.

**The 14 / 1 split is the product's own shape.** `deployments_upload` is the
anonymous door: the one operation needing no account, and the one whose INPUT
differs by transport (a filesystem path here, inline bytes there, because a
Worker has no filesystem). It also carries the Apps-SDK widget hosted-side. So
it is authored per transport. The other fourteen need an identity, and once a
transport has one, nothing about them depends on how bytes arrived — identical
names, schemas, prose and 1:1 SDK calls. They live in `tools.ts` and the hosted
side registers them with one call when OAuth lands.

**The catalogue is static; identity decides what SUCCEEDS.** All fifteen are
registered whether or not a credential is present. An anonymous caller sees
them and gets a typed authentication error naming how to authenticate *on this
transport* — which is exactly `createCall`'s one per-transport argument. The
alternative, a tool list that changes shape under the caller, is a second and
dynamic contract for an agent to track, and MCP clients cache catalogues.
Anonymous deploy remains the headline promise on both doors.

**What stays different forever**, and it is a short list: the upload input
schema, the Apps-SDK widget and its `outputSchema`, the `via` tag, and the
environment `domain`. Everything else either is shared today or converges when
OAuth lands (INSTRUCTIONS bodies, the auth hint, `idempotencyKey`).

**`bin.ts` is the executable; `index.ts` is a library.** Importing the package
has no side effects, which is what lets the hosted transport
(`cloudflare/mcp`, private) import this package's vocabulary rather than
re-authoring the strings an agent reads.

**Two consumers, not one — and the second one widened the export rule.** The
VS Code extension (`integrations/vscode`) bundles a stdio server into its
`.vsix`, so it wants stdio's composition verbatim. It used to get it by
REGEX-PATCHING this package's compiled `dist/` at bundle time: strip `bin`'s
shebang, and rewrite the `createRequire(import.meta.url)('../package.json')`
line inside `server.js` to inline a version literal. Every one of those hacks
broke on the 1.x library split — the runnable entry moved from `main` to
`bin`, and the version became a parameter — so a naive pin bump would have
built green and shipped a server that starts and does nothing.

`createServer` is therefore exported as of **1.0.0-beta.7**, and the rule in
`index.ts` reads "what a second CONSUMER needs" rather than "a second
TRANSPORT". It still only grows by deletion: the admission removed three
regexes in another repo's build in exchange for a fifteen-line entry point.
Two things stay true — `cloudflare/mcp` must keep authoring its own upload
tool (a filesystem-path input is a footgun for a Worker; that is now the
caller's judgement rather than an absence), and the export is safe for the
Worker graph only because `version` is an ARGUMENT, so no `node:module`
rides along.

**A `startStdio` was proposed and REJECTED (2026-08-06) — do not re-propose it
without reading this.** `bin.ts` and the extension's `mcp-entry.ts` are the
same five lines (construct `Ship`, `createServer`, connect a
`StdioServerTransport`, print the banner), which looks like exactly the
restatement an export should delete. It is not, for two reasons that only show
up when you try:

- **It cannot live in `index.ts`.** `@modelcontextprotocol/sdk`'s
  `server/stdio.js` imports `node:process`, so exporting the composition from
  the library entry puts a Node builtin in the graph the Workers-hosted
  transport imports — the exact invariant that makes `version` a parameter.
  Measured, not assumed; `worker-safety.test.ts` is now the fence. Shipping it
  anyway would mean a SECOND published entry point (`@shipstatic/mcp/stdio`),
  an `exports` map row, and a recorded exemption from that fence — more
  machinery than the five lines it deletes.
- **The hazard it was really aimed at is fenced elsewhere.** The argument for
  it was deleting the extension's direct `@modelcontextprotocol/sdk`
  dependency, whose version range must stay matched with this package's or
  esbuild bundles two SDK copies and `connect()` receives a transport from
  another realm. The extension's build now asserts single-copy resolution
  across both bundles, so that failure is caught at build time where it
  happens.

Two thin `main()` functions with different version sources and different
process policies are not a restatement of a rule. They are two executables.

Until 1.0.0-beta.2 they were one file — `main` and `bin` in `package.json`
both pointed at `index.ts`, so importing the package started a stdio server
and could `process.exit` in its consumer. Nothing could be shared because
there was nothing importable to share, and the two servers kept ten
user-visible strings equal by hand instead. They did not stay equal: a tool
description diverged unnoticed, a one-word correction had to be applied at
three sites, and the hosted test mock invented constraint numbers production
never used. `npm/ship` had already untied the same knot the same way (see its
CLAUDE.md, "`bin.ts` is the executable; `index.ts` is a library") — a module
boundary says the same thing to every caller.

**What is shared, and what is deliberately not**, lives in `vocabulary.ts`'s
header and in `cloudflare/mcp/CLAUDE.md`'s divergence table. The short form:
the two identifiers (`SERVER_NAME`, `UPLOAD_TOOL_NAME`), the annotations, the
deploy-param descriptions, the INSTRUCTIONS sentences, the upload-description
fragments and the public-deploy expiry are imported by both; the file-input
schema, the description bodies, and everything Apps-SDK are forced apart by the
transport and stay separate.

**The export list is the drift ledger, and it only grows by deletion.** Every
name in `index.ts` was a restatement somewhere before it was an export —
`SERVER_NAME` was two literals in two repos that an Apps host compares to each
other, `PUBLIC_EXPIRY` was the same duration written out eight times,
`DESCRIPTION_BLOCKS` were fragments with three copies each (both servers plus a
test literal that could only prove one of them matched itself), and
`createServer` was three regexes patching this package's compiled output in the
VS Code extension's bundler. Adding an export that deletes no restatement is
how a curated surface becomes a grab bag.

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

**The typed error contract reaches the agent — text authoritative, structure
beside it.** Taken in 1.0.0-beta.8, and it was the first of the two futures
this paragraph used to name.

`CallToolResult` carries text plus `isError`, so for most of this package's
life an agent saw prose alone: `status`, `ErrorType`, and every `details`
payload were dropped except the Validation arm's. The platform's own law is
that *clients branch on error type and status, never on message strings* — and
the agent, the consumer best equipped to obey it, was the only one that could
not. The recorded bite is a 429, whose `details.expires` died here, leaving the
caller most in need of a precise backoff to parse "try again in 9 minutes" out
of English. The hosted transport feels it hardest (a 5/hr per-caller anonymous
bucket).

`toErrorResult` now attaches `structuredContent: error.toResponse()` — the same
`ErrorResponse` the wire itself carries — on every ShipError arm. Three things
make that safe rather than a surface expansion:

- **The text is unchanged and stays the contract**, hints included. It has to
  be: the API authors its messages for the end user at the throw site
  (`cloudflare/api/CLAUDE.md`, "Message authoring law"), so a client that reads
  only prose still works. Structure rides BESIDE it, never instead.
- **The MCP SDK validates `structuredContent` only against a declared
  `outputSchema`, and returns early again when `isError` is set.** No tool here
  declares one, so this is additive for every client and invisible to any that
  does not look. Checked in the pinned SDK, not assumed.
- **It is deliberately NOT behind `CallOptions.structuredContent`.** That flag
  governs SUCCESS shapes, where the objection is fifteen hand-maintained zod
  twins. A failure has exactly one published shape on every transport.

A non-ShipError still answers text-only: there is no wire shape to report, and
inventing one would tell an agent the failure came from the platform.

### Dependency Injection

`bin.ts` owns the process: reads `SHIP_TOKEN` from the environment, constructs `new Ship({ token })`, passes it to `createServer(ship, { version })`. The factory never touches `process.env` or constructs its own dependencies. Tests pass a fake directly, and `tests/bin.test.ts` fences the split — `server.ts`, `call.ts`, `vocabulary.ts` and `index.ts` must contain no `process.env` read at all.

The **version** is an argument for the same reason: the executable knows its own manifest, a library must not assume it has one, and reading it inside `server.ts` would put `node:module` — a Node builtin — in the import graph of a module the Workers-hosted transport also loads.

### Credential Isolation

`SHIP_TOKEN` is **optional**. Without it, deployments go to the public account and expire in 3 days; with it, they go to the user's account permanently. The token is forwarded explicitly to the `Ship` constructor — and that's all MCP needs to do.

**One slot, any platform token.** Since ship 2.0 there is a single `token` option. The value's prefix says what it is — `ship-` API key, `deploy-` deploy token, anything else an opaque bearer — and the *server* classifies it. MCP never inspects or routes on the credential, which is why adding a new credential kind never requires a release here.

The SDK's strict-isolation contract (synchronous constructor, no filesystem reads, only documented `SHIP_*` env-var fallbacks) is what keeps embedded credentials predictable. See `npm/ship/CLAUDE.md` "Strict-isolation contract for embedded hosts" for the full rationale.

### Deployment Tracking

`deployments_upload` sets `via` — matching CLI's `via: 'cli'` for origin
tracking. It **defaults to `'mcp'` and is a `ServerOptions` field**, because
`via` names the DISTRIBUTION SURFACE rather than the protocol: the GitHub
Action reports `git` whatever invoked the workflow, and the web apps report
`web`. `bin.ts` passes nothing, because this executable IS the `mcp` origin.

The VS Code extension bundles `createServer` into its `.vsix` and passes
`'vsc'`. Without the parameter every agent-mode deploy from the editor reported
as generic `mcp`, indistinguishable from an npx install in some other client —
nobody decided that; the composition simply had nowhere to say otherwise.

## Testing

```bash
pnpm test --run     # the whole suite
pnpm coverage       # the same suite, plus the ratchet
pnpm typecheck      # tsc over src AND tests, 0 errors
pnpm lint           # biome, 0 warnings
pnpm smoke          # the PUBLISHED artifact, live — see below. Manual, never CI
```

```
tests/
├── architecture/
│   ├── test-integrity.test.ts   # fence: every test file reaches src/
│   ├── test-naming.test.ts      # fence: the layout law
│   └── worker-safety.test.ts    # fence: no node: builtin in the LIBRARY graph
├── fixtures/builders.ts         # the only fixture source — wire shapes, cited
├── mocks/ship.ts                # the one fake, typed against the SDK contract
├── harness.ts                   # real Client ↔ real server, InMemoryTransport
├── setup.ts                     # SHIP_* scrub + no-network guard
├── call.test.ts                 # call() → CallToolResult, every error arm
├── bin.test.ts                  # the process boundary + credential isolation
├── index.test.ts                # the PUBLIC SURFACE — curated exports, both directions
├── vocabulary.test.ts           # the shared values: numbers stay derived, CREATE withholds its hint
├── server.test.ts               # the tool CATALOGUE (tools/list, instructions)
└── server-calls.test.ts         # tool CALLS (wiring, payloads, claim, errors)
```

**Recorded mirror-axis exception: `src/tools.ts` has no `tools.test.ts`.** Its
fourteen tools are registered by `createServer` and therefore already pinned
where it matters — `server.test.ts` asserts every one of them in the catalogue
an agent reads, and `server-calls.test.ts` asserts every one of their SDK
wirings, both through the real protocol. A mirror file would have to
re-register them against a bare `McpServer` to say anything the two protocol
suites do not already say, which is a weaker assertion in a new place.

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
| `worker-safety.test.ts` | A `node:` builtin entering the graph `index.ts` exposes — which the Workers-hosted transport imports. It was proven only by that PRIVATE repo's build failing: late, elsewhere, and after a publish. Not hypothetical — the obvious next admission to the public surface was a `startStdio` composing the transport for consumers, and the MCP SDK's `server/stdio.js` imports `node:process`. It would have built green and published green. `bin.ts` is exempt by construction (unreachable from `index.ts`), and a second assertion proves the probe can SEE a builtin, so the first cannot pass vacuously. |
| the `ACCOUNT_TOOL_NAMES` comparison in `server.test.ts` | The exported name list drifting from the registrations it names. Both directions, through a real `tools/list`: a registration added without its name, a name without its registration, a typo in either. It is what lets the hosted transport state its expected catalogue as `[UPLOAD_TOOL_NAME, ...ACCOUNT_TOOL_NAMES]` instead of counting to fifteen in a second repo. |

**Recorded aspect splits** — one subject, more than one mirror file. The
naming fence fails the suite if a split is not named here by full basename.

| Module | Files | Why |
|---|---|---|
| `src/server.ts` | `server`, `server-calls` | Two separable contracts on one module. `server.test.ts` asserts the STATIC surface an agent reads before acting — `tools/list`, instructions, schemas — and is a pinned table. `server-calls.test.ts` asserts BEHAVIOUR: the 1:1 SDK wiring, pass-through payload fidelity, the anonymous claim story, and the error surfaces. A single file would mix a specification with a test suite. |

### `smoke.mjs` — the live gate, and the one thing the suite cannot be

`pnpm smoke` drives the **published** package over `npx`, against a real API,
through all fifteen tools. Manual and dev-only, like `cloudflare/api/smoke.mjs`
and `cloudflare/mcp/smoke.mjs`; deliberately **not** in `ci.yml`, which has
neither a live API nor a credential.

It exists because the suite is structurally blind to one whole class. The ship
fake is derived from the SDK's own interfaces, so it catches *signature* drift
at compile time and cannot, even in principle, catch the API answering
differently than those types promise. Published `0.6.0` is the recorded cost: it
pinned a ship that mints an agent token through an endpoint the 2.x API deleted,
so anonymous deploy — the headline feature — 404'd, and the suite was green
throughout and would have stayed green through any number of releases.

Four properties, each load-bearing:

- **The published artifact, not the checkout.** `npx -y @shipstatic/mcp@<v>`.
  A local `node dist/bin.js` proves your tree works; what ships is the tarball
  with its own resolved dependency tree, and that resolution is where 0.6.0
  broke. The version defaults to this repo's `package.json`, so run after a
  publish it asserts *what I am is what the registry serves* — and the exact pin
  defeats a stale npx cache.
- **Refusals skip, they never fail.** No `SHIP_TOKEN` runs the anonymous half
  alone; a token for another environment says so; a plan without custom domains
  skips the domain block. Every skip names what went unverified and exits 0 —
  an unprovable half is "not verified", never "failed".
- **Two processes, because the credential is process-scoped.** `bin.ts` reads
  `SHIP_TOKEN` once at construction, so anonymous and authenticated cannot be
  two calls. Every `SHIP_*` is scrubbed from the child's environment and only
  the two the run means to set are put back — an exported credential would
  otherwise authenticate the "no token" half, and an exported `SHIP_VIA` would
  falsify the origin-tracking assertion.
- **No hostname in tracked source.** This repo is public: the API URL arrives
  from `--api=` or `SHIP_API_URL` and defaults to the SDK's own `DEFAULT_API`.
  Excluded from the tarball by `files` — confirm with `npm pack --dry-run`
  rather than assuming.

## Publishing

The CI workflow (`.github/workflows/ci.yml`) runs on pushes to `main` and `development`. The guarded publish step publishes to npm only when `package.json` holds a version not yet on the registry, with the dist-tag derived from the version (`-` suffix → `beta`, else `latest`). The MCP Registry publish is **stable-only** — the registry has no channel concept, so betas live on npm's `beta` dist-tag alone. `package.json` is the single source of truth for the version — CI patches both `.version` and `.packages[0].version` in `server.json` with `jq` before registry publish. **The version in the tracked `server.json` is therefore a placeholder and is stale on purpose** (it reads `0.2.0`); never run `mcp-publisher publish` by hand from a checkout, which would register that literal. DNS authentication uses an Ed25519 key on `shipstatic.com`.

**`server.json`** — MCP Registry metadata. `mcpName` in `package.json` must match `name` in `server.json` (`com.shipstatic/mcp`).

## Adding New Tools

An account-tied tool is a tool **both transports get**, so it goes in the
shared file, not this server's:

1. Add `server.registerTool()` in **`tools.ts`**, and its name to
   `ACCOUNT_TOOL_NAMES` — the comparison in `server.test.ts` fails until both
   exist, in either order.
2. Handler is a one-liner: `(args) => call(() => ship.resource.action(args))`
3. Pin the new tool in `server.test.ts`'s `CATALOGUE` and its SDK wiring in
   `server-calls.test.ts`. Add the live assertion to `smoke.mjs` — the matrix
   is "all fifteen tools" precisely so a tool no run has ever invoked cannot
   exist.

`server.ts` is for the one tool this transport authors for itself
(`deployments_upload`, whose input is a filesystem path). Adding an account tool
there instead would give the hosted door fourteen tools and this one fifteen.

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
