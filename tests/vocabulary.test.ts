import {
  IDEMPOTENCY_KEY_CONSTRAINTS,
  LABEL_CONSTRAINTS,
  PASSWORD_CONSTRAINTS,
} from '@shipstatic/ship';
import { PUBLIC_DEPLOYMENT_TTL_SECONDS } from '@shipstatic/types';
import { describe, expect, it } from 'vitest';
import {
  ANNOTATIONS,
  DESCRIPTION_BLOCKS,
  INSTRUCTION_BLOCKS,
  PARAM_DESCRIPTIONS,
  PUBLIC_EXPIRY,
} from '../src/vocabulary.js';

/**
 * @file The shared vocabulary — `src/vocabulary.ts`.
 *
 * These values are the reason this package is importable at all: the hosted
 * transport takes them rather than re-authoring the strings an agent reads.
 * `server.test.ts` pins how they APPEAR in the catalogue; this file pins the
 * two properties that make sharing safe — that the numbers stay derived, and
 * that `CREATE` withholds the one hint it must never make.
 */

describe('parameter descriptions', () => {
  it.each([
    ['labels', PARAM_DESCRIPTIONS.labels, LABEL_CONSTRAINTS.MAX_LENGTH],
    ['password', PARAM_DESCRIPTIONS.password, PASSWORD_CONSTRAINTS.MAX_LENGTH],
    [
      'idempotencyKey',
      PARAM_DESCRIPTIONS.idempotencyKey,
      IDEMPOTENCY_KEY_CONSTRAINTS.WINDOW_SECONDS / 3600,
    ],
  ])('%s interpolates the platform constant rather than restating it', (_name, text, bound) => {
    // The point of sharing prose is lost if the NUMBERS inside it are typed by
    // hand: the hosted side's test mock once declared labels as 2–32 against a
    // real 3–25, so its suite rendered a describe production never emitted and
    // nothing could tell. Asserting the live constant appears keeps the string
    // shared AND the number derived.
    expect(text).toContain(String(bound));
  });

  it('teaches the label count cap, which the API enforces', () => {
    expect(PARAM_DESCRIPTIONS.labels).toContain(`Up to ${LABEL_CONSTRAINTS.MAX_COUNT}`);
  });

  it('keys the ATTEMPT and says so in the direction that is correct', () => {
    // The rule inverts under one word, and it has already inverted once: the
    // `idempotencyKey` JSDoc in `@shipstatic/types` reads "never one that
    // varies per attempt", which names the try an attempt and so states the
    // opposite rule. An agent following the inverted form mints a fresh key on
    // every retry, which makes the option do nothing at all. Pin the direction,
    // not just the number.
    expect(PARAM_DESCRIPTIONS.idempotencyKey).toContain('Key the ATTEMPT');
    expect(PARAM_DESCRIPTIONS.idempotencyKey).toContain('never one minted fresh on each retry');
  });

  it('ttl teaches both refusals — either one omitted is a deploy an agent will attempt and lose', () => {
    // The platform refuses a ttl twice, and the two are unrelated: an anonymous
    // deploy has no deployer to hold a lease, and a domain is a commitment
    // whose opposite is a deadline. An agent that learns neither discovers them
    // as errors; the one that learns them sequences correctly the first time.
    // `server.test.ts` pins the sentence, this pins the two rules inside it.
    expect(PARAM_DESCRIPTIONS.ttl).toContain('Only for authenticated deploys');
    expect(PARAM_DESCRIPTIONS.ttl).toContain('cannot be linked to a custom domain');
  });

  it('ttl states no number at all — the range has an owner, and this is not it', () => {
    // `TTL_CONSTRAINTS` bounds the value and `validateTtl` enforces it in the
    // same process, before a byte is uploaded, in the constitution's own words.
    // A digit here would be either a bound (a second owner) or an example
    // duration (a lease the platform did not choose). If a future author wants
    // one anyway, that is a decision — made here, deliberately, not discovered
    // later as prose disagreeing with a validator.
    expect(PARAM_DESCRIPTIONS.ttl).not.toMatch(/\d/);
  });
});

