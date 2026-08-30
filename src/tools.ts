/**
 * The account-tied toolset — fourteen tools, identical on every transport.
 *
 * `deployments_upload` is not here, and the split is exactly the product's
 * own shape rather than a convenience:
 *
 *   - **Upload is the anonymous door.** It is the one operation that works
 *     with no account, and it is the one whose INPUT differs by transport —
 *     a filesystem path over stdio, inline bytes over HTTP, because a Worker
 *     has no filesystem. It also carries the Apps-SDK widget hosted-side.
 *     So it is authored per transport, in each `server.ts`.
 *   - **Everything else needs an identity**, and once a transport has one,
 *     nothing about these fourteen depends on how the bytes arrived. Same
 *     names, same schemas, same prose, same 1:1 SDK calls.
 *
 * That is why they live in the shared package: when the hosted transport
 * gains OAuth it registers this function and has the complete toolset, rather
 * than someone copying fourteen definitions into a second repo — which is the
 * moment the two surfaces would begin to drift. The cost of doing it after
 * the copy is a de-duplication under deadline; the cost of doing it before is
 * this file.
 *
 * **The catalogue is static; identity decides what SUCCEEDS.** These are
 * registered whether or not a credential is present — an anonymous caller
 * sees them and gets a typed authentication error naming how to authenticate
 * on *this* transport (the hint is `createCall`'s one per-transport argument).
 * A tool list that changes shape under the caller would be a second, dynamic
 * contract for an agent to track, and MCP clients cache the catalogue.
 *
 * **Every tool carries a `title`, and it is a gate rather than a nicety.** The
 * Claude connectors directory refuses submission for a tool that lacks one, so
 * a titleless tool is not a shabby tool — it is an unlistable product. The
 * style is short Title Case verb phrases naming what the USER gets ("List
 * Deployments", "Connect Custom Domain"); the name obeys `resource_action` for
 * the agent, the title reads as English for the human, and the description
 * carries every precision neither can. Both catalogue pins assert a title on
 * every tool, so the next one cannot be added without one.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type Ship from '@shipstatic/ship';
import { z } from 'zod';
import type { CallFn } from './call.js';
import { ANNOTATIONS } from './vocabulary.js';

const { READ, WRITE, DESTRUCTIVE } = ANNOTATIONS;

/**
 * The fourteen, by name, in registration order.
 *
 * Exported so a second transport can state its expected catalogue as
 * `[UPLOAD_TOOL_NAME, ...ACCOUNT_TOOL_NAMES]` instead of listing fifteen
 * strings it would then have to keep in agreement with this file — the hosted
 * parity fence is the consumer, and "fifteen" is otherwise a number two repos
 * count separately.
 *
 * **Deliberately a list beside the registrations rather than a table they are
 * generated from.** A `Record<name, factory>` would make the pairing
 * structural, and it would cost the zod→handler inference every one of the
 * fourteen one-liners below relies on: `({ deployment }) => …` is typed today
 * from the `inputSchema` literal in the same call, and a loop over a
 * heterogeneous table cannot correlate the two. The same guarantee costs
 * nothing as a set comparison, and `tests/server.test.ts` makes it — through a
 * real `tools/list`, so a registration without a name, a name without a
 * registration, and a typo in either all turn it red.
 */
export const ACCOUNT_TOOL_NAMES = [
  'deployments_list',
  'deployments_get',
  'deployments_set',
  'deployments_delete',
  'domains_set',
  'domains_list',
  'domains_get',
  'domains_records',
  'domains_dns',
  'domains_share',
  'domains_validate',
  'domains_verify',
  'domains_delete',
  'whoami',
] as const;

