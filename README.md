# @shipstatic/mcp

MCP server for [Shipstatic](https://shipstatic.com) — deploy and manage static sites from AI agents.

Works with Claude Code, Cursor, VS Code Copilot, and any MCP-compatible client.

<a href="https://glama.ai/mcp/servers/@shipstatic/shipstatic">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@shipstatic/shipstatic/badge" alt="shipstatic MCP server" />
</a>

## Setup

### Claude Code

```bash
claude mcp add shipstatic -e SHIP_API_KEY=ship-... -- npx @shipstatic/mcp
```

### Other MCP clients

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "shipstatic": {
      "command": "npx",
      "args": ["@shipstatic/mcp"],
      "env": {
        "SHIP_API_KEY": "ship-..."
      }
    }
  }
}
```

Get your API key at [my.shipstatic.com](https://my.shipstatic.com).

## Tools

### Deployments

| Tool | Description |
|------|-------------|
| `deployments_upload` | Upload deployment from directory |
| `deployments_list` | List all deployments |
| `deployments_get` | Show deployment information |
| `deployments_set` | Set deployment labels |
| `deployments_remove` | Delete deployment permanently |

### Domains

| Tool | Description |
|------|-------------|
| `domains_set` | Create domain, link to deployment, or update labels |
| `domains_list` | List all domains |
| `domains_get` | Show domain information |
| `domains_records` | Get required DNS records for a domain |
| `domains_validate` | Check if domain name is valid and available |
| `domains_verify` | Trigger DNS verification for external domain |
| `domains_remove` | Delete domain permanently |

### Debugging

| Tool | Description |
|------|-------------|
| `whoami` | Show current account information |

## Registry

Published to the [MCP Registry](https://modelcontextprotocol.io) as [`com.shipstatic/mcp`](https://registry.modelcontextprotocol.io/v0.1/servers?search=com.shipstatic/mcp).

## License

MIT