#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

if (process.stdin.isTTY) {
  console.error('Shipstatic MCP server v0.1.0');
  console.error('This is a stdio server for MCP clients.\n');
  console.error('Add to your MCP client config:\n');
  console.error(JSON.stringify({
    mcpServers: {
      shipstatic: {
        command: 'npx',
        args: ['@shipstatic/mcp'],
        env: { SHIP_API_KEY: 'ship-...' },
      },
    },
  }, null, 2));
  process.exit(0);
}

const server = createServer();
const transport = new StdioServerTransport();
await server.connect(transport);
