/**
 * The library entry — importing this file has NO side effects.
 *
 * That is the whole point of it: `bin.ts` is the executable, and this is what
 * a consumer imports. Today there is exactly one such consumer, the hosted
 * Streamable-HTTP transport in the platform's private `cloudflare/mcp`, which
 * takes the vocabulary below rather than re-authoring the strings an agent
 * reads. "One product, two transports" is only true if one of them can import
 * the other.
 *
 * **The surface is curated, not swept.** Every export here is a deliberate
 * public commitment under semver; the modules behind it hold plenty that is
 * not (`toErrorResult`, `safeStringify`, the INSTRUCTIONS template, every tool
 * registration). `export *` would publish implementation detail and make the
 * next refactor a breaking change. `tests/index.test.ts` fences both
 * directions — nothing missing, nothing extra.
 */

export { type CallFn, type CallOptions, call, createCall, type ErrorHints } from './call.js';
export { createServer } from './server.js';
export { registerAccountTools } from './tools.js';
export { ANNOTATIONS, PARAM_DESCRIPTIONS } from './vocabulary.js';
