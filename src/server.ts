import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type Ship from '@shipstatic/ship';
import { z } from 'zod';
import { call } from './call.js';
import { registerAccountTools } from './tools.js';
import {
  ANNOTATIONS,
  DESCRIPTION_BLOCKS,
  INSTRUCTION_BLOCKS,
  PARAM_DESCRIPTIONS,
  PUBLIC_EXPIRY,
  SERVER_NAME,
  UPLOAD_TOOL_NAME,
} from './vocabulary.js';

// Destructured so the fifteen registrations below read as they always have.
// The definitions live in `vocabulary.ts` because the hosted transport speaks
// the same ones — that file records what is shared, what is not, and why.
const { CREATE } = ANNOTATIONS;

const B = INSTRUCTION_BLOCKS;
const D = DESCRIPTION_BLOCKS;

// Composed from the shared blocks plus the two sentences that are genuinely
// stdio's: how files arrive (a filesystem path) and how a caller
// authenticates (`SHIP_TOKEN`). The hosted transport composes the same blocks
// around its own two.
const INSTRUCTIONS = `${B.opening}

To deploy: call deployments_upload with the build output directory path. ${B.liveAndPassword}

Without SHIP_TOKEN, deployments are public and expire in ${PUBLIC_EXPIRY}. ${B.claim}

With SHIP_TOKEN configured, deployments go to the user's account and never expire. Listing, managing, and domain operations also require SHIP_TOKEN.

${B.conceptsHeader}
${B.deploymentConcept}
${B.domainConcept}

${B.domainWorkflow}`;

/**
 * Builds the stdio server's full 15-tool surface over an injected client.
 *
 * `version` is a parameter rather than something this module reads for itself:
 * the executable knows its own package manifest, a library must not assume it
 * has one, and reaching for `node:module` here would put a Node builtin in the
 * import graph of a module the Workers-hosted transport also loads.
 */
export function createServer(ship: Ship, version: string): McpServer {
  const server = new McpServer(
    {
      name: SERVER_NAME,
      version,
    },
    {
      instructions: INSTRUCTIONS,
    },
  );

  // Deployments

  server.registerTool(
    UPLOAD_TOOL_NAME,
    {
      description: `Deploy a static site instantly — ${D.free}. Returns the live URL, file count, and size. Without SHIP_TOKEN, the response includes a claim URL (site expires in ${PUBLIC_EXPIRY}) — always show both the deployment URL and claim URL to the user. ${D.password}`,
      annotations: CREATE,
      inputSchema: {
        path: z
          .string()
          .describe(
            'Absolute path to the build output directory to deploy (e.g. "/Users/me/project/dist")',
          ),
        labels: z.array(z.string()).optional().describe(PARAM_DESCRIPTIONS.labels),
        password: z.string().optional().describe(PARAM_DESCRIPTIONS.password),
        idempotencyKey: z.string().optional().describe(PARAM_DESCRIPTIONS.idempotencyKey),
      },
    },
    ({ path, labels, password, idempotencyKey }) =>
      call(() => ship.deployments.upload(path, { labels, password, idempotencyKey, via: 'mcp' })),
  );

  // The other fourteen. Identical on every transport, so they live in the
  // shared package rather than here — see tools.ts for why upload is not
  // among them.
  registerAccountTools(server, ship, call);

  return server;
}
