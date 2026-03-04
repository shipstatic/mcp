# CLAUDE.md

Claude Code instructions for the **Shipstatic MCP Server**.

**@shipstatic/mcp** — MCP server that exposes the Shipstatic SDK to AI agents via stdio. Thin wrapper over `@shipstatic/ship`. Published to the MCP Registry as `com.shipstatic/mcp`. **Maturity:** v0.1.x — Deployments + Domains only (13 tools).

## Architecture

```
src/
├── index.ts     # Entry: env validation, Ship construction, stdio transport
├── server.ts    # createServer(ship) — pure factory, all 13 tools
└── call.ts      # call() wrapper + error mapping
```

## Quick Reference

```bash
pnpm build          # TypeScript → dist/
pnpm test --run     # All tests (27 tests, ~400ms)
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
  description: 'Show deployment information',
  inputSchema: { deployment: z.string().describe('Deployment ID') },
}, ({ deployment }) => call(() => ship.deployments.get(deployment)));
```

`call()` handles try/catch, JSON serialization, void→"Done.", and ShipError→MCP error conversion.

### Dependency Injection

`index.ts` owns the process: validates `SHIP_API_KEY`, constructs `new Ship({ apiKey })`, passes it to `createServer(ship)`. The factory never touches `process.env` or constructs its own dependencies. Tests pass a mock directly.

### Credential Isolation

`SHIP_API_KEY` is **required** — the server exits with a clear error if missing. The API key is passed explicitly to the Ship constructor, bypassing the SDK's file-based config resolution (`~/.shiprc`). This prevents credential leakage from locally installed CLI credentials.

### Deployment Tracking

`deployments_upload` sets `via: 'mcp'` — matching CLI's `via: 'cli'` for origin tracking.

## Testing

```
tests/
├── call.test.ts     # call() + error mapping (8 tests)
└── server.test.ts   # Registration + wiring for all 13 tools (19 tests)
```

## Publishing

The CI workflow (`.github/workflows/npm-publish.yml`) publishes to both npm and the MCP Registry on every push to main. `package.json` is the single source of truth for the version — CI patches `server.json` with `jq` before registry publish. DNS authentication uses an Ed25519 key on `shipstatic.com`.

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
