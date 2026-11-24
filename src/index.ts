/**
 * The library entry. Importing this file has no side effects.
 *
 * `bin.ts` is the executable; this is what a consumer imports. Two consumers
 * exist: the hosted Streamable-HTTP server, which serves the same fifteen
 * tools, and the VS Code extension, which bundles a stdio server by composing
 * `createServer` in its own entry point.
 *
 * **The surface is exactly what a second consumer needs.** Each name answers
 * a question a consumer would otherwise answer for itself, with a copy:
 *
 * - `SERVER_NAME`, `SERVER_INFO`: who the server says it is.
 * - `UPLOAD_TOOL_NAME`, `UPLOAD_TOOL_TITLE`: the one tool each transport
 *   authors, under one name and one title.
 * - `TOOLS`, `annotate`, `titled`, `ACCOUNT_TOOL_NAMES`,
 *   `registerAccountTools`: the registry, what derives from it, and the
 *   fourteen shared tools.
 * - `INSTRUCTION_BLOCKS`, `DESCRIPTION_BLOCKS`, `PARAM_DESCRIPTIONS`,
 *   `PUBLIC_EXPIRY`: the sentences both transports say.
 * - `createCall`, `ERROR_META_KEY` and their types: the result envelope.
 * - `createServer`: stdio's whole composition, for a host that bundles it.
 *
 * `createServer` takes the host's own facts as arguments: the version it
 * reports and the origin its uploads carry. That keeps `node:module` out of
 * this graph, which the hosted server loads on a runtime with no Node
 * builtins (`tests/architecture/worker-safety.test.ts`). Its upload tool
 * takes a filesystem path, so a host with no filesystem authors its own
 * upload and registers the shared fourteen.
 *
 * `tests/index.test.ts` holds the list in both directions: an export added
 * here is a breaking change to remove.
 */

export {
  type AuthFailure,
  type CallFn,
  type CallOptions,
  createCall,
  ERROR_META_KEY,
  type ErrorHints,
} from './call.js';
export { createServer } from './server.js';
export {
  ACCOUNT_TOOL_NAMES,
  type AccountToolName,
  registerAccountTools,
  TOOLS,
  type ToolName,
} from './tools.js';
export {
  annotate,
  DESCRIPTION_BLOCKS,
  INSTRUCTION_BLOCKS,
  PARAM_DESCRIPTIONS,
  PUBLIC_EXPIRY,
  SERVER_INFO,
  SERVER_NAME,
  type ToolContract,
  titled,
  UPLOAD_TOOL_NAME,
  UPLOAD_TOOL_TITLE,
} from './vocabulary.js';
