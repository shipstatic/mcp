/**
 * The library entry — importing this file has NO side effects.
 *
 * `bin.ts` is the executable; this is what a consumer imports. Today there is
 * one such consumer, the hosted Streamable-HTTP transport in the platform's
 * private `cloudflare/mcp`, and both transports are converging on the same
 * product: the complete toolset for authenticated callers, the anonymous
 * deploy for everyone else. "One product, two transports" is only true if one
 * of them can import the other.
 *
 * **The surface is exactly what a SECOND TRANSPORT needs — nothing more.**
 * That is the rule, and it is stricter than "curated". `createServer` and the
 * configured `call` are deliberately NOT here: they are stdio's own
 * composition, they have no consumer outside `bin.ts`, and `createServer` in
 * particular builds a tool whose input is a filesystem PATH — a footgun to
 * offer a Worker. Exporting them would make this package's API "stdio's
 * internals, plus some shared bits" instead of a contract.
 *
 * Every name below answers a question the second transport must otherwise
 * answer for itself, and each admission was a restatement deleted, not a
 * convenience added: `SERVER_NAME` and `UPLOAD_TOOL_NAME` were literals in two
 * repos (the first also correlates the Apps-SDK widget to the connector),
 * `PUBLIC_EXPIRY` was the same duration written out eight times,
 * `DESCRIPTION_BLOCKS` the fragments two tool descriptions genuinely share,
 * and `ACCOUNT_TOOL_NAMES` is what lets the hosted catalogue fence name the
 * fourteen without counting them again.
 *
 * `tests/index.test.ts` fences both directions — nothing missing, nothing
 * extra — because adding an export is the quiet failure: everything published
 * becomes a breaking change to remove.
 */

export { type CallFn, type CallOptions, createCall, type ErrorHints } from './call.js';
export { ACCOUNT_TOOL_NAMES, registerAccountTools } from './tools.js';
export {
  ANNOTATIONS,
  DESCRIPTION_BLOCKS,
  INSTRUCTION_BLOCKS,
  PARAM_DESCRIPTIONS,
  PUBLIC_EXPIRY,
  SERVER_NAME,
  UPLOAD_TOOL_NAME,
} from './vocabulary.js';
