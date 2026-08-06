import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { describe, expect, it } from 'vitest';

/**
 * @file Fence: the LIBRARY graph carries no Node builtin.
 *
 * `index.ts` is imported by a Cloudflare Worker — the hosted Streamable-HTTP
 * transport in the platform's private `cloudflare/mcp`. That is the whole
 * reason this package has a library entry at all, and the whole reason
 * `createServer` takes its `version` as an ARGUMENT: reading a manifest here
 * would mean `node:module`, in a module the Worker also loads.
 *
 * Until now that invariant was proven only by a PRIVATE downstream repo's
 * build failing — late, elsewhere, and after a publish. The failure mode is
 * exactly a `pnpm test` away instead, and it is not hypothetical: the obvious
 * next admission to this package's public surface was a `startStdio` composing
 * the transport for its consumers, and `@modelcontextprotocol/sdk`'s
 * `server/stdio.js` imports `node:process`. That export would have built
 * green, published green, and broken the Worker.
 *
 * `bin.ts` is exempt BY CONSTRUCTION rather than by an exception list — it is
 * not reachable from `index.ts`. The second assertion below exists so that
 * exemption stays honest: it proves this probe can see a builtin at all, so a
 * broken walk fails loudly instead of passing vacuously.
 */

const SRC = fileURLToPath(new URL('../../src/', import.meta.url));

/**
 * Every `node:` specifier reachable from an entry point.
 *
 * `platform: 'node'` deliberately — builtins then resolve as EXTERNAL and land
 * in the metafile, where they can be counted. Under `platform: 'neutral'` they
 * would surface as resolution errors, and a fence that reads error text
 * reports a bundler's phrasing rather than a fact.
 */
async function builtinsReachableFrom(entry: string): Promise<string[]> {
  const result = await esbuild.build({
    entryPoints: [resolve(SRC, entry)],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
    metafile: true,
    logLevel: 'silent',
    plugins: [
      {
        // TypeScript's ESM-style `./call.js` names the emitted file, which does
        // not exist until a build. Rewriting to `.ts` lets this fence run
        // against SOURCE, so it needs no `dist/` and cannot certify a stale one.
        //
        // Scoped to OUR files by the importer, not by the specifier: published
        // packages ship real `.js` and use the same relative form, so an
        // unscoped rewrite sends esbuild looking for `dist/esm/types.ts` inside
        // every dependency.
        name: 'ts-relative-imports',
        setup(build) {
          build.onResolve({ filter: /^\.\.?\// }, (args) => {
            if (!args.importer.startsWith(SRC)) return null;
            return { path: resolve(dirname(args.importer), args.path.replace(/\.js$/, '.ts')) };
          });
        },
      },
    ],
  });

  const found = new Set<string>();
  for (const input of Object.values(result.metafile.inputs)) {
    for (const imported of input.imports) {
      if (imported.path.startsWith('node:')) found.add(imported.path);
    }
  }
  return [...found].sort();
}

describe('worker safety', () => {
  it('the library entry reaches no Node builtin', async () => {
    expect(
      await builtinsReachableFrom('index.ts'),
      'A `node:` builtin entered the graph the Workers-hosted transport imports. ' +
        'If it arrived with a new export, that export belongs behind its own entry ' +
        "point — do not weaken this fence to admit it. See this file's header.",
    ).toEqual([]);
  }, 30_000);

  it('sees the builtins the EXECUTABLE legitimately uses', async () => {
    // The control. `bin.ts` owns process policy — `node:module` to read its own
    // manifest, `node:process` through the stdio transport — and is exempt
    // because `index.ts` cannot reach it. A probe that reported "none" here
    // would be measuring nothing, and the assertion above would be a tautology.
    expect(await builtinsReachableFrom('bin.ts')).toContain('node:module');
  }, 30_000);
});
