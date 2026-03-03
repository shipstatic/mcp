import { isShipError, ErrorType } from '@shipstatic/ship';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export async function call<T>(fn: () => Promise<T>): Promise<CallToolResult> {
  try {
    const result = await fn();
    const text = result === undefined
      ? 'Done.'
      : JSON.stringify(result, null, 2);
    return { content: [{ type: 'text', text }] };
  } catch (error) {
    return handleError(error);
  }
}

function handleError(error: unknown): CallToolResult {
  if (isShipError(error)) {
    let message = error.message;

    if (error.isType(ErrorType.Authentication)) {
      message += '\n\nHint: Set the SHIP_API_KEY environment variable in your MCP server configuration.';
    }

    if (error.isType(ErrorType.Validation) && error.details) {
      message += `\n\nDetails: ${JSON.stringify(error.details)}`;
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
