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

// Smithery sandbox: allows capability scanning without real credentials
export function createSandboxServer() {
  return createServer(new Ship({ apiKey: 'sandbox' }));
}

const apiKey = process.env.SHIP_API_KEY;
if (apiKey) {
  const server = createServer(new Ship({ apiKey }));
  const transport = new StdioServerTransport();
  server.connect(transport).catch(console.error);
} else {
  console.error('Shipstatic MCP server v0.1.7');
  console.error('This is a stdio server for MCP clients.\n');
  console.error('SHIP_API_KEY environment variable is required.\n');
  console.error('Add to your MCP client config:\n');
  console.error(CONFIG_EXAMPLE);
}