describe('the one-fact-one-owner rule, mechanized', () => {
  // Everything exported here is read by BOTH transports, so a shared string
  // that names how a caller authenticates puts one door's fact in the other's
  // mouth. That is not hypothetical: both hosted strings named this package's
  // env var, stdio 0.7.0 renamed it, and nothing failed — the Worker simply
  // began giving advice that silently lands a user's deploy in the wrong
  // account (`cloudflare/mcp/CLAUDE.md`, "The one-fact-one-owner rule").
  //
  // The hosted side fences its own error hints the same way. This is the half
  // that lives with the shared vocabulary, so a describe added here can never
  // become the next copy — and it is derived from the exports rather than a
  // list, so a member nobody has written yet is covered already.
  const SHARED_STRINGS = Object.entries({
    ...PARAM_DESCRIPTIONS,
    ...INSTRUCTION_BLOCKS,
    ...DESCRIPTION_BLOCKS,
  });

  it.each(SHARED_STRINGS)('%s names no SHIP_* environment variable', (_name, text) => {
    // stdio owns `SHIP_TOKEN` and says it in `server.ts`, where the sentence is
    // genuinely its own; the hosted door owns "connect an account". Neither
    // belongs in a string both of them read.
    expect(text).not.toMatch(/SHIP_[A-Z_]+/);
  });

  it('sees a variable name when there is one to see, so the sweep above cannot pass vacuously', () => {
    // A fence over derived input must be shown capable of failing: an empty
    // export map, a renamed member, or a regex typo would otherwise report a
    // clean surface it never actually read.
    expect(SHARED_STRINGS.length).toBeGreaterThan(0);
    expect('Set a free SHIP_TOKEN environment variable.').toMatch(/SHIP_[A-Z_]+/);
  });
});

describe('the public-deploy expiry', () => {
  it('is derived from the platform constant, not written out', () => {
    // The whole point of the export it reads. Every agent-facing "3 days" on
    // both transports resolves through this one value, so a TTL change reaches
    // the prose without anyone editing prose — and the assertion computes the
    // expectation the same way rather than pinning the string, which would put
    // the literal back in a second place.
    expect(PUBLIC_EXPIRY).toBe(`${PUBLIC_DEPLOYMENT_TTL_SECONDS / 86_400} days`);
  });

  it('reads as a duration a sentence can contain', () => {
    // It is interpolated mid-sentence on both doors ("expire in …", "the site
    // expires in … unless claimed"), so it must carry its unit and nothing
    // else — no leading article, no trailing period.
    expect(PUBLIC_EXPIRY).toMatch(/^\d+ (day|days|hour|hours)$/);
  });
});

describe('annotations', () => {
  it('withholds idempotentHint from CREATE — a deploy is not retry-safe by default', () => {
    // The property is per-CALL (true only when the caller passes an
    // idempotencyKey) while the annotation is a static per-TOOL claim. Setting
    // it would tell every agent that any retry is free, which is false for the
    // keyless caller — the common one. This is the assertion that makes the
    // absence a decision instead of an oversight.
    expect(ANNOTATIONS.CREATE).not.toHaveProperty('idempotentHint');
    expect(ANNOTATIONS.CREATE.readOnlyHint).toBe(false);
    expect(ANNOTATIONS.CREATE.destructiveHint).toBe(false);
  });

  it.each([
    ['READ', ANNOTATIONS.READ, true],
    ['WRITE', ANNOTATIONS.WRITE, false],
    ['DESTRUCTIVE', ANNOTATIONS.DESTRUCTIVE, false],
  ])('%s is idempotent and declares its read/write nature', (_kind, annotation, readOnly) => {
    expect(annotation.idempotentHint).toBe(true);
    expect(annotation.readOnlyHint).toBe(readOnly);
  });

  it('marks every tool open-world — this server reaches a remote platform', () => {
    for (const annotation of Object.values(ANNOTATIONS)) {
      expect(annotation.openWorldHint).toBe(true);
    }
  });
});
