# @shipstatic/mcp

MCP server for [ShipStatic](https://shipstatic.com) — deploy static sites instantly from AI agents. No account required.

Works with Claude Code, Cursor, VS Code Copilot, and any MCP-compatible client. Deployments are live immediately — no setup, no credentials needed.

<a href="https://glama.ai/mcp/servers/@shipstatic/shipstatic">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@shipstatic/shipstatic/badge" alt="shipstatic MCP server" />
</a>

## Setup

### Claude Code

```bash
claude mcp add shipstatic -- npx @shipstatic/mcp
```

### Cursor

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "shipstatic": {
      "command": "npx",
      "args": ["@shipstatic/mcp"]
    }
  }
}
```

### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "shipstatic": {
      "command": "npx",
      "args": ["@shipstatic/mcp"]
    }
  }
}
```

### Other MCP clients

Same config format — `npx @shipstatic/mcp` via stdio.

That's it. Deployments work immediately — sites are live with a claim URL (3-day TTL).

For permanent deployments, add a free API key from [my.shipstatic.com/api-key](https://my.shipstatic.com/api-key):

```bash
claude mcp add shipstatic -e SHIP_API_KEY=ship-... -- npx @shipstatic/mcp
```

## Tools

### Deployments

| Tool | Description |
|------|-------------|
| `deployments_upload` | Deploy a static site by uploading files from a directory |
| `deployments_list` | List all deployments with their URLs, status, and labels |
| `deployments_get` | Get deployment details including URL, status, file count, size, and labels |
| `deployments_set` | Update deployment labels |
| `deployments_remove` | Permanently delete a deployment and its files |

### Domains

| Tool | Description |
|------|-------------|
| `domains_set` | Create or update a custom domain |
| `domains_list` | List all domains with their linked deployments and verification status |
| `domains_get` | Get domain details including linked deployment, verification status, and labels |
| `domains_records` | Get the DNS records the user needs to configure at their DNS provider |
| `domains_dns` | Look up the DNS provider for a domain |
| `domains_share` | Get a shareable DNS setup hash for a domain |
| `domains_validate` | Check if a domain name is valid and available |
| `domains_verify` | Trigger DNS verification for a custom domain |
| `domains_remove` | Permanently delete a domain |

### Account

| Tool | Description |
|------|-------------|
| `whoami` | Show authenticated account details including email, plan, and usage |

## Registry

Published to the [MCP Registry](https://modelcontextprotocol.io) as [`com.shipstatic/mcp`](https://registry.modelcontextprotocol.io/v0.1/servers?search=com.shipstatic/mcp).

## License

MIT