/**
 * The pagination surface, shared by every list tool because it is one
 * contract, not two. A list answers `{<collection>, cursor}` and nothing
 * else — `cursor` carries the whole has-more signal and is null on the last
 * page, so there is no `total` to ask for and no has-more boolean.
 *
 * No upper bound is stated here on purpose. The API clamps an unusable
 * `limit` server-side and owns that number; restating a cap in the tool
 * schema would give one fact two owners and let them drift. `min(1)` is not
 * a cap — it rejects a value that could never mean anything.
 */
const PAGINATION_INPUT = {
  limit: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Maximum number of items to return in one page. Omit for the server default.'),
  cursor: z
    .string()
    .optional()
    .describe(
      "Opaque position from the previous response's `cursor` field; omit for the first page.",
    ),
};

/** Appended to every list tool's description — the paging contract, stated once. */
const PAGING_NOTE =
  " The response's `cursor` is null on the last page; pass it back as `cursor` to fetch the next.";

/** The deployment argument, described identically wherever it is accepted. */
const DEPLOYMENT_EXAMPLE = 'happy-cat-abc1234.shipstatic.com';

export function registerAccountTools(server: McpServer, ship: Ship, call: CallFn): void {
  // Deployments

  server.registerTool(
    'deployments_list',
    {
      title: 'List Deployments',
      description: `List all deployments with their URLs, status, labels, and password protection state.${PAGING_NOTE}`,
      annotations: READ,
      inputSchema: PAGINATION_INPUT,
    },
    ({ limit, cursor }) => call(() => ship.deployments.list({ limit, cursor })),
  );

  server.registerTool(
    'deployments_get',
    {
      title: 'Get Deployment',
      description:
        'Get deployment details including URL, status, file count, size, labels, and password protection state.',
      annotations: READ,
      inputSchema: {
        deployment: z
          .string()
          .describe(
            `Deployment hostname (e.g. "${DEPLOYMENT_EXAMPLE}"). Returned by deployments_upload or deployments_list.`,
          ),
      },
    },
    ({ deployment }) => call(() => ship.deployments.get(deployment)),
  );

  server.registerTool(
    'deployments_set',
    {
      title: 'Update Deployment Labels',
      description: 'Update deployment labels. Replaces all existing labels.',
      annotations: WRITE,
      inputSchema: {
        deployment: z
          .string()
          .describe(
            `Deployment hostname (e.g. "${DEPLOYMENT_EXAMPLE}"). Use deployments_list to find deployments.`,
          ),
        labels: z
          .array(z.string())
          .describe('Labels to set. Replaces all existing labels. Pass empty array to clear.'),
      },
    },
    ({ deployment, labels }) => call(() => ship.deployments.set(deployment, { labels })),
  );

  server.registerTool(
    'deployments_delete',
    {
      title: 'Delete Deployment',
      description:
        'Permanently delete a deployment and its files. You MUST confirm with the user before calling this tool, referencing the deployment.',
      annotations: DESTRUCTIVE,
      inputSchema: {
        deployment: z
          .string()
          .describe(`Deployment hostname to delete (e.g. "${DEPLOYMENT_EXAMPLE}")`),
      },
    },
    ({ deployment }) => call(() => ship.deployments.delete(deployment)),
  );

  // Domains

  server.registerTool(
    'domains_set',
    {
      title: 'Connect Custom Domain',
      description:
        'Create or update a custom domain. Can reserve a name (omit deployment), link it to a deployment, switch deployments, or update labels. After creating, call domains_records and show the DNS records to the user.',
      annotations: WRITE,
      inputSchema: {
        domain: z.string().describe('Domain name (e.g. "www.example.com" or "blog.example.com")'),
        deployment: z
          .string()
          .optional()
          .describe(
            `Deployment to serve on this domain (e.g. "${DEPLOYMENT_EXAMPLE}"). Omit to reserve the domain without linking.`,
          ),
        labels: z
          .array(z.string())
          .optional()
          .describe('Labels for organizing domains (e.g. ["production"]).'),
      },
    },
    ({ domain, deployment, labels }) =>
      call(() => ship.domains.set(domain, { deployment, labels })),
  );

  server.registerTool(
    'domains_list',
    {
      title: 'List Domains',
      description: `List all domains with their URLs, linked deployment, and verification status.${PAGING_NOTE}`,
      annotations: READ,
      inputSchema: PAGINATION_INPUT,
    },
    ({ limit, cursor }) => call(() => ship.domains.list({ limit, cursor })),
  );

  server.registerTool(
    'domains_get',
    {
      title: 'Get Domain',
      description:
        'Get domain details including URL, linked deployment, verification status, and labels.',
      annotations: READ,
      inputSchema: {
        domain: z
          .string()
          .describe('Domain name (e.g. "www.example.com"). Use domains_list to find names.'),
      },
    },
    ({ domain }) => call(() => ship.domains.get(domain)),
  );

  server.registerTool(
    'domains_records',
    {
      title: 'Get DNS Records',
      description:
        'Get the DNS records the user needs to configure at their DNS provider. Call after domains_set. You MUST show the returned records to the user.',
      annotations: READ,
      inputSchema: {
        domain: z
          .string()
          .describe('Domain name. Must be a domain previously created with domains_set.'),
      },
    },
    ({ domain }) => call(() => ship.domains.records(domain)),
  );

  server.registerTool(
    'domains_dns',
    {
      title: 'Look Up DNS Provider',
      description:
        'Look up the DNS provider for a domain (e.g. Cloudflare, Namecheap). Helps the user know where to configure their DNS records.',
      annotations: READ,
      inputSchema: {
        domain: z
          .string()
          .describe('Domain name to look up DNS provider for (e.g. "www.example.com")'),
      },
    },
    ({ domain }) => call(() => ship.domains.dns(domain)),
  );

  server.registerTool(
    'domains_share',
    {
      title: 'Share DNS Setup',
      description:
        'Get a shareable DNS setup link for a domain. Share the link with the user so they, or whoever manages their DNS, can view the required records without needing an API key.',
      annotations: READ,
      inputSchema: {
        domain: z
          .string()
          .describe(
            'Domain name to generate a share link for. Must be a domain previously created with domains_set.',
          ),
      },
    },
    ({ domain }) => call(() => ship.domains.share(domain)),
  );

  server.registerTool(
    'domains_validate',
    {
      title: 'Check Domain Availability',
      description:
        'Check if a domain name is valid and available before creating it. Returns the normalized form and availability.',
      annotations: READ,
      inputSchema: {
        domain: z
          .string()
          .describe(
            'Domain name to check (e.g. "www.example.com"). Call before domains_set to check availability.',
          ),
      },
    },
    ({ domain }) => call(() => ship.domains.validate(domain)),
  );

  server.registerTool(
    'domains_verify',
    {
      title: 'Verify Domain DNS',
      description:
        'Trigger DNS verification for a custom domain. Call after the user has configured DNS records from domains_records. Verification is asynchronous — the domain status updates once DNS propagates.',
      annotations: WRITE,
      inputSchema: {
        domain: z
          .string()
          .describe(
            'Domain name to verify DNS for. Must be a domain previously created with domains_set.',
          ),
      },
    },
    ({ domain }) => call(() => ship.domains.verify(domain)),
  );

  server.registerTool(
    'domains_delete',
    {
      title: 'Delete Domain',
      description:
        'Permanently delete a domain. You MUST confirm with the user before calling this tool, referencing the domain name.',
      annotations: DESTRUCTIVE,
      inputSchema: {
        domain: z.string().describe('Domain name to delete (e.g. "www.example.com")'),
      },
    },
    ({ domain }) => call(() => ship.domains.delete(domain)),
  );

  // Account

  server.registerTool(
    'whoami',
    {
      title: 'Show Account',
      description: 'Show authenticated account details including email, plan, and usage.',
      annotations: READ,
    },
    () => call(() => ship.whoami()),
  );
}
