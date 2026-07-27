/**
 * @file The protocol harness: a REAL `Client` talking to the REAL server over
 * a linked in-memory transport pair.
 *
 * This is the whole reason the suite was rewritten. The previous tests spied
 * on `McpServer.prototype.registerTool`, captured the handler callbacks, and
 * invoked them as plain functions. Three things were invisible that way, and
 * all three are the product:
 *
 *   1. **Zod never ran.** Handlers were called with hand-built argument
 *      objects, so `deployments_upload` accepted `{ path: 123 }`. The input
 *      schemas — the contract an agent programs against — were unpinned.
 *   2. **`tools/list` was never issued.** Tool descriptions and parameter
 *      descriptions ARE the agent-facing UX, and nothing asserted them.
 *   3. **The wire format was never exercised.** No JSON-RPC round trip, no
 *      `CallToolResult` serialization.
 *
 * `InMemoryTransport.createLinkedPair()` is the SDK's own answer to this and
 * costs nothing: no sockets, no child process, ~1ms per connection. Every
 * assertion in this suite therefore describes something a real MCP client
 * would actually observe.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type Ship from '@shipstatic/ship';
import { createServer } from '../src/server.js';
import { createShipFake, type ShipFake } from './mocks/ship.js';

export interface Harness {
  /** A real MCP client, connected. Drive the server only through this. */
  client: Client;
  /** The fake behind the server, for arrange and assert. */
  ship: ShipFake;
  close: () => Promise<void>;
}

export async function connect(ship: ShipFake = createShipFake()): Promise<Harness> {
  // `ShipSurface` proves the fake covers everything `createServer` consumes;
  // the cast past `Ship` itself is unavoidable and inert — a class type also
  // carries private and protected members no structural value can supply.
  const server = createServer(ship as unknown as Ship);
  const client = new Client({ name: 'mcp-test-client', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  return {
    client,
    ship,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

/**
 * The text an agent reads.
 *
 * Deliberately narrows at RUNTIME from the widest thing `callTool` can return.
 * Its declared result is a union — the modern `CallToolResult` and the legacy
 * `toolResult` compatibility shape — and content blocks may be text, image,
 * audio, or a resource link. A cast would make every one of those failure
 * modes surface as `undefined` flowing into a `toContain` that then passes.
 * This throws instead, naming what it actually got.
 */
export function textOf(result: ToolCallResult): string {
  const [first] = Array.isArray(result.content) ? result.content : [];
  if (!isTextBlock(first)) {
    throw new Error(`expected a text content block, got: ${JSON.stringify(result.content)}`);
  }
  return first.text;
}

/**
 * Every shape `callTool` can resolve to. Written as an index signature rather
 * than `{ content?: unknown }` on purpose: the latter is a WEAK type, and TS
 * rejects the legacy `{ toolResult }` branch against it for having no
 * properties in common — the exact case this helper needs to accept and then
 * reject at runtime with a useful message.
 */
type ToolCallResult = Record<string, unknown>;

type TextBlock = Extract<CallToolResult['content'][number], { type: 'text' }>;

function isTextBlock(value: unknown): value is TextBlock {
  if (typeof value !== 'object' || value === null) return false;
  const block = value as Record<string, unknown>;
  return block.type === 'text' && typeof block.text === 'string';
}

/** `textOf` plus `JSON.parse` — the success path of every data-returning tool. */
export function jsonOf(result: ToolCallResult): unknown {
  return JSON.parse(textOf(result));
}
