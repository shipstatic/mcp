import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ErrorType, isShipError } from '@shipstatic/ship';

/**
 * The two CREDENTIAL arms that earn a per-transport hint. Everything else
 * relays verbatim — a credential hint on any other type sends the agent
 * chasing a problem it does not have.
 *
 * They are ARGUMENTS rather than constants because they are the one part of
 * the mapping that legitimately differs per transport: stdio can name the
 * environment variable it owns, and the hosted endpoint deliberately cannot
 * (it has no configuration of its own, and naming another package's variable
 * is how this pair silently desynchronised once already).
 *
 * A third arm — maintenance — is hinted too, but it is NOT a member here: a
 * closed platform is closed identically on every transport, so its text is a
 * module constant (`MAINTENANCE_HINT`) rather than a per-transport argument.
 * The membership test for this interface is "does the text differ per
 * transport?", not "does the arm get a hint?".
 */
/**
 * The maintenance hint — a CONSTANT, for the reason stated on `ErrorHints`:
 * this text does not differ per transport, so making it an argument would ask
 * two callers to agree on one sentence forever.
 *
 * The instruction to an agent matters more here than on any other arm. A tool
 * failure normally invites a retry, and retrying is exactly wrong against a
 * platform that is closed on purpose: the loop cannot succeed, and it spends
 * the caller's budget discovering that. So the hint leads with the refusal to
 * retry and closes with the reassurance the agent should relay to its user.
 */
const MAINTENANCE_HINT =
  'The platform is temporarily closed for scheduled maintenance. Do not retry in a loop — wait and try again later. Deployed sites are unaffected and stay online.';

export interface ErrorHints {
  /** Appended after `Hint: ` when the SDK rejects the credential. */
  authentication: string;
  /** Appended after `Hint: ` when the platform refuses an authenticated call. */
  forbidden: string;
}

/**
 * The wrapper every tool handler delegates to. Named because the shared
 * toolset takes it as an argument: the tools are identical across transports,
 * the hints inside `call` are not.
 */
export type CallFn = <T>(fn: () => Promise<T>) => Promise<CallToolResult>;

export interface CallOptions {
  hints: ErrorHints;
  /**
   * Attach a plain-object SUCCESS result as `structuredContent` beside the
   * text. Hosted-only: it is what feeds the Apps-SDK widget, and the MCP spec
   * pairs it with an `outputSchema`, which is a hand-maintained zod twin of a
   * published type. One such twin is worth it for a widget; fifteen would be a
   * drift surface with no consumer asking for it. See
   * `cloudflare/mcp/CLAUDE.md`, "What deliberately differs".
   *
   * It does NOT gate the ERROR envelope, which every transport carries — see
   * `toErrorResult`. The objection above is about fifteen success shapes; a
   * failure has exactly one published shape, and no schema to keep in step.
   */
  structuredContent?: boolean;

  /**
   * Called when the API refuses on CREDENTIAL grounds — and only then.
   *
   * An HTTP transport has an obligation stdio does not: a client learns it
   * must authenticate from a real `401` with a `WWW-Authenticate` header, and
   * ignores that header entirely on a `200`. So a tool error saying "please
   * authenticate" is, on that transport, a dead end — the caller is told
   * something it has no way to act on.
   *
   * This is the seam that lets the transport answer properly, and the
   * decision of WHAT counts as a credential failure stays here, beside the
   * hints, rather than being made a second time by each consumer:
   *
   * - **Authentication** always reports. The credential was absent, malformed,
   *   unknown, or expired — the transport cannot tell which, and does not
   *   need to.
   * - **Forbidden reports only when it carries `requiredScope`.** That field
   *   is the API's own signal that a valid grant simply lacks a permission,
   *   which re-consent can fix. Every other refusal on that arm — plan limits,
   *   a terminated account, an action no scope can authorize — is a genuine
   *   answer to the question asked, and stays an ordinary in-band tool error.
   *
   * The result is unchanged either way: the agent still receives the full
   * text envelope, hints included. This is a notification, not a substitution.
   *
   * Why an observer at all, rather than the transport inspecting the request:
   * peeking at a JSON-RPC body to guess whether a call needs a credential
   * means parsing it twice — on the deploy path, that is tens of megabytes of
   * base64 re-parsed before the size caps run — and it can only ever guess at
   * PRESENCE, so an EXPIRED token would answer in-band and a connected client
   * would never refresh. Reporting what the API actually answered costs
   * nothing and is correct for both.
   */
  onAuthFailure?: (failure: AuthFailure) => void;
}

/**
 * What a credential refusal was, in the only two shapes a transport acts on
 * differently.
 *
 * Deliberately not an HTTP status or an RFC 6750 error code: those are the
 * consuming transport's vocabulary, and stdio — which also builds a `call` —
 * has neither. The presence of `requiredScope` is the whole discriminator, so
 * there is no second field restating it.
 */
