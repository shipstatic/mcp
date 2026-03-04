#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import Ship from '@shipstatic/ship';
import { createServer } from './server.js';

const apiKey = process.env.SHIP_API_KEY;
if (!apiKey) {
  console.error('SHIP_API_KEY environment variable is required.');
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
  process.exit(1);
}

async function main() {
  const server = createServer(new Ship({ apiKey }));
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Shipstatic MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
