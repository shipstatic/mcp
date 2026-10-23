# CLAUDE.md

Claude Code instructions for the **ShipStatic MCP Server**.

**@shipstatic/mcp** is the MCP server that exposes the ShipStatic SDK to AI agents via stdio, a thin wrapper over `@shipstatic/ship`. This repo also publishes the MCP Registry entry `com.shipstatic/mcp`, which names the hosted server alone (see "The registry entry names the hosted server" below). **Maturity:** v2.x, Deployments + Domains (15 tools).

**The version says which platform it speaks to: the 2.x MCP speaks to the 3.x platform.** A major is a true major for consumers: a renamed tool, a credential variable no longer read, or a changed meaning in a field an agent branches on (a described `z.string()` refuses nothing at the schema boundary, so a changed word breaks workflows silently). Each major's breaks are listed here:

- **2.0.0: `Domain.status` means the domain's standing** (`live`, `unlinked`, `unverified`, `paused`), not the DNS enum (`pending`, `partial`, `success`); the DNS fact is the `verification` field beside it. A workflow branching on `"success"` stops matching, silently, because `DomainStatusSchema` is a described `z.string()`.
- **1.0.0: `SHIP_API_KEY` is no longer read**, and the delete tools were renamed (`deployments_remove` → `deployments_delete`, `domains_remove` → `domains_delete`).

A **hosted Streamable-HTTP variant** lives at `https://mcp.shipstatic.com` (the hosted transport), and it is what the registry entry lists (`server.json` `remotes`). It serves the same fifteen tools: `deployments_upload` to anyone, the other fourteen to an OAuth-connected caller. The user-facing strings must stay coordinated where they overlap; this package's vocabulary is how.

## README positioning (public docs)

`README.md` ships to npm, Glama and the MCP Registry. To the reader, **ShipStatic MCP is one product whose door is the hosted endpoint**, with this package as the local alternative for a different NEED, never a bigger feature set.

**The README tells the hosted story first and whole**: add the URL, ask, connect for more, the tools. The local server is a short note at the end, "Run it on your own machine". A folder on disk is the CLI's job, so the note sends that reader to the CLI. **An anchor phrase that states a CAPABILITY has a shelf life; one that states a NEED does not.**

The anchors are owned by the brand canon. Keep them verbatim here; a change to one is a change to the canon, never a local edit:

- Slogan: **"One URL. Your agent ships."**
- Action: **"Drop `https://mcp.shipstatic.com` into any MCP client."**
- Qualifier: **"No install, no signup, no API key."**
- The two doors: **"the same fifteen tools, reached the other way"**, and the local door's reasons are a NEED, never a capability: a folder on your own machine, a token configured once instead of a sign-in, a client that doesn't speak OAuth yet.

The counts are fenced: `tests/architecture/docs-contract.test.ts` derives both from `ACCOUNT_TOOL_NAMES`, so a sixteenth tool turns the README red until the prose follows. The platform's prose vocabulary check holds the retired spellings ("Single tool", "Anonymous-only", "exposes `deployments_upload` only") on every published surface.

Do not surface in the README:
- That the hosted endpoint is a separate codebase or runs anywhere in particular
- Implementation details (transport names, base64 file encoding, defensive caps, etc.)

Keep the public surface coherent: one ShipStatic MCP, two doors in.

## Architecture

```
src/
├── bin.ts        # THE EXECUTABLE (dist/bin.js): env read, Ship construction, stdio transport
├── index.ts      # The LIBRARY entry: curated exports, no side effects
├── server.ts     # createServer(ship, {version, via}): stdio's own upload tool + INSTRUCTIONS
├── tools.ts      # TOOLS (the registry: one row per tool) + registerAccountTools(), the 14 identical on EVERY transport
├── call.ts       # createCall(): the result envelope + error mapping, parameterised by hints
└── vocabulary.ts # What BOTH transports say: annotate() + shared param descriptions
```

## One product, two transports

