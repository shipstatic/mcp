import {
  IDEMPOTENCY_KEY_CONSTRAINTS,
  LABEL_CONSTRAINTS,
  PASSWORD_CONSTRAINTS,
} from '@shipstatic/ship';
import { describe, expect, it } from 'vitest';
import { ANNOTATIONS, PARAM_DESCRIPTIONS } from '../src/vocabulary.js';

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
