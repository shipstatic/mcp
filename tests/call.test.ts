import { ShipError } from '@shipstatic/types';
import { describe, expect, it } from 'vitest';
import { call } from '../src/call.js';
import { textOf } from './harness.js';

/**
 * @file `call()` — the single abstraction every tool handler delegates to.
 *
 * This is the exhaustive matrix for the SDK-error → agent-text mapping.
 * `server-calls.test.ts` proves a representative slice of it survives the
 * protocol round trip; this file covers every arm, including the ones no tool
 * can plausibly produce on demand (a circular details object, a rejected
 * non-Error).
 *
 * The through-line: an agent cannot see an exception, only text. So every arm
 * below is judged by what the text lets the agent DO next — retry with a
 * credential, stop retrying, or fix its arguments.
 */

describe('successful results', () => {
  it('serializes data as indented JSON', async () => {
    const result = await call(() => Promise.resolve({ id: 1, name: 'test' }));

    expect(result.isError).toBeUndefined();
    expect(textOf(result)).toBe(JSON.stringify({ id: 1, name: 'test' }, null, 2));
  });

  it('answers "Done." for void operations', async () => {
    // `undefined` is the SDK's success signal for deletes. `JSON.stringify`
    // would produce the literal `undefined` — not valid JSON, and meaningless
    // to a model.
    const result = await call(() => Promise.resolve(undefined));

    expect(result.isError).toBeUndefined();
    expect(textOf(result)).toBe('Done.');
  });

  it('serializes null as the JSON literal, distinct from void', async () => {
    const result = await call(() => Promise.resolve(null));

    expect(result.isError).toBeUndefined();
    expect(textOf(result)).toBe('null');
  });
});

describe('ShipError mapping', () => {
  it('appends the credential hint to authentication failures', async () => {
    const result = await call(() => Promise.reject(ShipError.authentication('Invalid API key')));

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Invalid API key');
    expect(textOf(result)).toContain('SHIP_TOKEN');
  });

  it('appends a stop-retrying hint to forbidden failures', async () => {
    // Forbidden means a plan limit or a terminated account — state no retry
    // can change. Without this, an agent loops until it exhausts its budget.
    const result = await call(() =>
      Promise.reject(ShipError.forbidden('Deployment limit reached')),
    );

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Deployment limit reached');
    expect(textOf(result)).toContain('Stop retrying');
    expect(textOf(result)).toContain('upgrade or contact support');
  });

  it('appends field-level details to validation failures', async () => {
    const result = await call(() =>
      Promise.reject(ShipError.validation('Invalid input', { field: 'name', reason: 'too short' })),
    );

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Invalid input');
    expect(textOf(result)).toContain('"field"');
    expect(textOf(result)).toContain('too short');
  });

  it('omits the details block when a validation error carries none', async () => {
    const result = await call(() => Promise.reject(ShipError.validation('Invalid input')));

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('Invalid input');
  });

  it('survives a circular details object instead of crashing the tool call', async () => {
    const circular: Record<string, unknown> = { field: 'name' };
    circular.self = circular;

    const result = await call(() => Promise.reject(ShipError.validation('Bad input', circular)));

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Bad input');
    // Falls back to `String()` rather than letting JSON.stringify throw —
    // a serialization detail must never turn a validation error into a crash.
    expect(textOf(result)).toContain('Details:');
  });

  it.each([
    ['not found', ShipError.notFound('Deployment', 'brave-otter-a1b2c3d')],
    ['business', ShipError.business('Quota exceeded')],
    ['rate limit', ShipError.rateLimit('Too many requests')],
  ])('relays a %s error with no hint attached', async (_label, error) => {
    // Only authentication and forbidden earn a hint. A hint on any other type
    // would send the agent chasing a credential that is not the problem.
    const result = await call(() => Promise.reject(error));

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(error.message);
  });
});

describe('non-ShipError failures', () => {
  it('relays a plain Error message without leaking a stack trace', async () => {
    const result = await call(() => Promise.reject(new Error('Something went wrong')));

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('Something went wrong');
    expect(textOf(result)).not.toContain('at ');
  });

  it('replaces a non-Error rejection with a generic message', async () => {
    // A thrown string has no message to relay and no shape worth guessing at.
    const result = await call(() => Promise.reject('string error'));

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('An unexpected error occurred');
  });
});
