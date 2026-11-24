import { ErrorType, ShipError } from '@shipstatic/types';
import { describe, expect, it } from 'vitest';
import { type AuthFailure, createCall, ERROR_META_KEY, forbiddenHint } from '../src/call.js';
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
 *
 * The hints are planted, so every expectation states a literal this file
 * chose. What stdio's own hints say is asserted where an agent reads them,
 * through the protocol, in `server-calls.test.ts`.
 */

const HINTS = { authentication: 'PLANTED AUTH HINT', forbidden: 'PLANTED FORBIDDEN HINT' };
const call = createCall({ hints: HINTS });

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
  it('appends the transport’s authentication hint to authentication failures', async () => {
    const result = await call(() => Promise.reject(ShipError.authentication('Invalid API key')));

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('Invalid API key\n\nHint: PLANTED AUTH HINT');
  });

  it('appends the transport’s forbidden hint to forbidden failures', async () => {
    const result = await call(() =>
      Promise.reject(ShipError.forbidden('Deployment limit reached')),
    );

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('Deployment limit reached\n\nHint: PLANTED FORBIDDEN HINT');
  });

  it('appends a do-not-loop hint to maintenance failures', async () => {
    // The platform is closed on purpose, so no retry can succeed and a loop
    // only spends the caller's budget discovering that. The reassurance is
    // carried too, because the agent is the one relaying it to a person.
    const result = await call(() =>
      Promise.reject(
        ShipError.maintenance('ShipStatic is briefly down for scheduled maintenance.'),
      ),
    );

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('ShipStatic is briefly down for scheduled maintenance.');
    expect(textOf(result)).toContain('Do not retry in a loop');
    expect(textOf(result)).toContain('Deployed sites are unaffected');
    // Not a credential problem: the authentication hint would send the agent
    // to reconnect against a door that is closed for everyone.
    expect(textOf(result)).not.toContain(HINTS.authentication);
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
   * The arms that earn a hint, and the phrase each must carry. Everything NOT
   * listed here relays verbatim — a hint on any other type would send the
   * agent chasing a problem it does not have.
   *
   * The tests above pin what these hints SAY; this table pins only that they
   * are the complete set of arms that get one. Two are per-transport
   * (`ErrorHints`); maintenance is a module constant, because a closed
   * platform is closed identically everywhere — the table does not care about
   * that distinction, only about which arms speak.
   */
  const HINTED: Partial<Record<ErrorType, string>> = {
    [ErrorType.Authentication]: 'PLANTED AUTH HINT',
    [ErrorType.Forbidden]: 'PLANTED FORBIDDEN HINT',
    [ErrorType.Maintenance]: 'Do not retry in a loop',
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
    'carries the wire’s own %s payload under its _meta key, on every arm',
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
      expect(result._meta?.[ERROR_META_KEY]).toEqual({ ...error.toResponse() });
      expect(result._meta?.[ERROR_META_KEY]).toMatchObject({ error: type, status: 429 });
      // Never as `structuredContent`, which the tool's output schema describes:
      // a client validating it against that schema hides the refusal.
      expect(result).not.toHaveProperty('structuredContent');
    },
  );

  it('leaves the text authoritative — the structure rides beside it, never instead', async () => {
    // The hint is the actionable half and lives only in the prose. A client
    // that reads the structure alone must not lose it, which is why this
    // asserts both channels on the same result rather than either alone.
    const result = await call(() =>
      Promise.reject(ShipError.authentication('Authentication required')),
    );

    expect(textOf(result)).toContain('Hint: PLANTED AUTH HINT');
    expect(result._meta?.[ERROR_META_KEY]).toMatchObject({
      error: ErrorType.Authentication,
      status: 401,
    });
  });
});

