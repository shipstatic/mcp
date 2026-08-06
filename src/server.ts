import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type Ship from '@shipstatic/ship';
import { IDEMPOTENCY_KEY_CONSTRAINTS } from '@shipstatic/ship';
import { z } from 'zod';
import { call } from './call.js';
import { registerAccountTools } from './tools.js';
import { ANNOTATIONS, INSTRUCTION_BLOCKS, PARAM_DESCRIPTIONS } from './vocabulary.js';

// Destructured so the fifteen registrations below read as they always have.
// The definitions live in `vocabulary.ts` because the hosted transport speaks
// the same ones — that file records what is shared, what is not, and why.
const { CREATE } = ANNOTATIONS;

const B = INSTRUCTION_BLOCKS;

// Composed from the shared blocks plus the two sentences that are genuinely
// stdio's: how files arrive (a filesystem path) and how a caller
// authenticates (`SHIP_TOKEN`). The hosted transport composes the same blocks
// around its own two.
const INSTRUCTIONS = `${B.opening}

To deploy: call deployments_upload with the build output directory path. ${B.liveAndPassword}

Without SHIP_TOKEN, deployments are public and expire in 3 days. ${B.claim}

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
      name: 'shipstatic',
      version,
    },
    {
      instructions: INSTRUCTIONS,
    },
  );

  // Deployments

  server.registerTool(
    'deployments_upload',
    {
      description:
        'Deploy a static site instantly — free, no account or API key required. Returns the live URL, file count, and size. Without SHIP_TOKEN, the response includes a claim URL (site expires in 3 days) — always show both the deployment URL and claim URL to the user. To make the site private, pass `password`; always show the password to the user if you set one.',
      annotations: CREATE,
      inputSchema: {
        path: z
          .string()
          .describe(
            'Absolute path to the build output directory to deploy (e.g. "/Users/me/project/dist")',
          ),
        labels: z.array(z.string()).optional().describe(PARAM_DESCRIPTIONS.labels),
        password: z.string().optional().describe(PARAM_DESCRIPTIONS.password),
        idempotencyKey: z
          .string()
          .optional()
          .describe(
            `Makes this deploy replayable instead of repeatable. A deploy is not naturally idempotent: if a call times out you cannot tell "it never landed" from "it landed and the response was lost", and retrying creates a second deployment. Send the same key on the retry and the original deployment is replayed instead (within ${IDEMPOTENCY_KEY_CONSTRAINTS.WINDOW_SECONDS / 3600} hours). Key the ATTEMPT — a run id, a commit sha, a uuid minted before the first try — never one minted fresh on each retry, which would defeat the point.`,
          ),
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
