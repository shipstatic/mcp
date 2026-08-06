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

describe('README', () => {
  it('documents exactly the fifteen tools — nothing missing, nothing invented', () => {
    // A table row per tool: `| `tool_name` | description... |`
    const documented = [...README.matchAll(/^\| `([a-z_]+)`/gm)].map((m) => m[1]).sort();

    expect(documented).toEqual([UPLOAD_TOOL_NAME, ...ACCOUNT_TOOL_NAMES].sort());
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
