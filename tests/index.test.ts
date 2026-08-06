import { describe, expect, it } from 'vitest';
import * as library from '../src/index.js';

/**
 * @file The PUBLIC SURFACE — `src/index.ts`.
 *
 * This package is consumed two ways, and they have opposite requirements. As
 * an executable (`npx @shipstatic/mcp`) nothing here matters. As a library it
 * is a semver commitment: the hosted transport imports the vocabulary below
 * so that the strings an agent reads exist once rather than twice.
 *
 * The fence runs BOTH directions on purpose. Missing an export breaks the
 * consumer at build time, which is loud and cheap. Adding one is the quiet
 * failure: `export *` would publish `toErrorResult`, `safeStringify`, the
 * INSTRUCTIONS template and every internal, and each of those would then be a
 * breaking change to delete. A package with one known consumer is exactly when
 * that is easy to get wrong and free to fix.
 */

/** Every name `src/index.ts` is meant to expose. Runtime values only — types erase. */
const PUBLIC_API = [
  // The server factory: the whole 15-tool surface over an injected client.
  'createServer',
  // The result wrapper. `call` is stdio's configured instance; `createCall`
  // is what the hosted transport builds its own from, so the success envelope,
  // the `'Done.'` sentinel and the error-arm order are one implementation.
  'call',
  'createCall',
  // The shared agent-facing vocabulary.
  'ANNOTATIONS',
  'PARAM_DESCRIPTIONS',
] as const;

describe('public surface', () => {
  it('exports exactly the curated API — nothing missing, nothing extra', () => {
    expect(Object.keys(library).sort()).toEqual([...PUBLIC_API].sort());
  });

  it('importing the library has no side effects', () => {
    // The reason this file can exist at all. Before the bin/library split,
    // `main` and `bin` were the same module: importing the package started a
    // stdio server and could `process.exit` in its consumer. If that ever
    // returns, this suite hangs or dies rather than failing politely — so the
    // assertion is simply that we got here, having imported at module scope.
    expect(typeof library.createServer).toBe('function');
  });

  it('createCall builds an independent wrapper, so a consumer configures its own hints', async () => {
    // The hosted transport's whole use of this package: same envelope, its own
    // hints. Proving it here means the shared implementation is genuinely
    // parameterised rather than stdio's behaviour with a seam drawn around it.
    const custom = library.createCall({
      hints: { authentication: 'AUTH-HINT', forbidden: 'FORBIDDEN-HINT' },
    });

    const result = await custom(async () => ({ ok: true }));

    expect(result.content).toEqual([{ type: 'text', text: JSON.stringify({ ok: true }, null, 2) }]);
    // No structuredContent unless the consumer asks for it — stdio does not.
    expect(result).not.toHaveProperty('structuredContent');
  });

  describe('structuredContent, the configuration only the hosted transport uses', () => {
    // Exercised HERE rather than left to the consumer's own suite: it is this
    // package's published behaviour, in another repo's build. A branch whose
    // only proof lives downstream is a branch that breaks downstream.
    const hosted = library.createCall({
      hints: { authentication: 'a', forbidden: 'f' },
      structuredContent: true,
    });

    it('attaches a plain object beside the text, for a host that renders it', async () => {
      const wire = { deployment: 'happy-cat-abc1234.shipstatic.com', files: 1 };

      const result = await hosted(async () => wire);

      expect(result.structuredContent).toEqual(wire);
      // The text block is unchanged — a client that ignores structuredContent
      // sees exactly what stdio's clients see.
      expect(result.content).toEqual([{ type: 'text', text: JSON.stringify(wire, null, 2) }]);
    });

    it('withholds it for a non-object result, which no schema could describe', async () => {
      // `structuredContent` is spec'd as an object. An array or a scalar would
      // be a shape no `outputSchema` can validate, so it rides the text channel
      // alone rather than being coerced into one.
      const result = await hosted(async () => [1, 2, 3]);

      expect(result).not.toHaveProperty('structuredContent');
      expect(result.content).toEqual([{ type: 'text', text: JSON.stringify([1, 2, 3], null, 2) }]);
    });

    it('still answers the void sentinel, with nothing structured to carry', async () => {
      const result = await hosted(async () => undefined);

      expect(result.content).toEqual([{ type: 'text', text: 'Done.' }]);
      expect(result).not.toHaveProperty('structuredContent');
    });
  });
});
