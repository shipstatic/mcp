#!/usr/bin/env node
/**
 * THE EXECUTABLE — `dist/bin.js`, the file `npx @shipstatic/mcp` runs. It is
 * the only module here with side effects on import.
 *
 * `index.ts` beside it is a library and stays inert, which is what lets the
 * hosted transport import this package's vocabulary instead of re-authoring
 * it. The two used to be one file: `main` and `bin` in `package.json` both
 * pointed at `index.ts`, so importing the package started a stdio server and,
 * on failure, called `process.exit` in its consumer. Nothing could be shared
 * because there was nothing importable to share. `npm/ship` split the same
 * knot the same way (`bin.ts` executable, `index.ts` library) — a module
 * boundary says the same thing to every caller.
 */
import { createRequire } from 'node:module';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import Ship from '@shipstatic/ship';
import { SHIP_ENV } from '@shipstatic/types';
import { createServer } from './server.js';

// The executable knows its own manifest; the library it drives does not have
// to. `createServer` takes the version as an argument precisely so no module
// below this one needs `node:module` in its import graph.
const { version } = createRequire(import.meta.url)('../package.json') as { version: string };

async function main() {
  // SHIP_TOKEN is optional — without it, deployments are public (3-day expiry).
  // The SDK coerces empty strings to undefined, so we can pass through directly.
  //
  // One credential slot, any platform token: the value's prefix says what it
  // is (`ship-` API key, `deploy-` deploy token, anything else an opaque
  // bearer) and the server classifies it. MCP never has to know which kind it
  // holds.
  const ship = new Ship({ token: process.env[SHIP_ENV.TOKEN] });
  // No `via` — this executable IS the `mcp` origin, which is the default.
  const server = createServer(ship, { version });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('ShipStatic MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
