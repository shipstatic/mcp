import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ErrorType, isShipError } from '@shipstatic/ship';

/**
 * The two error arms that earn a hint. Everything else relays verbatim — a
 * hint on any other type sends the agent chasing a credential that is not the
 * problem.
 *
 * They are ARGUMENTS rather than constants because they are the one part of
 * the mapping that legitimately differs per transport: stdio can name the
 * environment variable it owns, and the hosted endpoint deliberately cannot
 * (it has no configuration of its own, and naming another package's variable
 * is how this pair silently desynchronised once already).
 */
export interface ErrorHints {
  /** Appended after `Hint: ` when the SDK rejects the credential. */
  authentication: string;
  /** Appended after `Hint: ` when the platform refuses an authenticated call. */
  forbidden: string;
}

export interface CallOptions {
  hints: ErrorHints;
  /**
   * Attach a plain-object result as `structuredContent` beside the text.
   * Hosted-only today: it is what feeds the Apps-SDK widget, and the MCP spec
   * pairs it with an `outputSchema`, which is a hand-maintained zod twin of a
   * published type. One such twin is worth it for a widget; fifteen would be a
   * drift surface with no consumer asking for it. See
   * `cloudflare/mcp/CLAUDE.md`, "What deliberately differs".
   */
  structuredContent?: boolean;
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
export function createCall(options: CallOptions) {
  const { hints, structuredContent = false } = options;

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
      return toErrorResult(error, hints);
    }
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toErrorResult(error: unknown, hints: ErrorHints): CallToolResult {
  if (isShipError(error)) {
    let message = error.message;

    if (error.isType(ErrorType.Authentication)) {
      message += `\n\nHint: ${hints.authentication}`;
    }

    if (error.isType(ErrorType.Forbidden)) {
      message += `\n\nHint: ${hints.forbidden}`;
    }

    if (error.isType(ErrorType.Validation) && error.details) {
      message += `\n\nDetails: ${safeStringify(error.details)}`;
    }

    return {
      content: [{ type: 'text', text: message }],
      isError: true,
    };
  }

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
