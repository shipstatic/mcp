#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import Ship from '@shipstatic/ship';
import { createServer } from './server.js';

const CONFIG_EXAMPLE = JSON.stringify({
  mcpServers: {
    shipstatic: {
      command: 'npx',
      args: ['@shipstatic/mcp'],
      env: { SHIP_API_KEY: 'ship-...' },
    },
  },
}, null, 2);

const apiKey = process.env.SHIP_API_KEY;
if (!apiKey) {
  console.error('Shipstatic MCP server v0.1.5');
  console.error('This is a stdio server for MCP clients.\n');
  console.error('SHIP_API_KEY environment variable is required.\n');
  console.error('Add to your MCP client config:\n');
  console.error(CONFIG_EXAMPLE);
  process.exit(1);
}

async function main() {
  const server = createServer(new Ship({ apiKey }));
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