**The 14 / 1 split is the product's own shape.** `deployments_upload` is the
anonymous door: the one operation needing no account, and the one whose INPUT
differs by transport (a filesystem path here, inline bytes there, because the
hosted transport has no filesystem). It also carries the Apps-SDK widget on the
hosted side. So it is authored per transport. The other fourteen need an
identity, and nothing about them depends on how bytes arrived: identical names,
schemas, prose and 1:1 SDK calls. They live in `tools.ts`, and the hosted
transport registers them with one call.

**The catalogue is static; identity decides what SUCCEEDS.** All fifteen are
registered whether or not a credential is present. An anonymous caller sees
them and gets a typed authentication error naming how to authenticate *on this
transport*, which is `createCall`'s one per-transport argument. A tool list that
changes shape under the caller is a second, dynamic contract, and MCP clients
cache catalogues.

**What stays different forever** is a short list: the upload input schema, the
Apps-SDK widget and its `outputSchema`, the `via` tag, and the environment
`domain`. Everything else is shared or converges; the description bodies stay apart for the reason below.

**`bin.ts` is the executable; `index.ts` is a library.** Importing the package
has no side effects, which is what lets the hosted transport import this
package's vocabulary rather than re-author the strings an agent reads.

The docblocks say it, `tests/index.test.ts` proves it, and
**`sideEffects: ["./dist/bin.js"]` in `package.json` declares it**, exactly
one entry because exactly one module runs on import. Without the field a
bundler must assume every re-exported module matters, so a host importing one
vocabulary string drags the whole MCP SDK along (+142KB in the VS Code
extension's host bundle). The surface ledger pins the field verbatim, and a
bare `false` is refused: claiming inertness for `bin.js` too is one refactor
away from a bundler dropping the executable's body.

**Two consumers, and the second one set the export rule.** The VS Code
extension (the `shipstatic/vscode` repo) bundles a stdio server into its `.vsix` by
composing `createServer` in its own entry point. So the rule in `index.ts`
reads "what a second CONSUMER needs", not "a second TRANSPORT", and it still
grows only by deletion. Two things stay true: the hosted transport authors its
own upload tool (a filesystem-path input is a footgun there), and the export is
safe for the hosted graph only because `version` is an ARGUMENT, so no
`node:module` rides along.

**A `startStdio` composing the transport is REFUSED.** `bin.ts` and the
extension's `mcp-entry.ts` are the same five lines, which looks like a
restatement an export should delete. It is not:

- **It cannot live in `index.ts`.** `@modelcontextprotocol/sdk`'s
  `server/stdio.js` imports `node:process`, so the library entry would put a
  Node builtin in the graph the hosted transport imports. `worker-safety.test.ts`
  is the fence. Shipping it anyway needs a second published entry point
  (`@shipstatic/mcp/stdio`), an `exports` row and an exemption from that fence:
  more machinery than five lines.
- **The hazard it aimed at is fenced elsewhere.** The extension's direct SDK
  dependency must match this package's range or esbuild bundles two SDK
  copies; the extension's build asserts single-copy resolution.

Two thin `main()` functions with different version sources are two
executables, not a restatement.

**What is shared, and what is deliberately not**, lives in `vocabulary.ts`'s
header. The short form: the two identifiers (`SERVER_NAME`,
`UPLOAD_TOOL_NAME`), who the server is (`SERVER_INFO`), the registry and
`annotate`, the deploy-param descriptions, the INSTRUCTIONS sentences, the
upload-description fragments and the public-deploy expiry are imported by both;
the file-input schema, the description bodies and everything Apps-SDK are
forced apart by the transport.

**The export list is the drift ledger, and it only grows by deletion.** Every
name in `index.ts` replaced a restatement: two literals in two repos, a
duration written out several times, fragments copied into both servers, a
build patch in a consumer. `SERVER_INFO` is who the server says it is at
connect (title, description, website, icons), and the registry entry's
identity fields are held to it by the docs contract. Adding an export that
deletes no restatement is how a curated surface becomes a grab bag.

## Quick Reference

```bash
pnpm build          # TypeScript → dist/
pnpm test --run     # All tests
pnpm check:package  # publint + attw over the built artifact
```

**`check:package` ignores one attw rule, by decision.** This package is
ESM-only, so a CJS consumer produces `CJSResolvesToESM` by construction; the
`engines.node >=20.19.0` floor is exactly where `require(esm)` was backported.

## Core Patterns

### SDK Wrapper — No Business Logic

Every MCP tool maps 1:1 to a single `@shipstatic/ship` SDK method. The MCP layer handles only:
- Tool registration (name, schema, description)
- Response formatting (`call()`: JSON.stringify for data, "Done." for void)
- Error mapping (ShipError → `{ content, isError: true }` with hints)

Three arms earn a hint, and they split on ONE question: does the text differ
per transport? The two credential arms (authentication, forbidden) do, so they
are `ErrorHints` arguments: stdio can name the environment variable it owns and
the hosted endpoint cannot. **Maintenance does not**, so it is a module
constant, `MAINTENANCE_HINT`, which the hosted transport inherits. It also does
NOT notify `onAuthFailure`: a maintenance window is not a credential problem,
and a 401 challenge would send a client round a consent flow against a door
closed for everyone.

No HTTP calls, no auth logic, no domain validation. The SDK handles everything.

### Tool Naming

`resource_action` matches the SDK's `ship.resource.action()` and the CLI's `ship resource action`.

**One recorded exception: `whoami`.** The law would spell it `account_get`,
but the CLI and SDK both surface `whoami`, and the word a user already knows
beats the rule. Every other tool obeys.

### The registry: one row per tool, everything else derived

`TOOLS` in `tools.ts` is the one owner of what is true of a tool on the
three axes a host reads: `auth` (`optional` works without an account),
`mutation` (`none` | `add` | `replace` | `remove`) and `reach` (`account` |
`public`). Fifteen rows, upload included even though each transport authors
that registration: its INPUT differs per transport, its contract does not.
`annotate(row)` is every registration's `annotations`; `ACCOUNT_TOOL_NAMES` is
the rows whose `auth` is `required`, and the hosted door reads the same column
for `securitySchemes` and its challenge scope; the ChatGPT listing's preflight
holds the live door to the hints the rows produce. Never annotate a tool by
hand or keep a second name list.

**What `annotate` promises, and what it withholds.** `readOnlyHint` is
`mutation === 'none'`; `destructiveHint` is a replace or a remove (the spec's
"not additive"); `openWorldHint` is `reach === 'public'`, read by hosts as
"changes public internet state" (a deploy, a domain link, a verification, both
deletes), never "reaches a remote API". `idempotentHint` is promised ONLY for a
remove, where a repeat does nothing further (both deletes are fenced in the
API: a repeat neither flips state nor writes an audit row). A replace writes an
activity row per call and `domains_set` may enqueue DNS work, so it is not
claimed; an add creates on every call, and `idempotencyKey` cannot rescue the
claim because it is per-CALL while the hint is static; reads carry none because
the spec defines the hint only for mutating tools.

`domains_set` stays one tool with the conservative destructive hint: the API
is one upsert by decision ("single paths with flags"), and three facade tools
would add surface without adding truth. The UX cost, a prompt before
reserving a name, is recorded here rather than solved.

**A description describes the tool; it instructs nobody.** Listing reviews
reject a description that tells the model how to behave ("You MUST confirm with
the user", "always show both to the user"). Confirmation is
`destructiveHint`'s job; what an agent should DO with a claim URL or a password
is the server's `instructions` (`INSTRUCTION_BLOCKS.claim`,
`INSTRUCTION_BLOCKS.password`). Guidance about the tool's FUNCTION ("Call after
domains_set") is permitted. `tests/server.test.ts` greps every description off
a real `tools/list` for "you must", "always show", "share the link", "to the
user" and "with the user".

**A tool's result is the shape its description states.** `whoami` is
projected to `{ email, name, plan, usage, caps }` in the shared handler, and
the description names exactly those. `suspended` is deliberately out: every
write is refused, and the refusal says so itself at the moment it matters, so a
field would teach an agent to pre-check a state the platform reports on
contact. Revisit only if a real user asks why `whoami` did not warn them.

### `call()`: The Single Abstraction

Every tool handler is a one-liner that delegates to the SDK through `call()`:

```typescript
server.registerTool('deployments_get', {
  description: 'Get deployment details including URL, status, file count, size, labels, and password protection state.',
  annotations: annotate(TOOLS.deployments_get),
  inputSchema: {
    deployment: z.string().describe('Deployment hostname (e.g. "happy-cat-abc1234.shipstatic.com"). Returned by deployments_upload or deployments_list.'),
  },
}, ({ deployment }) => call(() => ship.deployments.get(deployment)));
```

`call()` handles try/catch, JSON serialization, void→"Done.", and ShipError→MCP error conversion.

**The typed error contract reaches the agent: text authoritative, structure
beside it.** Clients branch on error type and status, never on message strings,
and an agent is the consumer best equipped to obey that (a 429's
`details.expires` is a precise backoff). `toErrorResult` attaches
`error.toResponse()`, the same `ErrorResponse` the wire carries, on every
ShipError arm, under the result's `_meta["com.shipstatic/error"]`
(`ERROR_META_KEY`, exported):

- **The text is the contract**, hints included. The API authors its messages
  for the end user at the throw site, so a client that reads only prose still
  works. Structure rides BESIDE it, never instead.
- **The structure never rides `structuredContent`.** That field belongs to the
  tool's `outputSchema`, which describes a success, and the TypeScript SDK's
  CLIENT validates it even on an `isError` result
  (modelcontextprotocol/typescript-sdk#1943): a host would throw "Structured
  content does not match the tool's output schema" in place of the refusal.
  Only the SDK's SERVER skips that check. `_meta` is validated by nobody.
  `tests/server-calls.test.ts` lists the tools first and then expects the
  refusal's own sentence, the order a real host uses.

**Every success carries `structuredContent` too, on both transports.** Every
tool publishes an `outputSchema` imported from the constitution
(`@shipstatic/types/schemas`, each schema fenced to its interface at compile
time), and the SDK refuses a result that carries none, so `call` attaches every
plain-object result as `structuredContent` beside the text, with no flag.
**Do not write an output schema in this package**: name the constitution's, or
add one there, fenced, first. `whoami`'s result is `AccountSchema.pick(...)`,
and parsing the wire through that pick IS the projection. The other tools
return the product's own user-facing entities and stay as they are.

A non-ShipError still answers text-only: there is no wire shape to report, and
inventing one would tell an agent the failure came from the platform.

### Dependency Injection

`bin.ts` owns the process: reads `SHIP_TOKEN` from the environment, constructs `new Ship({ token })`, passes it to `createServer(ship, { version })`. The factory never touches `process.env` or constructs its own dependencies. Tests pass a fake directly, and `tests/bin.test.ts` fences the split: `server.ts`, `call.ts`, `vocabulary.ts` and `index.ts` contain no `process.env` read at all.

The **version** is an argument for the same reason: the executable knows its own manifest, a library must not assume it has one, and reading it inside `server.ts` would put `node:module` in the import graph the hosted transport also loads.

### Credential Isolation

`SHIP_TOKEN` is **optional**. Without it, deployments go to the public account and expire in 3 days; with it, they go to the user's account permanently. The token is forwarded explicitly to the `Ship` constructor, and that is all MCP does.

**One slot, any platform token.** The value's prefix says what it is (`ship-` API key, `deploy-` deploy token, `oauth-` OAuth access token, anything else an opaque bearer) and the *server* classifies it. MCP never inspects or routes on the credential, so a new credential kind never requires a release here.

The SDK's strict-isolation contract (synchronous constructor, no filesystem reads, only documented `SHIP_*` env-var fallbacks) keeps embedded credentials predictable; the SDK's CLAUDE.md, "Strict-isolation contract for embedded hosts", has the rationale.

### Deployment Tracking

`deployments_upload` sets `via`. It **defaults to `'mcp'` and is a
`ServerOptions` field**, because `via` names the DISTRIBUTION SURFACE rather
than the protocol. `bin.ts` stays the `mcp` origin unless a wrapper relabels
it through the subprocess slot the CLI shares,
`normalizeVia(process.env[SHIP_VIA_ENV])` (the constant is owned by
`@shipstatic/types`), so a first-party manifest that composes the `npx`
invocation can name its own surface. An unrecognized value is dropped, exactly
as the CLI drops one, so a typo lands on the honest `mcp` default.

The VS Code extension passes `'vsc'` to `createServer` programmatically, the
in-process half of the same mechanism.

## Testing

```bash
pnpm test --run     # the whole suite
pnpm coverage       # the same suite, plus the ratchet
pnpm typecheck      # tsc over src AND tests, 0 errors
pnpm lint           # biome, 0 warnings
pnpm smoke          # the PUBLISHED artifact, live (see below). Manual, never CI
```

```
tests/
├── architecture/
│   ├── docs-contract.test.ts    # fence: README, server.json and the manifest against the code
│   ├── test-integrity.test.ts   # fence: every test file reaches src/
│   ├── test-naming.test.ts      # fence: the layout law
│   └── worker-safety.test.ts    # fence: no node: builtin in the LIBRARY graph
├── fixtures/builders.ts         # the only fixture source: wire shapes, cited
├── mocks/ship.ts                # the one fake, typed against the SDK contract
├── harness.ts                   # real Client ↔ real server, InMemoryTransport
├── setup.ts                     # SHIP_* scrub + no-network guard
├── call.test.ts                 # call() → CallToolResult, every error arm
├── bin.test.ts                  # the process boundary + credential isolation
├── index.test.ts                # the PUBLIC SURFACE: curated exports, both directions
├── vocabulary.test.ts           # the shared values: numbers stay derived, CREATE withholds its hint
├── server.test.ts               # the tool CATALOGUE (tools/list, instructions)
└── server-calls.test.ts         # tool CALLS (wiring, payloads, claim, errors)
```

**Recorded mirror-axis exception: `src/tools.ts` has no `tools.test.ts`.** Its
fourteen tools are registered by `createServer`, so `server.test.ts` pins every
one in the catalogue and `server-calls.test.ts` pins every SDK wiring, both
through the real protocol. A mirror file would re-register them against a bare
`McpServer`: a weaker assertion in a new place.

**Tests run through the protocol.** A real `Client` drives the real server
over `InMemoryTransport.createLinkedPair()`; nothing pokes a handler directly,
because then zod never runs. **The catalogue is the product**: `server.test.ts`
pins the `tools/list` response exactly (names, descriptions, JSON Schema,
required fields, annotations), so every copy change is a decision: a reworded
description turns it red on purpose, and the fix is to accept the new wording
in the pinned catalogue. If a test cannot be expressed as something an MCP
client does, it is testing the wrong thing.

**One fake, at one boundary.** `tests/mocks/ship.ts` is the only mock. Its
methods are parameterised by the real resource interfaces
(`vi.fn<DeploymentResource['upload']>()`), so a wrong-shaped
`mockResolvedValue` is a compile error. A real `Ship` over a wire-truth
`fetch` handler is declined on purpose: it would be a second, undetected-drift
twin of the API re-proving what ship's suite proves. The file's header has the
reasoning.

**`tests/**` is typechecked** (`tsconfig.check.json`), because vitest
transpiles WITHOUT checking types. **Hermeticity**: `tests/setup.ts` scrubs every `SHIP_*` variable (an exported
credential would authenticate the "no key configured" assertions) and wraps
`fetch` to throw on any non-loopback host (the SDK's default API URL is
production).

| Fence | Catches |
|---|---|
| `test-integrity.test.ts` | A test file reaching NO production code: the tautology class, acute where most assertions are about strings. Reach resolves transitively through `harness.ts`/`mocks/`; importing only `fixtures/builders` does not count. |
| the `ErrorType` sweep in `call.test.ts` | An error arm nobody thought about. It enumerates `Object.values(ErrorType)`, so "exhaustive" is derived; coverage is blind here because a few arms exercise every branch. Bidirectional: a hint added to `call.ts` without recording it in `HINTED` turns red, and so does one removed. |
| `test-naming.test.ts` | Layout drift: a filename describing the test instead of its subject, a mirror file with no `src/` counterpart, an aspect split not recorded below. |
| `coverage.thresholds` | Coverage decay. 100/100/100/100: no in-process-unreachable corner, so an untested new tool fails the run. |
| `worker-safety.test.ts` | A `node:` builtin entering the graph `index.ts` exposes, which the hosted transport imports; otherwise it shows only when the hosted build fails, after a publish. `bin.ts` is exempt by construction, and a second assertion proves the probe can SEE a builtin. |
| the `SHIP_*` sweep in `vocabulary.test.ts` | A SHARED string naming how ONE door authenticates, which would send a hosted user's deploy to the wrong account. Derived from the export maps, and a second row proves the probe can SEE a variable name. |
| the `ACCOUNT_TOOL_NAMES` comparison in `server.test.ts` | The exported name list drifting from the registrations, both directions, through a real `tools/list`. It lets the hosted transport state its catalogue as `[UPLOAD_TOOL_NAME, ...ACCOUNT_TOOL_NAMES]`. |

**Recorded aspect splits**: one subject, more than one mirror file. The
naming fence fails the suite if a split is not named here by full basename.

| Module | Files | Why |
|---|---|---|
| `src/server.ts` | `server`, `server-calls` | Two separable contracts on one module. `server.test.ts` asserts the STATIC surface an agent reads before acting (`tools/list`, instructions, schemas) and is a pinned table. `server-calls.test.ts` asserts BEHAVIOUR: the 1:1 SDK wiring, pass-through payload fidelity, the anonymous claim story, and the error surfaces. |

### `smoke.mjs`: the live gate

`pnpm smoke` drives the **published** package over `npx`, against a real API,
through all fifteen tools. Manual, deliberately **not** in `ci.yml`, which has
neither a live API nor a credential. It exists because the fake is derived from
the SDK's interfaces: it catches *signature* drift and cannot catch the API
answering differently than those types promise.

- **The published artifact, not the checkout.** `npx -y @shipstatic/mcp@<v>`:
  what ships is the tarball with its own resolved dependency tree. The version
  defaults to this repo's `package.json`, so run after a publish it asserts
  *what I am is what the registry serves*, and the exact pin defeats a stale
  npx cache.
- **Refusals skip, they never fail.** No `SHIP_TOKEN` runs the anonymous half
  alone; a token for another environment says so; a plan without custom domains
  skips the domain block. Every skip names what went unverified and exits 0.
- **Two processes, because the credential is process-scoped.** `bin.ts` reads
  `SHIP_TOKEN` once. Every `SHIP_*` is scrubbed from the child and only the two
  the run means to set are put back, so an exported credential or `SHIP_VIA`
  cannot falsify a half.
- **No hostname in tracked source.** The API URL arrives from `--api=` or
  `SHIP_API_URL` and defaults to the SDK's `DEFAULT_API`. Excluded from the
  tarball by `files`; confirm with `npm pack --dry-run`.

## Publishing

**Bump `version` in `package.json` and push.** `.github/workflows/ci.yml` runs
on `main` and `development`; a version not yet on npm publishes, a prerelease
(`-` suffix) to `beta` (from either branch, normally `development`), a stable one to `latest` from
`main`. Publishes are idempotent: a push at a published version does nothing.

**The MCP Registry publish is its own job (`registry`), one job, one
credential.** It carries `MCP_PRIVATE_KEY` and deliberately NOT
`id-token: write`: `mcp-publisher` is a downloaded binary and must not run
where a token npm would exchange for a publish credential could be minted. It
is **exact-pinned** (`v1.8.1`) because it emits a published artifact. It is
**stable-only** (one job-level `if: needs.version.outputs.tag == 'latest'`):
the registry has no channel concept, so betas live on npm's `beta` dist-tag
alone. A registry failure after a green npm publish reports its own state. DNS
authentication uses an Ed25519 key on `shipstatic.com`.

**A registry failure is repaired by its CAUSE.** The `version` job's
idempotence guard asks npm only, so once a version is on npm every later push
at it skips `publish` and therefore `registry`.

- **Transient failure** (network, registry outage): "Re-run failed jobs". The
  bytes were fine.
- **The bytes were rejected**: a re-run or a fix-up commit at the same version
  cannot help. **Bump the patch version**; npm publishes the new number and
  the registry accepts.

**The registry caps `description` at 100 characters and enforces it at
PUBLISH with a 422.** `tests/architecture/docs-contract.test.ts` bounds it in
the suite; the npm `description` has no such cap.

**`server.json`** is the MCP Registry metadata. Its `title`, `description`,
`websiteUrl` and `icons` are `SERVER_INFO`'s, held by the docs contract.
`package.json` is the one source of the version: CI patches `.version` in
`server.json` with `jq` before the registry publish, so **the tracked version
is the `0.0.0` sentinel**, a value nobody can mistake for a real one. The docs
contract fences the sentinel AND the ci.yml sync it depends on. Never run
`mcp-publisher publish` by hand from a checkout, which would register the
sentinel literally.

**The registry entry names the hosted server, and only the hosted server.**
`remotes` holds `https://mcp.shipstatic.com`; there is no `packages` entry,
and `package.json` carries no `mcpName`. A registry client offered an npm
package beside the URL tends to install it and ask for `SHIP_TOKEN` first,
the wrong first step for someone who only wants a link. Stripe, Notion, Neon
and Linear list their hosted servers the same way. The job publishes after npm
only to keep the two version numbers in step; the docs contract holds the
shape.

## Adding New Tools

An account-tied tool is a tool **both transports get**, so it goes in the
shared file, not this server's:

1. Add its row to **`TOOLS`** in **`tools.ts`** (`auth`, `mutation`,
   `reach`; the registry section above says what each value promises) and
   its `server.registerTool()` beneath, with `annotations: annotate(TOOLS.<name>)`.
   The comparison in `server.test.ts` fails until both exist, and
   `ACCOUNT_TOOL_NAMES` derives itself from the row.
2. Handler is a one-liner: `(args) => call(() => ship.resource.action(args))`,
   and the registration names its `outputSchema` from
   `@shipstatic/types/schemas`. Never write one here; if the constitution
   lacks the shape, add it there (fenced to its interface) first.
3. Give it a **`title`**, a short Title Case verb phrase naming what the user
   gets ("List Deployments", "Set Domain"). Not optional: the Claude
   connectors directory refuses a tool without one, so a titleless tool makes
   the whole product unlistable. Both catalogue pins fail on an untitled tool.
4. Pin the new tool in `server.test.ts`'s `CATALOGUE` and its SDK wiring in
   `server-calls.test.ts`. Add the live assertion to `smoke.mjs`: the matrix
   is "all fifteen tools" so a tool no run has invoked cannot exist.

`server.ts` is for the one tool this transport authors for itself
(`deployments_upload`, whose input is a filesystem path). An account tool
there would give the hosted door fourteen tools and this one fifteen.

## User Configuration

```json
{
  "mcpServers": {
    "shipstatic": {
      "command": "npx",
      "args": ["-y", "@shipstatic/mcp"],
      "env": { "SHIP_TOKEN": "ship-your-api-key" }
    }
  }
}
```

## Option Completeness

**Every SDK option an agent could meaningfully choose is exposed, and every
absence is a recorded decision.** When the SDK grows an option, it belongs
here unless a line below says otherwise.

**Pagination.** Both list tools accept `{limit, cursor}` and pass them
straight through. The schema teaches the contract: `cursor` is an opaque
position from the previous response, omitted for the first page, and
**`cursor: null` is the entire has-more signal**; there is no `total` and no
boolean, because a count is an aggregate, not a property of a page. **No
page-size cap is stated**, in the schema or the prose: the API clamps and owns
that number. `min(1)` is not a cap. `PAGINATION_INPUT` in `src/tools.ts` is one
shared shape for both tools.

**Idempotency.** `deployments_upload` accepts `idempotencyKey`, because an
automated retry does not notice a duplicate deployment. The `describe()`
teaches the law: key the ATTEMPT (a run id, a commit sha, a uuid minted before
the first try), never the try. MCP never mints, derives or normalizes the key.
The `describe()` also states the API's one rule: a key returns the live
deployment it made within the account that sent it, and an anonymous key is
ignored. Both doors speak that shared sentence whole, and neither appends a
clause: a key the agent did not choose cannot identify the agent's attempt.

**A large deploy needs nothing here.** The SDK sends a deployment larger than
one request in several; the tool's input, answer and card are the same.

**Ephemeral deploys (`ttl`).** `deployments_upload` accepts `ttl` in seconds and
passes it to the SDK; the semantics are the SDK's CLAUDE.md, "Ephemeral
deployments (`--ttl`)". Three things are deliberately NOT done, all one rule
(the MCP relays the platform's own refusals):

- **No preflight, no second validator.** `validateTtl` runs inside
  `@shipstatic/ship` before a byte is uploaded, and the anonymous refusal mints
  nothing.
- **No range in the `describe()`,** and no `.int()` / `.min()` / `.max()` on
  the zod schema: each restates a rule `validateTtl` owns. `tests/vocabulary.test.ts`
  holds the prose to no digits, and the catalogue pin holds the schema to a
  bare `number`.
- **No credential named in the describe.** It is SHARED vocabulary, so it says
  "only for authenticated deploys" and neither door's word.

**Three deployment states, never conflated.** An owned deployment can carry
`expires` with no `claim`, so "expiring" and "claimable" are separate facts:
reading them as one sends a user to a claim URL that does not exist, or calls a
site permanent because none came back. Pinned in `server-calls.test.ts` and
asserted live in `smoke.mjs`.

**Refused, so none is re-proposed:**

- **No composed deploy-and-link tool.** The CLI's `--domain` answers
  constraints MCP does not have (one process, one exit code, a `bash -e`
  workflow). An agent sequences `deployments_upload → domains_set` natively,
  and the INSTRUCTIONS teach the order; a sixteenth tool restating two others
  grows the catalogue every agent reads. Revisit only with evidence that agents
  fail the sequence.
- **No `tokens_*` tools.** An MCP server's credential is *configured by the
  human*, never minted by the agent that would then hold it. Reopen only with
  a new product call.
- **No `ping` tool.** An agent's next tool call is already the reachability
  probe, and a failure arrives as an actionable `network_error`. A probe earns
  its place when a caller must decide whether to proceed.
- **No `getLimits` tool.** The platform teaches caps *reactively*: an over-cap
  deploy fails with a validation error naming the limit, and the SDK already
  fetches limits for its own pre-validation.
- **Not agent knobs:** `signal` (process-level cancellation), `pathDetect` (a
  local path default) and `spaDetect` (the SDK asks the single-page question by
  default, so an agent's app gets its routing config without choosing).

**Open, not refused: a labels tool.** `GET /labels` has no tool. Unlike
`tokens_*` this is undecided rather than closed; decide before wiring.

---

*This file provides Claude Code guidance. User-facing documentation lives in README.md.*
