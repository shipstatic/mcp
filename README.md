# ShipStatic MCP

**One URL. Your agent ships.**

Deploy static websites, landing pages, and prototypes instantly. Free, no account needed.

Ask your agent to put your site online, and get back a real link you can share in seconds.

## Try it in seconds, no account needed

Drop `https://mcp.shipstatic.com` into any MCP client. No install, no signup, no API key: your agent can publish a website in its next message.

```
https://mcp.shipstatic.com
```

### ChatGPT

Add the [ShipStatic plugin](https://chatgpt.com/plugins/plugin_asdk_app_6a06f62b2f50819181136d58192063d1) from its page in ChatGPT. There is nothing to paste.

### Claude Desktop and claude.ai

**Settings → Connectors → Add custom connector**, paste `https://mcp.shipstatic.com`, save.

### Claude Code

```bash
claude mcp add --transport http shipstatic https://mcp.shipstatic.com
```

### Cursor, Antigravity, Windsurf, n8n, Zed, and anywhere with `mcp.json`

```json
{
  "mcpServers": {
    "shipstatic": {
      "url": "https://mcp.shipstatic.com"
    }
  }
}
```

### VS Code

Install [ShipStatic for VS Code](https://marketplace.visualstudio.com/items?itemName=shipstatic.shipstatic). The server is built in, with no config at all.

### Then just ask

> "Publish this with ShipStatic."

Your agent publishes it, and you get back a link you can share right away, and a claim link. The site stays up for 3 days, and opening the claim link keeps it for good.

Want the site private? Say "publish this with ShipStatic's built-in password protection". Visitors have to type the password before they see anything, and saying "built-in" keeps your agent from writing a password page of its own.

## Keep your sites with a free account

Everything above works with no account. A free account keeps your sites for good, lets you use your own domain, and shows you everything you've published in one place.

Connect one when your client offers to sign you in, and the same URL answers with the rest. There's nothing to install and no key to paste: your client starts the sign-in itself.

## Tools

All fifteen tools are on both doors. What changes is not which tools exist, but which ones answer: `deployments_upload` is the one that needs no account, and the other fourteen answer once you have connected one (hosted) or set `SHIP_TOKEN` (local).

### Publishing, with no account

| Tool | Description |
|------|-------------|
| `deployments_upload` | Publish files and get a live URL instantly, optionally protected by a password |

### Deployments, with an account

| Tool | Description |
|------|-------------|
| `deployments_list` | List all deployments with their URLs, status, labels, and password protection state. Pages with `limit` and `cursor` |
| `deployments_get` | Get deployment details including URL, status, file count, size, labels, and password protection state |
| `deployments_set` | Update the labels on a deployment for organization and filtering |
| `deployments_delete` | Permanently delete a deployment and all its files |

### Domains, with an account

| Tool | Description |
|------|-------------|
| `domains_set` | Connect a custom domain to your site, switch deployments, or update labels |
| `domains_list` | List all domains with their linked deployment and verification status. Pages with `limit` and `cursor` |
| `domains_get` | Get domain details including linked deployment, verification status, and labels |
| `domains_records` | Get the DNS records you need to configure at your DNS provider |
| `domains_dns` | The DNS provider recorded for a domain, if known (e.g. Cloudflare, Namecheap) |
| `domains_share` | Get a shareable link so someone else can see the required DNS records |
| `domains_validate` | Check if a domain name is valid and available before connecting it |
| `domains_verify` | Check if DNS is configured correctly after you set up the records |
| `domains_delete` | Permanently disconnect and delete a custom domain |

### Account, with an account

| Tool | Description |
|------|-------------|
| `whoami` | Your email and name, and the account's plan, usage and caps |

### Paging long lists

`deployments_list` and `domains_list` accept `limit` and `cursor`. Each response carries a `cursor`: pass it back to fetch the next page. A `null` cursor means you're on the last one.

### Retrying a deploy safely

`deployments_upload` accepts an `idempotencyKey`. If a deploy times out you cannot tell "it never landed" from "it landed and the response was lost", and retrying without a key creates a second site. Send the same key on the retry and you get back the site the first try made, once it went live. A key works only within your account: an anonymous deploy ignores it, and a retry makes a new site.

Key the *attempt*, not the try: a run id, a commit sha, or a uuid generated before the first call. A key that changes on every retry does nothing.

### Deployments that clean themselves up

`deployments_upload` accepts a `ttl` in seconds. The deployment expires when the time is up and the platform removes it. That's useful for previews and quick experiments you'd otherwise have to remember to delete.

```json
{ "path": "/path/to/dist", "ttl": 3600 }
```

It needs an account (a connected account on the hosted endpoint, or `SHIP_TOKEN` locally): a deploy with no account already expires on the platform's schedule, so a `ttl` on one is refused rather than ignored. A deployment carrying a `ttl` cannot be linked to any domain: deploy without one when the site needs a domain.

## Run it on your own machine

This package runs the same fifteen tools, reached the other way: as a local process instead of the hosted URL. Use it when your MCP client doesn't speak OAuth yet, or when you'd rather set a key once than sign in. To publish a folder from your own machine, use the [ShipStatic CLI](https://github.com/shipstatic/ship) instead: it reads the files straight from disk.

It needs [Node.js](https://nodejs.org) 20.19 or newer, and takes one setting, `SHIP_TOKEN`, whose value is your API key from [my.shipstatic.com/api-key](https://my.shipstatic.com/api-key). Without it, the local server works like the hosted URL with no account connected.

```bash
claude mcp add shipstatic -e SHIP_TOKEN=ship-your-api-key -- npx -y @shipstatic/mcp
```

Any other client takes the same command and setting in its `mcp.json`:

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

The [MCP Registry](https://registry.modelcontextprotocol.io/v0.1/servers?search=com.shipstatic/mcp) lists ShipStatic as `com.shipstatic/mcp`, with the hosted URL.

## Also available

| Surface | Reach it |
|---------|----------|
| **[CLI and SDK](https://github.com/shipstatic/ship)** | `npx @shipstatic/ship ./dist` |
| **[VS Code](https://marketplace.visualstudio.com/items?itemName=shipstatic.shipstatic)** | Search "ShipStatic" in the Marketplace |
| **[Plugin](https://github.com/shipstatic/plugin)** | Install it in Cursor, Claude Code, Codex or Gemini CLI |
| **[n8n](https://www.npmjs.com/package/n8n-nodes-shipstatic)** | Search "ShipStatic" in n8n's node panel |
| **[GitHub Action](https://github.com/shipstatic/action)** | `shipstatic/action@v3` |
| **[Agent Skill](https://www.shipstatic.com/SKILL.md)** | `npx skills add shipstatic/plugin` |

## License

MIT
