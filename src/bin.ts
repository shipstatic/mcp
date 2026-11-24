#!/usr/bin/env node
/**
 * The executable: `dist/bin.js`, the file `npx @shipstatic/mcp` runs, and the
 * only module here with side effects on import. `index.ts` beside it is the
 * library and stays inert.
 */
import { createRequire } from 'node:module';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import Ship from '@shipstatic/ship';
import { normalizeVia, SHIP_ENV, SHIP_VIA_ENV } from '@shipstatic/types';
import { createServer } from './server.js';

// The executable knows its own manifest; the library takes the version as an
// argument, so nothing it exports needs `node:module`.
const { version } = createRequire(import.meta.url)('../package.json') as { version: string };

async function main() {
  // `SHIP_TOKEN` is optional: without it, deployments are public and expire.
  // One slot, any platform token. The value's prefix says what it is (`ship-`
  // API key, `deploy-` deploy token, `oauth-` access token, anything else an
  // opaque bearer) and the API classifies it; this server never looks.
  const ship = new Ship({ token: process.env[SHIP_ENV.TOKEN] });
  // Unset, this executable is the `mcp` origin. A wrapper that composes this
  // invocation names its own surface through `SHIP_VIA_ENV`, the slot the CLI
  // shares. An unrecognized label is dropped, so a typo records `mcp`.
  const server = createServer(ship, { version, via: normalizeVia(process.env[SHIP_VIA_ENV]) });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('ShipStatic MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
