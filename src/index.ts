#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import Ship from '@shipstatic/ship';
import { createServer } from './server.js';

const apiKey = process.env.SHIP_API_KEY;

async function main() {
  const ship = apiKey ? new Ship({ apiKey }) : new Ship({});
  const server = createServer(ship);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('ShipStatic MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
