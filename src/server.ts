/**
 * The stdio server: the one tool this transport authors (`deployments_upload`,
 * whose input is a filesystem path), the shared fourteen, and the two things
 * only stdio says, which are how files arrive and how a caller authenticates
 * (`SHIP_TOKEN`).
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type Ship from '@shipstatic/ship';
import { DeploymentVia, type DeploymentViaType, MY_API_KEY_URL } from '@shipstatic/types';
import { DeploymentCreateResponseSchema } from '@shipstatic/types/schemas';
import { z } from 'zod';
import { createCall, type ErrorHints } from './call.js';
import { registerAccountTools, TOOLS } from './tools.js';
import {
  annotate,
  DESCRIPTION_BLOCKS,
  INSTRUCTION_BLOCKS,
  PARAM_DESCRIPTIONS,
  PUBLIC_EXPIRY,
  SERVER_INFO,
  titled,
  UPLOAD_TOOL_NAME,
  UPLOAD_TOOL_TITLE,
} from './vocabulary.js';

const B = INSTRUCTION_BLOCKS;
const D = DESCRIPTION_BLOCKS;

// The shared blocks, around stdio's own two sentences.
const INSTRUCTIONS = `${B.opening} ${B.accountLater}

To deploy: call ${UPLOAD_TOOL_NAME} with the build output directory path. ${B.home} ${B.live} ${B.routes} ${B.password}

Without SHIP_TOKEN, deployments are public and expire in ${PUBLIC_EXPIRY}. ${B.claim}

With SHIP_TOKEN configured (its value is the user's API key, free at ${MY_API_KEY_URL}), deployments go to the user's account and never expire; pass \`ttl\` (seconds) to ${UPLOAD_TOOL_NAME} for one that expires on its own. Listing, managing, and domain operations also require SHIP_TOKEN.

${B.conceptsHeader}
${B.deploymentConcept}
${B.domainConcept}

${B.domainWorkflow}`;

/**
 * stdio's hints. The authentication hint carries the whole chain: the
 * variable, what its value is (the console says "API key" and the config says
 * "token" for one credential, and this sentence is where an agent learns they
 * are the same), and where to get one. It is read at the moment a user is
 * missing one.
 */
const STDIO_HINTS: ErrorHints = {
  authentication: `Set the SHIP_TOKEN environment variable in your MCP server configuration. Its value is the user's API key, free at ${MY_API_KEY_URL}.`,
  forbidden:
    'This action is not permitted. Likely cause: plan limits reached or the account is terminated. Stop retrying: the user needs to upgrade or contact support at https://my.shipstatic.com.',
};

const call = createCall({ hints: STDIO_HINTS });

/**
 * What the host knows about itself: a library has no manifest to read and no
 * idea which product it is installed inside.
 */
export interface ServerOptions {
  /**
   * The reported `serverInfo.version`. An argument, because reading a
   * manifest here would put `node:module` in the import graph the hosted
   * transport also loads.
   */
  version: string;
  /**
   * The origin this server's uploads are attributed to. `via` names the
   * distribution surface, never the protocol, so a host that bundles this
   * server passes its own, and the default `mcp` means an npx install in
   * some MCP client.
   */
  via?: DeploymentViaType;
}

/** Builds the stdio server's fifteen tools over an injected client. */
export function createServer(ship: Ship, options: ServerOptions): McpServer {
  const { version, via = DeploymentVia.MCP } = options;

  const server = new McpServer({ ...SERVER_INFO, version }, { instructions: INSTRUCTIONS });

  server.registerTool(
    UPLOAD_TOOL_NAME,
    titled({
      title: UPLOAD_TOOL_TITLE,
      description: `Deploy a static site instantly: ${D.free}. Returns the live URL, file count, and size. Without SHIP_TOKEN, the response also includes a one-time claim URL, and the site expires in ${PUBLIC_EXPIRY} unless claimed. ${D.password}`,
      annotations: annotate(TOOLS[UPLOAD_TOOL_NAME]),
      outputSchema: DeploymentCreateResponseSchema,
      inputSchema: {
        path: z
          .string()
          .describe(
            'Absolute path to the build output directory to deploy (e.g. "/Users/me/project/dist")',
          ),
        labels: z.array(z.string()).optional().describe(PARAM_DESCRIPTIONS.labels),
        password: z.string().optional().describe(PARAM_DESCRIPTIONS.password),
        idempotencyKey: z.string().optional().describe(PARAM_DESCRIPTIONS.idempotencyKey),
        // A bare number: the range and the fraction rule are `validateTtl`'s,
        // which the SDK runs before a byte is uploaded. A second validator
        // here could only disagree with it.
        ttl: z.number().optional().describe(PARAM_DESCRIPTIONS.ttl),
      },
    }),
    ({ path, labels, password, idempotencyKey, ttl }) =>
      call(() => ship.deployments.upload(path, { labels, password, idempotencyKey, ttl, via })),
  );

  registerAccountTools(server, ship, call);

  return server;
}
