/**
 * The result envelope: SDK promise in, MCP `CallToolResult` out.
 *
 * Everything here is a wire fact an agent observes on every transport: the
 * success shape, the `'Done.'` sentinel for a void result, which error arms
 * earn a hint, and the `Details:` appendix. A transport builds its `call`
 * with `createCall`, supplying the two hints that are its own.
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ErrorType, isShipError } from '@shipstatic/ship';

/**
 * The two credential arms, whose hint differs per transport: stdio names the
 * environment variable it owns, and the hosted endpoint has none to name.
 * Every other error relays verbatim, because a credential hint on any other
 * type sends the agent after a problem it does not have.
 *
 * Membership is "does the text differ per transport?", so maintenance, which
 * is hinted too, is a constant below and not a member.
 */
export interface ErrorHints {
  /** Appended after `Hint: ` when the SDK rejects the credential. */
  authentication: string;
  /**
   * Appended after `Hint: ` when the platform refuses an authenticated call
   * for a reason no new consent can fix. A missing scope takes no hint.
   */
  forbidden: string;
}

/**
 * The maintenance hint, the same on every transport. A tool failure normally
 * invites a retry, which cannot succeed against a platform that is closed on
 * purpose, so the hint leads with the refusal to retry and ends with what the
 * agent should tell its user.
 */
const MAINTENANCE_HINT =
  'The platform is temporarily closed for scheduled maintenance. Do not retry in a loop: wait and try again later. Deployed sites are unaffected and stay online.';

/**
 * The wrapper every tool handler delegates to. The shared toolset takes it as
 * an argument: the tools are identical across transports, the hints inside
 * `call` are not.
 */
export type CallFn = <T>(fn: () => Promise<T>) => Promise<CallToolResult>;

export interface CallOptions {
  hints: ErrorHints;
  /**
   * Called when the API refuses on credential grounds, and only then.
   *
   * An HTTP transport needs it: a client learns it must authenticate from a
   * real `401` with `WWW-Authenticate` and ignores that header on a `200`, so
   * a tool error saying "please authenticate" is a dead end there. What counts
   * as a credential failure is decided here, beside the hints, once:
   *
   * - **Authentication** always reports: the credential was absent,
   *   malformed, unknown or expired.
   * - **Forbidden reports only when it carries `requiredScope`**, the API's
   *   signal that a valid grant lacks a permission, which a new consent can
   *   fix. Plan limits, a terminated account and an action no scope can
   *   authorize are answers to the question asked, and stay in-band.
   *
   * It is a notification, never a substitution: the agent receives the same
   * result either way. The transport is told what the API answered because
   * guessing from the request means parsing the body twice, and can only
   * guess at presence, so an expired token would never drive a refresh.
   */
  onAuthFailure?: (failure: AuthFailure) => void;
}

/**
 * What a credential refusal was. The presence of `requiredScope` is the whole
 * discriminator. It carries no HTTP status and no RFC 6750 code: those are
 * the consuming transport's vocabulary, and stdio has neither.
 */
export interface AuthFailure {
  /**
   * The scope the grant is missing, from the API's `details.requiredScope`.
   * Absent when the credential itself was refused.
   */
  requiredScope?: string;
}

/** Builds a transport's `call` from its hints. */
export function createCall(options: CallOptions): CallFn {
  const { hints, onAuthFailure } = options;

  return async function call<T>(fn: () => Promise<T>): Promise<CallToolResult> {
    try {
      const result = await fn();
      // A void SDK method has nothing to serialize.
      if (result === undefined) {
        return { content: [{ type: 'text', text: 'Done.' }] };
      }
      // The wire shape rides twice: as the text every client reads, and as
      // `structuredContent` for the tool's `outputSchema`, which the SDK
      // validates on every success. A non-object has no schema to satisfy and
      // rides the text alone.
      const text = JSON.stringify(result, null, 2);
      return {
        content: [{ type: 'text', text }],
        ...(isPlainObject(result) ? { structuredContent: result } : {}),
      };
    } catch (error) {
      return toErrorResult(error, hints, onAuthFailure);
    }
  };
}

/**
 * The API's `details.requiredScope`, if this refusal carries one. `details`
 * is `unknown` on the wire, so the read narrows, and anything but a non-empty
 * string means no scope was named.
 */
function requiredScopeOf(details: unknown): string | undefined {
  if (!details || typeof details !== 'object') return undefined;
  const scope = (details as { requiredScope?: unknown }).requiredScope;
  return typeof scope === 'string' && scope ? scope : undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The `_meta` key an error result carries the wire's own `ErrorResponse`
 * under, named under the platform's domain as the specification asks.
 *
 * It is not `structuredContent`: that field belongs to the tool's
 * `outputSchema`, which describes a success, and the TypeScript SDK's client
 * validates it even on an `isError` result
 * (modelcontextprotocol/typescript-sdk#1943), so a host would show a schema
 * mismatch in place of the refusal. `_meta` is validated by nobody.
 */
export const ERROR_META_KEY = 'com.shipstatic/error';

/**
 * The failure envelope: the text is the contract, hints included, and the
 * structure rides beside it.
 *
 * The API writes its messages for the end user, so a client that reads only
 * the text still works. `_meta[ERROR_META_KEY]` carries
 * `ShipError.toResponse()`, the same `ErrorResponse` every other client sees,
 * for a client that branches on error type and status: a 429's
 * `details.expires` is the exact backoff its sentence rounds into words.
 */
function toErrorResult(
  error: unknown,
  hints: ErrorHints,
  onAuthFailure?: (failure: AuthFailure) => void,
): CallToolResult {
  if (isShipError(error)) {
    let message = error.message;

    // Not a credential problem, so it never notifies `onAuthFailure`: a
    // challenge would send a client round a sign-in against a closed door.
    if (error.isType(ErrorType.Maintenance)) {
      message += `\n\nHint: ${MAINTENANCE_HINT}`;
    }

    if (error.isType(ErrorType.Authentication)) {
      message += `\n\nHint: ${hints.authentication}`;
      onAuthFailure?.({});
    }

    if (error.isType(ErrorType.Forbidden)) {
      // A missing scope is reported and takes no hint: the hint says to stop,
      // and a new consent is what fixes this one.
      const requiredScope = requiredScopeOf(error.details);
      if (requiredScope) onAuthFailure?.({ requiredScope });
      else message += `\n\nHint: ${hints.forbidden}`;
    }

    if (error.isType(ErrorType.Validation) && error.details) {
      message += `\n\nDetails: ${safeStringify(error.details)}`;
    }

    return {
      content: [{ type: 'text', text: message }],
      _meta: { [ERROR_META_KEY]: { ...error.toResponse() } },
      isError: true,
    };
  }

  // No structure for a non-ShipError: there is no wire shape to report, and
  // inventing one would say the failure came from the platform.
  const fallback = error instanceof Error ? error.message : 'An unexpected error occurred';
  return {
    content: [{ type: 'text', text: fallback }],
    isError: true,
  };
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
