#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import Ship from '@shipstatic/ship';
import { createServer } from './server.js';

async function main() {
  // SHIP_API_KEY is optional — without it, deployments are public (3-day expiry).
  // The SDK coerces empty strings to undefined, so we can pass through directly.
  const ship = new Ship({ apiKey: process.env.SHIP_API_KEY });
  const server = createServer(ship);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('ShipStatic MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
