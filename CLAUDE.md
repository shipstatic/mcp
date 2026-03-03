# CLAUDE.md

Claude Code instructions for the **Shipstatic MCP Server**.

**@shipstatic/mcp** — MCP server that exposes the Shipstatic SDK to AI agents via stdio. Thin wrapper over `@shipstatic/ship`. **Maturity:** v0.1.0 — Deployments + Domains only (12 tools).

## Architecture

```
src/
├── index.ts     # Entry: TTY detection + stdio transport (~20 lines)
├── server.ts    # createServer() — all 12 tools (~120 lines)
└── call.ts      # call() wrapper + error mapping (~39 lines)
```

## Quick Reference

```bash
pnpm build          # TypeScript → dist/
pnpm test --run     # All tests (26 tests, ~400ms)
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

`createServer(ship?)` accepts an optional Ship instance. Defaults to `new Ship()` in production. Tests pass a mock directly.

### Deployment Tracking

`deployments_upload` sets `via: 'mcp'` — matching CLI's `via: 'cli'` for origin tracking.

## Testing

```
tests/
├── call.test.ts     # call() + error mapping (8 tests)
└── server.test.ts   # Registration + wiring for all 12 tools (18 tests)
```

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
