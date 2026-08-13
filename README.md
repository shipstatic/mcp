# ShipStatic MCP

**One URL. Your agent ships.**

Give your AI a publish button for the internet: ask it to put your site online, and get back a real, shareable link in seconds. Landing pages, prototypes, portfolios — any static site.

[![smithery badge](https://smithery.ai/badge/shipstatic/ship)](https://smithery.ai/servers/shipstatic/ship)
[![glama badge](https://img.shields.io/badge/glama-MCP%20server-1f7ade)](https://glama.ai/mcp/servers/shipstatic/mcp)

## Hosted — nothing to install

Drop `https://mcp.shipstatic.com` into any MCP client. No install, no signup, no API key — your agent can publish a website in its next message.

```
https://mcp.shipstatic.com
```

### Claude Code

```bash
claude mcp add --transport http shipstatic https://mcp.shipstatic.com
```

### Claude Desktop and claude.ai

**Settings → Connectors → Add custom connector**, paste `https://mcp.shipstatic.com`, save.

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

### Then just ask

> "Put my site online."

Your agent publishes the files and answers with two links:

- **The live site** — a real URL you can share right away.
- **A claim link** — the site stays live for 3 days; open the claim link to keep it forever. A free account is all it takes.

Want the site private? Ask for a password — visitors must enter it before they can see anything.

## Local — the full toolset

The hosted URL does one thing: publish. Install this package for the full toolset (custom domains, listing, account-tied ops) — see everything you've shipped, connect your own domain, and publish sites that stay up permanently.

The config asks for one thing: `SHIP_TOKEN`. **Its value is your API key** — one credential, two names. The console mints it as an *API key* (it looks like `ship-...`), and the setting that carries it is called the *token*. Get yours free at [my.shipstatic.com/api-key](https://my.shipstatic.com/api-key), paste it where the snippets below show `ship-...`, and every site you publish lands in your account, never expires, and gets bigger limits.

The key is optional: leave it out and the local server behaves exactly like the hosted one (public sites, claim links, live for 3 days).

The server runs with `npx`, which ships with [Node.js](https://nodejs.org) (20.19 or newer).

### Claude Code

```bash
claude mcp add shipstatic -e SHIP_TOKEN=ship-... -- npx -y @shipstatic/mcp
```

### Cursor

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "shipstatic": {
      "command": "npx",
      "args": ["-y", "@shipstatic/mcp"],
      "env": { "SHIP_TOKEN": "ship-..." }
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
      "args": ["-y", "@shipstatic/mcp"],
      "env": { "SHIP_TOKEN": "ship-..." }
    }
  }
}
```

### Windsurf, Zed, and other MCP clients

Same config shape — `npx -y @shipstatic/mcp`, with `SHIP_TOKEN` in `env`. Works with any MCP-compatible client.

### VS Code

Prefer an editor extension? [ShipStatic for VS Code](https://marketplace.visualstudio.com/items?itemName=shipstatic.shipstatic) has this server built in — no config at all.

## Tools

The hosted endpoint exposes `deployments_upload` only. The local install exposes everything below.

### Deployments

| Tool | Description | Hosted |
|------|-------------|:---:|
| `deployments_upload` | Publish files and get a live URL instantly, optionally protected by a password | ✓ |
| `deployments_list` | List all deployments with their URLs, status, labels, and password protection state. Pages with `limit` and `cursor` | |
| `deployments_get` | Get deployment details including URL, status, file count, size, labels, and password protection state | |
| `deployments_set` | Update the labels on a deployment for organization and filtering | |
| `deployments_delete` | Permanently delete a deployment and all its files | |

### Domains

| Tool | Description |
|------|-------------|
| `domains_set` | Connect a custom domain to your site, switch deployments, or update labels |
| `domains_list` | List all domains with their linked deployment and verification status. Pages with `limit` and `cursor` |
| `domains_get` | Get domain details including linked deployment, verification status, and labels |
| `domains_records` | Get the DNS records you need to configure at your DNS provider |
| `domains_dns` | Look up which DNS provider hosts a domain (e.g. Cloudflare, Namecheap) |
| `domains_share` | Get a shareable link so someone else can see the required DNS records |
| `domains_validate` | Check if a domain name is valid and available before connecting it |
| `domains_verify` | Check if DNS is configured correctly after you set up the records |
| `domains_delete` | Permanently disconnect and delete a custom domain |

### Account

| Tool | Description |
|------|-------------|
| `whoami` | Get your account details including email, plan, and usage |

### Paging long lists

`deployments_list` and `domains_list` accept `limit` and `cursor`. Each response carries a `cursor` — pass it back to fetch the next page; `null` means you are on the last one.

### Retrying a deploy safely

`deployments_upload` accepts an `idempotencyKey`. If a deploy times out you cannot tell "it never landed" from "it landed and the response was lost", and retrying without a key creates a second site. Send the same key on the retry and the original deployment is returned instead.

Key the *attempt*, not the try — a run id, a commit sha, or a uuid generated before the first call. A key that changes on every retry does nothing.

### Deployments that clean themselves up

`deployments_upload` accepts a `ttl` in seconds. The deployment expires when the time is up and the platform reclaims it — handy for previews and throwaway iterations you would otherwise have to remember to delete.

```json
{ "path": "/path/to/dist", "ttl": 3600 }
```

It needs `SHIP_TOKEN` (your API key): a keyless deploy already expires on the platform's schedule, so a `ttl` on one is refused rather than ignored. A deployment carrying a `ttl` cannot be linked to a custom domain — deploy without one when the site needs a domain.

## Registry

Published to the [MCP Registry](https://registry.modelcontextprotocol.io/v0.1/servers?search=com.shipstatic/mcp) as `com.shipstatic/mcp`. Registry-aware clients see both the hosted endpoint and the local install and pick whichever fits their environment.

## License

MIT
