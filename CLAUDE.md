# CLAUDE.md

Claude Code instructions for the **ShipStatic MCP Server**.

**@shipstatic/mcp** — MCP server that exposes the ShipStatic SDK to AI agents via stdio. Thin wrapper over `@shipstatic/ship`. Published to the MCP Registry as `com.shipstatic/mcp`. **Maturity:** v0.4.x — Deployments + Domains (15 tools).

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

### `call()` — The Single Abstraction

Every tool handler is a one-liner that delegates to the SDK through `call()`:

```typescript
server.registerTool('deployments_get', {
  description: 'Get deployment details including URL, status, file count, size, and labels.',
  inputSchema: { deployment: z.string().describe('Deployment ID (e.g. "happy-cat-abc1234")') },
}, ({ deployment }) => call(() => ship.deployments.get(deployment)));
```

`call()` handles try/catch, JSON serialization, void→"Done.", and ShipError→MCP error conversion.

### Dependency Injection

`index.ts` owns the process: reads `SHIP_API_KEY` from the environment, constructs `new Ship({ apiKey })`, passes it to `createServer(ship)`. The factory never touches `process.env` or constructs its own dependencies. Tests pass a mock directly.

### Credential Isolation

`SHIP_API_KEY` is **optional**. Without it, deployments go to the public account and expire in 3 days; with it, they go to the user's account permanently. The API key is forwarded explicitly to the `Ship` constructor — and that's all MCP needs to do. The SDK's strict-isolation contract (synchronous constructor, no filesystem reads, only documented `SHIP_*` env-var fallbacks) is what keeps embedded credentials predictable. See `npm/ship/CLAUDE.md` "Strict-isolation contract for embedded hosts" for the full rationale.

### Deployment Tracking

`deployments_upload` sets `via: 'mcp'` — matching CLI's `via: 'cli'` for origin tracking.

## Testing

```
tests/
├── call.test.ts     # call() + ShipError mapping (auth/forbidden/validation hints)
└── server.test.ts   # Tool registration + 1:1 SDK wiring + annotation correctness
```

## Publishing

The CI workflow (`.github/workflows/npm-publish.yml`) runs on pushes to `main` and `development`. The guarded publish step publishes to npm only when `package.json` holds a version not yet on the registry, with the dist-tag derived from the version (`-` suffix → `beta`, else `latest`). The MCP Registry publish is **stable-only** — the registry has no channel concept, so betas live on npm's `beta` dist-tag alone. `package.json` is the single source of truth for the version — CI patches `server.json` with `jq` before registry publish. DNS authentication uses an Ed25519 key on `shipstatic.com`.

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
      "env": { "SHIP_API_KEY": "ship-..." }
    }
  }
}
```

---

*This file provides Claude Code guidance. User-facing documentation lives in README.md.*
