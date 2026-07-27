#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import Ship from '@shipstatic/ship';
import { createServer } from './server.js';

async function main() {
  // SHIP_TOKEN is optional — without it, deployments are public (3-day expiry).
  // The SDK coerces empty strings to undefined, so we can pass through directly.
  //
  // One credential slot, any platform token: the value's prefix says what it
  // is (`ship-` API key, `deploy-` deploy token, anything else an opaque
  // bearer) and the server classifies it. MCP never has to know which kind it
  // holds.
  const ship = new Ship({ token: process.env.SHIP_TOKEN });
  const server = createServer(ship);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('ShipStatic MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
