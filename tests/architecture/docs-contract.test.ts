import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ACCOUNT_TOOL_NAMES } from '../../src/tools.js';
import { PUBLIC_EXPIRY, UPLOAD_TOOL_NAME } from '../../src/vocabulary.js';

/**
 * @file Fence: the PUBLISHED docs track the tool surface.
 *
 * `README.md` ships in the tarball and renders on npm, Glama, and the MCP
 * Registry — for a human deciding whether to install, it IS the product
 * description, and nothing else checks it. The platform has paid for this
 * exact gap before: the 2026-07 `remove` → `delete` rename swept every source
 * file and test, and the published SKILL.md kept teaching three commands that
 * no longer existed, because every fence of that wave fenced code.
 *
 * Two assertions, deliberately narrow. Prose is free to change — the fence
 * holds only the facts the docs restate from code: the tool names, and the
 * one duration the vocabulary owns.
 */

const README = readFileSync(fileURLToPath(new URL('../../README.md', import.meta.url)), 'utf8');
const SERVER_JSON = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../server.json', import.meta.url)), 'utf8'),
);

describe('server.json', () => {
  it('keeps its description inside the MCP Registry limit', () => {
    // The registry refuses `description` over 100 characters with a 422, and
    // it refuses it at PUBLISH — after npm has already accepted the version.
    // That is the worst place to learn it: the release half-lands, the
    // package ships, and the listing keeps serving the previous
    // description, which on 2026-08-14 was the exact "Install for the full
    // toolset" line the wave existed to retire. The npm `description` beside
    // it has no such cap (201 chars today), so the two fields diverge
    // legitimately and only this one is bounded.
    //
    // A literal 100 rather than a derived one: the number is the registry's,
    // published in its API error, and there is nothing in this repo to derive
    // it from. Restating it here is the cheapest place it can be wrong.
    expect(SERVER_JSON.description.length).toBeLessThanOrEqual(100);
  });

  it('names the same package npm does', () => {
    // `mcpName` in package.json must equal `name` in server.json, or the
    // registry entry and the npm package stop being the same product.
    expect(SERVER_JSON.name).toBe('com.shipstatic/mcp');
  });
});

describe('README', () => {
  it('documents exactly the fifteen tools — nothing missing, nothing invented', () => {
    // A table row per tool: `| `tool_name` | description... |`
    const documented = [...README.matchAll(/^\| `([a-z_]+)`/gm)].map((m) => m[1]).sort();

    expect(documented).toEqual([UPLOAD_TOOL_NAME, ...ACCOUNT_TOOL_NAMES].sort());
  });

  it('tells the both-doors story with counts DERIVED from the catalogue', () => {
    // The README sold a placeholder for months after it stopped being true:
    // "the hosted endpoint exposes `deployments_upload` only", written while
    // that was the case and left standing when the hosted door gained the
    // other fourteen. Nothing failed, because prose has no compiler — the
    // exact gap this file exists for, one altitude up from the tool names.
    //
    // Held by DERIVATION rather than by a literal: the two counts come from
    // the catalogue, so adding a tool turns this red until the sentence
    // follows. `word()` throws rather than returning undefined for a count it
    // has no spelling for, because a fence that silently compares against
    // `undefined` is the vacuous-pass class.
    const word = (n: number) => {
      const words: Record<number, string> = {
        13: 'thirteen',
        14: 'fourteen',
        15: 'fifteen',
        16: 'sixteen',
      };
      if (!words[n]) throw new Error(`No spelling for ${n} — add it here and to the README.`);
      return words[n];
    };
    const total = 1 + ACCOUNT_TOOL_NAMES.length;

    expect(README).toContain(`All ${word(total)} tools are on both doors`);
    expect(README).toContain(`the other ${word(ACCOUNT_TOOL_NAMES.length)}`);
    // The upload tool is the anonymous door on BOTH transports, and the
    // sentence above only means something while it names the right one.
    expect(README).toContain(`\`${UPLOAD_TOOL_NAME}\` is the one that needs no account`);
  });

  it('states every duration as the public expiry the vocabulary owns', () => {
    // The README quotes the anonymous-deploy lifetime more than once. Every
    // duration it states must BE the owned phrase — a TTL change that edits
    // `PUBLIC_EXPIRY` (or, later, the types constant it derives from) turns
    // this red until the README follows. The hyphen form is refused outright:
    // one fact in two spellings is how one of them goes stale.
    const durations = README.match(/\b\d+ (?:day|hour)s?\b/g) ?? [];

    expect(durations.length).toBeGreaterThan(0);
    for (const d of durations) expect(d).toBe(PUBLIC_EXPIRY);
    expect(README).not.toMatch(/\b\d+-(?:day|hour)/);
  });
});
