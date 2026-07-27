import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Suite-wide fence: the layout law.
 *
 * Every test file belongs to exactly one axis, and the axis decides its path:
 *
 *   1. MIRROR   `tests/<module>.test.ts` ↔ `src/<module>.ts`
 *               The filename IS the module name. A module needing more than
 *               one file uses `<module>-<aspect>.test.ts`, and the aspect must
 *               be recorded in `CLAUDE.md` (checked below).
 *
 *   2. FEATURE  cross-module flows with no single subject module. Each one is
 *               named in FEATURE_AXIS with its reason — a short recorded list,
 *               not a directory anyone can add to. Empty today.
 *
 *   3. FENCE    `tests/architecture/<invariant>.test.ts` — suite-time
 *               invariants. Assert on structure, not behaviour.
 *
 * Why a fence and not prose, in a suite this small: because the law is cheap
 * to state now and expensive to reconstruct later. `npm/ship` learned that the
 * other way round — by the time prose was insufficient it had a
 * `tests/integration/` that mocked HTTP in 8 of 9 files, a `tests/mixed-core/`
 * mirroring no src directory, and filenames like
 * `unknown-commands-comprehensive`. Three source modules is exactly when this
 * costs nothing.
 */

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

/**
 * Qualifiers that describe the TEST rather than its SUBJECT. A filename should
 * let a reader predict which module it covers; these actively prevent that.
 * Carried over verbatim from `npm/ship/tests/architecture/test-naming.test.ts`
 * — one platform list, so a habit learned in one repo transfers.
 */
const BANNED_QUALIFIERS = [
  'comprehensive',
  'advanced',
  'basics',
  'basic',
  'simple',
  'elegant',
  'unified',
  'reliability',
  'essential',
  'focused',
  'misc',
  'extra',
  'additional',
  'edge-cases',
  'regression',
  'consistency',
  'final',
  'new',
  'old',
];

/**
 * FEATURE axis — files with no single subject module, each with its reason.
 * Adding to this list is a decision; drifting into it is not possible, because
 * the mirror rule rejects anything not named here.
 */
const FEATURE_AXIS: ReadonlyArray<{ file: string; reason: string }> = [];

/** `tests/<dir>/` roots that hold no mirrors. */
const NON_MIRROR_DIRS = ['tests/architecture', 'tests/mocks', 'tests/fixtures'];

function collect(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) collect(full, acc);
    else if (entry.name.endsWith('.test.ts')) acc.push(full.slice(ROOT.length));
  }
  return acc;
}

const testFiles = collect(join(ROOT, 'tests'));

/** `tests/server-calls.test.ts` → subject basename `server-calls`. */
const subjectName = (rel: string) => basename(rel).replace(/\.(unit|e2e)?\.?test\.ts$/, '');

describe('test layout law', () => {
  it('collects the suite (guards against a broken walk silently passing)', () => {
    expect(testFiles.length).toBeGreaterThanOrEqual(6);
  });

  it('no filename carries a qualifier that describes the test instead of its subject', () => {
    const offenders = testFiles.filter((rel) => {
      const parts = subjectName(rel).split(/[-.]/);
      return BANNED_QUALIFIERS.some((q) =>
        q.includes('-')
          ? subjectName(rel).includes(q)
          : parts.includes(q) || parts.includes(`${q}s`),
      );
    });

    expect(
      offenders,
      'A test filename must name its SUBJECT so a reader can predict which ' +
        `module it covers. Banned qualifiers: ${BANNED_QUALIFIERS.join(', ')}.`,
    ).toEqual([]);
  });

  // One walk classifies every mirror-axis file: unmatched (offender), exact
  // mirror, or aspect split (`<module>-<aspect>` where a shorter prefix matched).
  const mirrorOffenders: string[] = [];
  const aspectSplits: string[] = [];
  const featureFiles = new Set(FEATURE_AXIS.map((f) => f.file));

  for (const rel of testFiles) {
    if (featureFiles.has(rel)) continue;
    if (NON_MIRROR_DIRS.some((d) => rel.startsWith(d))) continue;

    const name = subjectName(rel);
    const srcDir = join(ROOT, dirname(rel).replace(/^tests/, 'src'));

    // Longest module prefix first, so `server-calls` resolves against
    // `server.ts` rather than failing on the full basename.
    const segments = name.split('-');
    let matched = 0;
    for (let take = segments.length; take >= 1; take--) {
      const candidate = segments.slice(0, take).join('-');
      if (
        existsSync(join(srcDir, `${candidate}.ts`)) ||
        existsSync(join(srcDir, candidate, 'index.ts'))
      ) {
        matched = take;
        break;
      }
    }

    if (matched === 0) mirrorOffenders.push(rel);
    else if (matched < segments.length) aspectSplits.push(rel);
  }

  it('every mirror-axis file corresponds to a src module', () => {
    expect(
      mirrorOffenders,
      'A test file must be named <module>.test.ts for a module that exists in ' +
        'the sibling src directory, or be recorded in FEATURE_AXIS with a ' +
        'reason. A test whose subject lives elsewhere belongs elsewhere.',
    ).toEqual([]);
  });

  it('every aspect split is recorded in CLAUDE.md by full basename', () => {
    // Makes "the aspect must be recorded" mechanical rather than a habit, so
    // filename → recorded reason always resolves.
    const doc = readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8');
    const unrecorded = aspectSplits.filter((rel) => !doc.includes(subjectName(rel)));

    expect(
      unrecorded,
      "An aspect split (<module>-<aspect>.test.ts) must be recorded in CLAUDE.md's " +
        'testing section, so the split is a decision rather than drift.',
    ).toEqual([]);
  });

  it('every recorded feature-axis file still exists', () => {
    const missing = FEATURE_AXIS.filter((f) => !testFiles.includes(f.file));

    expect(missing.map((f) => f.file)).toEqual([]);
  });
});
