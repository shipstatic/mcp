import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type Ship from '@shipstatic/ship';
import { DeploymentVia, type DeploymentViaType } from '@shipstatic/types';
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
  UPLOAD_TOOL_TITLE,
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

To deploy: call ${UPLOAD_TOOL_NAME} with the build output directory path. ${B.liveAndPassword}

Without SHIP_TOKEN, deployments are public and expire in ${PUBLIC_EXPIRY}. ${B.claim}

With SHIP_TOKEN configured, deployments go to the user's account and never expire — pass \`ttl\` (seconds) to ${UPLOAD_TOOL_NAME} for one that expires on its own. Listing, managing, and domain operations also require SHIP_TOKEN.

${B.conceptsHeader}
${B.deploymentConcept}
${B.domainConcept}

${B.domainWorkflow}`;

/**
 * What the HOST knows about itself and this library must not assume.
 *
 * Both fields are the same category of fact, which is why they travel together
 * rather than as a growing positional tail: a library has no manifest to read
 * and no idea which product it was installed inside.
 */
export interface ServerOptions {
  /**
   * The server's reported `serverInfo.version`. A parameter rather than
   * something this module reads for itself: the executable knows its own
   * package manifest, a library must not assume it has one, and reaching for
   * `node:module` here would put a Node builtin in the import graph of a
   * module the Workers-hosted transport also loads.
   */
  version: string;
  /**
   * The deploy origin this server's uploads are attributed to. Defaults to
   * `mcp` — an npx install in some MCP client, which is what this package is
   * on its own.
   *
   * It is a parameter because `via` names the DISTRIBUTION SURFACE, not the
   * protocol: the GitHub Action reports `git` whatever invoked the workflow,
   * and the web apps report `web`. The VS Code extension bundles this server
   * into its `.vsix`, so its agent-mode deploys are the extension's — it
   * passes `vsc`, and `mcp` goes back to meaning what it says.
   */
  via?: DeploymentViaType;
}

/**
 * Builds the stdio server's full 15-tool surface over an injected client.
 */
export function createServer(ship: Ship, options: ServerOptions): McpServer {
  const { version, via = DeploymentVia.MCP } = options;

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
      title: UPLOAD_TOOL_TITLE,
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
        // A bare `z.number()`, and the absences are the point. `.min()`/`.max()`
        // would restate `TTL_CONSTRAINTS`, and `.int()` would restate the
        // fraction rule — all three owned by `validateTtl`, which the SDK runs
        // in-process before a byte is uploaded and which answers in the
        // constitution's own words. A second validator here could only ever
        // disagree with the first, silently; its absence fails loudly instead.
        ttl: z.number().optional().describe(PARAM_DESCRIPTIONS.ttl),
      },
    },
    ({ path, labels, password, idempotencyKey, ttl }) =>
      call(() => ship.deployments.upload(path, { labels, password, idempotencyKey, ttl, via })),
  );

  // The other fourteen. Identical on every transport, so they live in the
  // shared package rather than here — see tools.ts for why upload is not
  // among them.
  registerAccountTools(server, ship, call);

  return server;
}