describe('onAuthFailure — the credential-refusal seam', () => {
  /**
   * A `call` that records refusals instead of only rendering them. An HTTP
   * transport needs this because a client learns it must authenticate from a
   * real `401`, and ignores a `WWW-Authenticate` header on a `200` — so
   * "please authenticate" as tool TEXT is a dead end there.
   *
   * What is under test is which arms report, and that the reporting changes
   * nothing the agent receives.
   */
  function recording() {
    const failures: AuthFailure[] = [];
    const recordingCall = createCall({
      hints: HINTS,
      onAuthFailure: (failure) => failures.push(failure),
    });
    return { failures, call: recordingCall };
  }

  const reject = (error: unknown) => () => Promise.reject(error);

  it('reports an authentication refusal, naming no scope', async () => {
    // Absent, malformed, unknown or expired — the transport cannot tell which
    // and does not need to: all four mean "no usable credential".
    const { failures, call: c } = recording();

    await c(reject(ShipError.authentication('Authentication required')));

    expect(failures).toEqual([{}]);
  });

  it('reports a scope refusal, naming the scope the API named', async () => {
    // The scope is what lets a client drive re-consent rather than report a
    // dead end, so it is carried through verbatim from `details`.
    const { failures, call: c } = recording();

    await c(
      reject(
        new ShipError(ErrorType.Forbidden, 'The connected app was not granted access', 403, {
          requiredScope: 'domains:write',
        }),
      ),
    );

    expect(failures).toEqual([{ requiredScope: 'domains:write' }]);
  });

  it('gives a scope refusal no hint: the forbidden hint says to stop, and consent fixes this', async () => {
    // One result must not carry two next steps. The refusal is reported, so
    // a transport can ask for consent, and the text is the API's own.
    const { call: c } = recording();

    const result = await c(
      reject(
        new ShipError(ErrorType.Forbidden, 'The connected app was not granted access', 403, {
          requiredScope: 'domains:write',
        }),
      ),
    );

    expect(textOf(result)).toBe('The connected app was not granted access');
  });

  it('stays SILENT on a forbidden refusal that no scope could fix', async () => {
    // The load-bearing half. Plan limits, a terminated account, and the
    // actions the ceiling refuses outright all land on the Forbidden arm.
    // Reporting them would turn an honest answer into an authentication
    // challenge, and send the caller round a consent flow that changes
    // nothing — on the one door whose anonymous half must never regress.
    const { failures, call: c } = recording();

    await c(reject(ShipError.forbidden('Plan limits reached')));
    await c(reject(ShipError.forbidden('This action is not available to connected apps')));

    expect(failures).toEqual([]);
  });

  it.each(Object.values(ErrorType).filter((t) => t !== ErrorType.Authentication))(
    'stays silent on a %s error',
    async (type) => {
      // Swept over the type domain rather than spot-checked: the question is
      // not "does it fire for the arms I thought of" but "does it fire for
      // anything else at all". A scope-less Forbidden is included here.
      const { failures, call: c } = recording();

      await c(reject(new ShipError(type, 'Upstream said no')));

      expect(failures).toEqual([]);
    },
  );

  it.each([
    ['a non-string scope', { requiredScope: 42 }],
    ['an empty scope', { requiredScope: '' }],
    ['unrelated details', { limit: 'free' }],
    ['no details at all', undefined],
  ])('treats forbidden with %s as an ordinary refusal', async (_case, details) => {
    // `details` is `unknown` on the wire by design, so the read narrows
    // rather than casts — and anything that is not a usable scope name means
    // no scope was named.
    const { failures, call: c } = recording();

    await c(reject(new ShipError(ErrorType.Forbidden, 'No', 403, details)));

    expect(failures).toEqual([]);
  });

  it('changes nothing the agent receives', async () => {
    // A notification, not a substitution: the text envelope and its hint are
    // the contract, and observing a refusal must not quietly alter them.
    const { call: c } = recording();

    const observed = await c(reject(ShipError.authentication('Authentication required')));
    const plain = await call(reject(ShipError.authentication('Authentication required')));

    expect(observed.isError).toBe(true);
    expect(observed).toEqual(plain);
  });

  it('is optional — a call without it behaves exactly as before', async () => {
    const result = await call(reject(ShipError.authentication('Authentication required')));

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Hint: PLANTED AUTH HINT');
  });
});

describe('forbiddenHint', () => {
  it('says the same sentence around the console address it is given', () => {
    // One fact, worded once for both transports. The address is the only
    // part a transport supplies, so a planted one must come back verbatim.
    expect(forbiddenHint('https://console.example.test')).toBe(
      'Stop retrying: this cannot succeed as sent. The account may be at its plan limits, or the action may be one this credential can never take (a connected app cannot create credentials or delete the account). Manage the account at https://console.example.test.',
    );
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
