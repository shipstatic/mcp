# @shipstatic/mcp

MCP server for [Shipstatic](https://shipstatic.com) — deploy and manage static sites from AI agents.

Works with Claude Code, Cursor, VS Code Copilot, and any MCP-compatible client.

## Setup

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

## License

MIT
