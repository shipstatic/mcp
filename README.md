# @shipstatic/mcp

MCP server for [ShipStatic](https://shipstatic.com) — free, no account needed. Deploy static websites, landing pages, and prototypes instantly from AI agents.

ShipStatic is static hosting without the complexity. No build steps, no framework lock-in — upload your files and get a live URL.

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

Same config format — `npx @shipstatic/mcp` via stdio. Works with any MCP-compatible client.

That's it. Your site is live instantly.

Without an API key, deployments are public and expire in 3 days. For permanent deployments, add a free API key from [my.shipstatic.com/api-key](https://my.shipstatic.com/api-key):

```bash
claude mcp add shipstatic -e SHIP_API_KEY=ship-... -- npx @shipstatic/mcp
```

## Tools

### Deployments

| Tool | Description |
|------|-------------|
| `deployments_upload` | Publish files and get a live URL instantly — no account needed |
| `deployments_list` | List all your deployed sites with their URLs, status, and labels |
| `deployments_get` | Get details for a specific deployment including URL, status, and file count |
| `deployments_set` | Update the labels on a deployment for organization and filtering |
| `deployments_remove` | Permanently remove a deployment and all its files |

### Domains

| Tool | Description |
|------|-------------|
| `domains_set` | Connect a custom domain to your site, switch deployments, or update labels |
| `domains_list` | List all your custom domains with their linked sites and verification status |
| `domains_get` | Get details for a specific domain including its linked site and DNS status |
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

Published to the [MCP Registry](https://registry.modelcontextprotocol.io/v0.1/servers?search=com.shipstatic/mcp) as `com.shipstatic/mcp`.

## License

MIT
