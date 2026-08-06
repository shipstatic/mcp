import { ErrorType, ShipError } from '@shipstatic/types';
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
 * "Exhaustive" is DERIVED, not claimed — the sweep below enumerates
 * `ErrorType` itself rather than restating a hand-written list, the same way
 * the catalogue interpolates `LABEL_CONSTRAINTS` and the ship fake is
 * `Pick<Ship, …>`. Coverage cannot police this: `handleError` has three
 * branches, so six arms exercise them all and the remaining five would sit
 * untested at 100%. That gap was live when types moved a transport failure
 * from `internal_server_error` to `network_error` — a type this server
 * relays straight to an agent, with nothing asserting what it looks like.
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

  /**
   * The two arms that earn a hint, and the phrase each must carry. Everything
   * NOT listed here relays verbatim — a hint on any other type would send the
   * agent chasing a credential that is not the problem.
   *
   * The tests above pin what these two hints SAY; this table pins only that
   * they are the complete set of arms that get one.
   */
  const HINTED: Partial<Record<ErrorType, string>> = {
    [ErrorType.Authentication]: 'SHIP_TOKEN',
    [ErrorType.Forbidden]: 'Stop retrying',
  };

  it.each(Object.values(ErrorType))(
    'relays a %s error, with a hint only where one is earned',
    async (type) => {
      // Constructed through the public constructor rather than a named factory
      // so the sweep stays a statement about the TYPE DOMAIN — every arm, no
      // exceptions — instead of the subset that happens to have a factory.
      const result = await call(() => Promise.reject(new ShipError(type, 'Upstream said no')));

      expect(result.isError).toBe(true);

      const hint = HINTED[type];
      if (hint) expect(textOf(result)).toContain(hint);
      // Verbatim: no prefix, no suffix, nothing the SDK did not say. This is
      // what makes the assertion bidirectional — a hint added to `call.ts`
      // without a decision recorded above turns this red.
      else expect(textOf(result)).toBe('Upstream said no');
    },
  );

  it.each(Object.values(ErrorType))(
    'carries the wire’s own %s payload as structuredContent, on every arm',
    async (type) => {
      // The typed contract used to terminate at this boundary: an agent got
      // prose and `isError`, so `status`, the `ErrorType` and every `details`
      // payload but the Validation arm's were dropped. The platform's law is
      // that clients branch on type and status and never on message strings —
      // and the agent, the consumer best equipped to obey it, was the only one
      // that could not.
      //
      // Swept over the whole type domain for the same reason the hints are:
      // `toErrorResult` has one ShipError branch, so a single arm would cover
      // it at 100% while ten went unasserted.
      const error = new ShipError(type, 'Upstream said no', 429, { expires: 1786017875 });

      const result = await call(() => Promise.reject(error));

      // `toResponse()` verbatim — not a shape this file invents. It is the
      // same `ErrorResponse` the API put on the wire, so an agent branching on
      // it branches on exactly what every other client sees.
      expect(result.structuredContent).toEqual({ ...error.toResponse() });
      expect(result.structuredContent).toMatchObject({ error: type, status: 429 });
    },
  );

  it('leaves the text authoritative — the structure rides beside it, never instead', async () => {
    // The hint is the actionable half and lives only in the prose. A client
    // that reads `structuredContent` alone must not lose it, which is why this
    // asserts both channels on the same result rather than either alone.
    const result = await call(() =>
      Promise.reject(ShipError.authentication('Authentication required')),
    );

    expect(textOf(result)).toContain('SHIP_TOKEN');
    expect(result.structuredContent).toMatchObject({
      error: ErrorType.Authentication,
      status: 401,
    });
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