export interface AuthFailure {
  /**
   * The scope the grant is missing, from the API's `details.requiredScope`.
   * Absent when the credential itself was refused rather than its permissions.
   */
  requiredScope?: string;
}

/**
 * Builds the `call()` wrapper both transports use: SDK promise in, MCP
 * `CallToolResult` out.
 *
 * The success envelope, the `'Done.'` sentinel for a void result, the order
 * the error arms are tested in, and the `Details:` appendix are all wire
 * facts an agent observes — so they live here once, rather than in two files
 * kept equal by review.
 */
export function createCall(options: CallOptions): CallFn {
  const { hints, structuredContent = false, onAuthFailure } = options;

  return async function call<T>(fn: () => Promise<T>): Promise<CallToolResult> {
    try {
      const result = await fn();
      // A void SDK method has nothing to serialize; every other result is the
      // wire shape verbatim, because an agent reads exactly what the API sent.
      if (result === undefined) {
        return { content: [{ type: 'text', text: 'Done.' }] };
      }
      const text = JSON.stringify(result, null, 2);
      const structured =
        structuredContent && isPlainObject(result)
          ? (result as Record<string, unknown>)
          : undefined;
      return {
        content: [{ type: 'text', text }],
        ...(structured ? { structuredContent: structured } : {}),
      };
    } catch (error) {
      return toErrorResult(error, hints, onAuthFailure);
    }
  };
}

/**
 * Read the API's `details.requiredScope`, if this refusal carries one.
 *
 * `details` is `unknown` on the wire by design — every arm shapes it
 * differently — so the read is a narrowing rather than a cast, and anything
 * that is not a non-empty string means "no scope was named".
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
 * The failure envelope: authoritative prose, with the wire's own structure
 * riding beside it.
 *
 * The TEXT is unchanged and stays the contract — hints included. It has to be:
 * the API authors its messages for the end user at the throw site
 * (`cloudflare/api/CLAUDE.md`, "Message authoring law"), so the sentence
 * always contains what the agent needs, and a client that ignores everything
 * else still works.
 *
 * `structuredContent` carries `ShipError.toResponse()` verbatim — the same
 * `ErrorResponse` the wire itself uses. Until 1.0.0-beta.8 the typed contract
 * terminated here: `status`, `ErrorType`, and every `details` payload except
 * the Validation arm's were dropped, so the platform's own law — *clients
 * branch on error type and status, never on message strings* — held for every
 * consumer EXCEPT the one best equipped to obey it. The recorded bite was a
 * 429: `details.expires` died at this boundary, leaving the caller most in
 * need of a precise backoff to parse "try again in 9 minutes" out of English.
 *
 * Safe on every arm, and checked rather than assumed: the MCP SDK validates
 * `structuredContent` only when a tool declares an `outputSchema`, and returns
 * early again when `isError` is set. No tool here declares one. So this is
 * additive for every client and invisible to any that does not look.
 *
 * It is deliberately NOT behind `CallOptions.structuredContent` — that flag
 * governs success shapes, where the schema-twin objection lives. A failure has
 * one published shape on every transport.
 */
function toErrorResult(
  error: unknown,
  hints: ErrorHints,
  onAuthFailure?: (failure: AuthFailure) => void,
): CallToolResult {
  if (isShipError(error)) {
    let message = error.message;

    // First, because it is the one arm that is not about this caller at all:
    // the platform is closed, nothing the agent sends can succeed, and the
    // useful instruction is to stop rather than to fix something.
    if (error.isType(ErrorType.Maintenance)) {
      message += `\n\nHint: ${MAINTENANCE_HINT}`;
    }

    if (error.isType(ErrorType.Authentication)) {
      message += `\n\nHint: ${hints.authentication}`;
      onAuthFailure?.({});
    }

    if (error.isType(ErrorType.Forbidden)) {
      message += `\n\nHint: ${hints.forbidden}`;
      // Only a MISSING SCOPE is a credential problem. The same arm carries
      // plan limits and terminated accounts, which re-consenting cannot fix
      // and which the caller should read as the answer it is.
      const requiredScope = requiredScopeOf(error.details);
      if (requiredScope) onAuthFailure?.({ requiredScope });
    }

    if (error.isType(ErrorType.Validation) && error.details) {
      message += `\n\nDetails: ${safeStringify(error.details)}`;
    }

    return {
      content: [{ type: 'text', text: message }],
      structuredContent: { ...error.toResponse() },
      isError: true,
    };
  }

  // No structure for a non-ShipError: there is no wire shape to report, and
  // inventing one would tell an agent this failure came from the platform.
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

/** stdio's hints: this package owns `SHIP_TOKEN` and is the only side that may name it. */
const STDIO_HINTS: ErrorHints = {
  authentication: 'Set a free SHIP_TOKEN environment variable in your MCP server configuration.',
  forbidden:
    'This action is not permitted. Likely cause: plan limits reached or the account is terminated. Stop retrying — the user needs to upgrade or contact support at https://my.shipstatic.com.',
};

export const call = createCall({ hints: STDIO_HINTS });
