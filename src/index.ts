/**
 * The library entry — importing this file has NO side effects.
 *
 * `bin.ts` is the executable; this is what a consumer imports. There are two
 * such consumers: the hosted Streamable-HTTP transport in the platform's
 * private `cloudflare/mcp`, and the VS Code extension
 * (`integrations/vscode`), which bundles a stdio server into its `.vsix`.
 * Both transports are converging on the same product — the complete toolset
 * for authenticated callers, the anonymous deploy for everyone else — and
 * "one product, two transports" is only true if one of them can import the
 * other.
 *
 * **The surface is exactly what a SECOND CONSUMER needs — nothing more.**
 * That is the rule, and it is stricter than "curated". It read "a second
 * TRANSPORT" until 1.0.0-beta.7, when the VS Code extension arrived as a
 * consumer that is not a transport: it wants stdio's own composition,
 * verbatim, running on the user's machine. The wording widened; the strictness
 * did not.
 *
 * Every name below answers a question a consumer must otherwise answer for
 * itself, and each admission was a restatement deleted, not a convenience
 * added: `SERVER_NAME` and `UPLOAD_TOOL_NAME` were literals in two repos (the
 * first also correlates the Apps-SDK widget to the connector), `PUBLIC_EXPIRY`
 * was the same duration written out eight times, `DESCRIPTION_BLOCKS` the
 * fragments two tool descriptions genuinely share, `ACCOUNT_TOOL_NAMES` is
 * what lets the hosted catalogue fence name the fourteen without counting them
 * again, and `createServer` deleted three regexes in another repo's build (see
 * below).
 *
 * **`createServer` is exported; the configured `call` is not.** The extension
 * previously reached stdio's composition by REGEX-PATCHING this package's
 * compiled `dist/` at bundle time — stripping `bin`'s shebang, and rewriting
 * the `createRequire(import.meta.url)('../package.json')` line inside
 * `server.js` to inline a version literal. Three hacks against another
 * package's build output, each of which the 1.x library split broke. A
 * fifteen-line entry point calling `createServer(ship, version)` replaces all
 * of them, which is a restatement deleted rather than a convenience added.
 * `call` stays internal because a consumer configures its own hints through
 * `createCall`, and stdio's instance is not a contract anyone needs.
 *
 * The old reason for withholding `createServer` — that its upload tool takes a
 * filesystem PATH, a footgun to offer a Worker — is still true and is now the
 * CALLER's judgement rather than an absence: `cloudflare/mcp` must keep
 * authoring its own upload tool, and does. An absence cannot express "correct
 * for one consumer, wrong for another"; a documented rule can. What makes the
 * export safe to publish at all is that `createServer` takes its `version` as
 * an ARGUMENT — so exporting it adds no `node:module` to the import graph of a
 * module the Workers-hosted transport loads.
 *
 * `tests/index.test.ts` fences both directions — nothing missing, nothing
 * extra — because adding an export is the quiet failure: everything published
 * becomes a breaking change to remove.
 */

export { type CallFn, type CallOptions, createCall, type ErrorHints } from './call.js';
export { createServer } from './server.js';
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
