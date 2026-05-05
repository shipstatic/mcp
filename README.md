# @shipstatic/mcp

MCP server for [ShipStatic](https://shipstatic.com) — deploy static websites, landing pages, and prototypes instantly from AI agents.

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

## Deploy — Free, No Account Needed

Ask your AI agent to deploy a site. No API key, no sign-up, no configuration.

Your site is live instantly on `*.shipstatic.com`.

Deployments without an API key are public and expire in 3 days. The response includes a **claim URL** — always show it to the user so they can keep the site permanently.

Want a private site? Ask your agent to set a password when deploying — visitors will be prompted to unlock before viewing, on the deployment URL and on any custom domains pointing at it.

## All Tools — Free API Key

For permanent deployments and full control over your sites and domains, add a free API key from [my.shipstatic.com/api-key](https://my.shipstatic.com/api-key):

```bash
claude mcp add shipstatic -e SHIP_API_KEY=ship-... -- npx @shipstatic/mcp
```

### Deployments

| Tool | Description |
|------|-------------|
| `deployments_upload` | Publish files and get a live URL instantly, optionally protected by a password |
| `deployments_list` | List all deployments with their URLs, status, labels, and password protection state |
| `deployments_get` | Get deployment details including URL, status, file count, size, labels, and password protection state |
| `deployments_set` | Update the labels on a deployment for organization and filtering |
| `deployments_remove` | Permanently remove a deployment and all its files |

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

Published to the [MCP Registry](https://registry.modelcontextprotocol.io/v0.1/servers?search=com.shipstatic/mcp) as `com.shipstatic/mcp`.

## License

MIT
