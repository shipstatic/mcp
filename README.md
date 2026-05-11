# @shipstatic/mcp

ShipStatic MCP — deploy static websites, landing pages, and prototypes from AI agents.

**One URL. Your agent ships.**

[![smithery badge](https://smithery.ai/badge/shipstatic/ship)](https://smithery.ai/servers/shipstatic/ship)
[![glama badge](https://img.shields.io/badge/glama-MCP%20server-1f7ade)](https://glama.ai/mcp/servers/shipstatic/mcp)

## Hosted — no install

Drop this URL into any MCP client. Your agent can publish a website in its next message — free, no install, no signup, no API key.

```
https://mcp.shipstatic.com
```

### Claude Code

```bash
claude mcp add --transport http shipstatic https://mcp.shipstatic.com
```

### Cursor, Antigravity, Windsurf, Zed — anywhere with `mcp.json`

```json
{
  "mcpServers": {
    "shipstatic": {
      "url": "https://mcp.shipstatic.com"
    }
  }
}
```

### Claude Desktop, Claude.ai web

Add a custom connector pointing at `https://mcp.shipstatic.com`.

The hosted endpoint exposes one tool: `deployments_upload`. Public deployments expire in 3 days unless claimed — the response includes a claim URL the user can visit to keep the site permanently. Set a `password` arg to gate the deployment behind an unlock prompt.

## Local — full toolset

Install this package when you need to manage deployments, link custom domains, or use account-tied operations.

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

### Antigravity

Add to `~/.gemini/antigravity/mcp_config.json`:

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

### Windsurf, Zed, and other MCP clients

Same config format — `npx @shipstatic/mcp`. Works with any MCP-compatible client.

## Free API key — permanent deployments

`SHIP_API_KEY` is optional. Without it, deploys behave like the hosted endpoint (public, claim URL, 3-day expiry). With it, you get permanent deployments, the full toolset, and bigger limits.

Get a free key at [my.shipstatic.com/api-key](https://my.shipstatic.com/api-key):

```bash
claude mcp add shipstatic -e SHIP_API_KEY=ship-... -- npx @shipstatic/mcp
```

## Tools

The hosted endpoint exposes `deployments_upload` only. The local install exposes everything below.

### Deployments

| Tool | Description | Hosted |
|------|-------------|:---:|
| `deployments_upload` | Publish files and get a live URL instantly, optionally protected by a password | ✓ |
| `deployments_list` | List all deployments with their URLs, status, labels, and password protection state | |
| `deployments_get` | Get deployment details including URL, status, file count, size, labels, and password protection state | |
| `deployments_set` | Update the labels on a deployment for organization and filtering | |
| `deployments_remove` | Permanently remove a deployment and all its files | |

### Domains

| Tool | Description |
|------|-------------|
| `domains_set` | Connect a custom domain to your site, switch deployments, or update labels |
| `domains_list` | List all domains with their linked deployment and verification status |
| `domains_get` | Get domain details including linked deployment, verification status, and labels |
| `domains_records` | Get the DNS records you need to configure at your DNS provider |
| `domains_dns` | Look up which DNS provider hosts a domain (e.g. Cloudflare, Namecheap) |
| `domains_share` | Get a shareable link so someone else can see the required DNS records |
| `domains_validate` | Check if a domain name is valid and available before connecting it |
| `domains_verify` | Check if DNS is configured correctly after you set up the records |
| `domains_remove` | Permanently disconnect and remove a custom domain |

### Account

| Tool | Description |
|------|-------------|
| `whoami` | Get your account details including email, plan, and usage |

## Registry

Published to the [MCP Registry](https://registry.modelcontextprotocol.io/v0.1/servers?search=com.shipstatic/mcp) as `com.shipstatic/mcp`. Registry-aware clients see both the hosted endpoint and the local install and pick the right transport for their environment.

## License

MIT
