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
import type { Account } from '@shipstatic/types';
import { z } from 'zod';
import type { CallFn } from './call.js';
import { annotate, type ToolContract, titled, UPLOAD_TOOL_NAME } from './vocabulary.js';

/**
 * THE REGISTRY: one row per tool, every fact about it that a host reads.
 *
 * Fifteen rows, in registration order, `deployments_upload` included even
 * though each transport authors that registration itself: its INPUT differs
 * per transport, its contract does not. Everything else is derived from
 * here. `annotate(row)` is every registration's `annotations`;
 * `ACCOUNT_TOOL_NAMES` is the rows whose `auth` is `required`, and the
 * hosted door reads the same column for `securitySchemes`; the listing
 * repo's justifications are held to the hints these rows produce.
 *
 * The rows are DATA the registrations read, not a table they are generated
 * from, and that is deliberate: a `Record<name, factory>` would cost the
 * zod→handler inference every one-liner below relies on (`({ deployment })
 * => …` is typed from the `inputSchema` literal in the same call). A row
 * without a registration, a registration without a row, and a typo in
 * either all turn `tests/server.test.ts` red, through a real `tools/list`.
 *
 * Two rows are worth a second look, because their names suggest otherwise:
 * `domains_dns` READS the provider the platform recorded when the domain
 * was created (nothing is looked up on call), and `domains_validate` and
 * `domains_share` persist nothing.
 */
export const TOOLS = {
  [UPLOAD_TOOL_NAME]: { auth: 'optional', mutation: 'add', reach: 'public' },
  deployments_list: { auth: 'required', mutation: 'none', reach: 'account' },
  deployments_get: { auth: 'required', mutation: 'none', reach: 'account' },
  deployments_set: { auth: 'required', mutation: 'replace', reach: 'account' },
  deployments_delete: { auth: 'required', mutation: 'remove', reach: 'public' },
  domains_set: { auth: 'required', mutation: 'replace', reach: 'public' },
  domains_list: { auth: 'required', mutation: 'none', reach: 'account' },
  domains_get: { auth: 'required', mutation: 'none', reach: 'account' },
  domains_records: { auth: 'required', mutation: 'none', reach: 'account' },
  domains_dns: { auth: 'required', mutation: 'none', reach: 'account' },
  domains_share: { auth: 'required', mutation: 'none', reach: 'account' },
  domains_validate: { auth: 'required', mutation: 'none', reach: 'account' },
  domains_verify: { auth: 'required', mutation: 'add', reach: 'public' },
  domains_delete: { auth: 'required', mutation: 'remove', reach: 'public' },
  whoami: { auth: 'required', mutation: 'none', reach: 'account' },
} as const satisfies Record<string, ToolContract>;

export type ToolName = keyof typeof TOOLS;

/** The names whose row says an account is required. */
export type AccountToolName = {
  [N in ToolName]: (typeof TOOLS)[N]['auth'] extends 'required' ? N : never;
}[ToolName];

/**
 * The fourteen, derived from the registry rather than listed beside it.
 *
 * Exported so a second transport can state its expected catalogue as
 * `[UPLOAD_TOOL_NAME, ...ACCOUNT_TOOL_NAMES]` instead of counting to fifteen
 * in a second repo. It was a hand-written list until 1.11.0, which made the
 * auth need a second owner beside the annotations; a row is now the only
 * place a tool's account requirement is stated.
 */
export const ACCOUNT_TOOL_NAMES = (Object.keys(TOOLS) as ToolName[]).filter(
  (name): name is AccountToolName => TOOLS[name].auth === 'required',
);

/**
 * What `whoami` answers: exactly the keys its description names.
 *
 * `Account` also carries billing state, the API-key hint, the picture and
 * timestamps, none of which the description mentions and none of which an
 * agent acts on. A tool's result is the shape its description states; this
 * is the one tool where the wire's own entity said more than the sentence.
 * `suspended` is deliberately out: it means every write is refused, and the
 * refusal says so itself at the moment it matters.
 */
function accountSummary({ email, name, plan, usage, caps }: Account) {
  return { email, name, plan, usage, caps };
}

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
    titled({
      title: 'List Deployments',
      description: `List all deployments with their URLs, status, labels, and password protection state.${PAGING_NOTE}`,
      annotations: annotate(TOOLS.deployments_list),
      inputSchema: PAGINATION_INPUT,
    }),
    ({ limit, cursor }) => call(() => ship.deployments.list({ limit, cursor })),
  );

  server.registerTool(
    'deployments_get',
    titled({
      title: 'Get Deployment',
      description:
        'Get deployment details including URL, status, file count, size, labels, and password protection state.',
      annotations: annotate(TOOLS.deployments_get),
      inputSchema: {
        deployment: z
          .string()
          .describe(
            `Deployment hostname (e.g. "${DEPLOYMENT_EXAMPLE}"). Returned by deployments_upload or deployments_list.`,
          ),
      },
    }),
    ({ deployment }) => call(() => ship.deployments.get(deployment)),
  );

  server.registerTool(
    'deployments_set',
    titled({
      title: 'Update Deployment Labels',
      description: 'Update deployment labels. Replaces all existing labels.',
      annotations: annotate(TOOLS.deployments_set),
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
    }),
    ({ deployment, labels }) => call(() => ship.deployments.set(deployment, { labels })),
  );

  server.registerTool(
    'deployments_delete',
    titled({
      title: 'Delete Deployment',
      description: 'Permanently deletes a deployment and its files.',
      annotations: annotate(TOOLS.deployments_delete),
      inputSchema: {
        deployment: z
          .string()
          .describe(`Deployment hostname to delete (e.g. "${DEPLOYMENT_EXAMPLE}")`),
      },
    }),
    ({ deployment }) => call(() => ship.deployments.delete(deployment)),
  );

  // Domains

  server.registerTool(
    'domains_set',
    titled({
      title: 'Connect Custom Domain',
      description:
        'Create or update a custom domain. Can reserve a name (omit deployment), link it to a deployment, switch deployments, or update labels. domains_records then returns the DNS records to configure.',
      annotations: annotate(TOOLS.domains_set),
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
    }),
    ({ domain, deployment, labels }) =>
      call(() => ship.domains.set(domain, { deployment, labels })),
  );

  server.registerTool(
    'domains_list',
    titled({
      title: 'List Domains',
      description: `List all domains with their URLs, linked deployment, and verification status.${PAGING_NOTE}`,
      annotations: annotate(TOOLS.domains_list),
      inputSchema: PAGINATION_INPUT,
    }),
    ({ limit, cursor }) => call(() => ship.domains.list({ limit, cursor })),
  );

  server.registerTool(
    'domains_get',
    titled({
      title: 'Get Domain',
      description:
        'Get domain details including URL, linked deployment, verification status, and labels.',
      annotations: annotate(TOOLS.domains_get),
      inputSchema: {
        domain: z
          .string()
          .describe('Domain name (e.g. "www.example.com"). Use domains_list to find names.'),
      },
    }),
    ({ domain }) => call(() => ship.domains.get(domain)),
  );

  server.registerTool(
    'domains_records',
    titled({
      title: 'Get DNS Records',
      description:
        "Returns the DNS records to configure at the domain's DNS provider. Call after domains_set.",
      annotations: annotate(TOOLS.domains_records),
      inputSchema: {
        domain: z
          .string()
          .describe('Domain name. Must be a domain previously created with domains_set.'),
      },
    }),
    ({ domain }) => call(() => ship.domains.records(domain)),
  );

  server.registerTool(
    'domains_dns',
    titled({
      title: 'Get DNS Provider',
      description:
        'Returns the DNS provider recorded for the domain, if known (e.g. Cloudflare, Namecheap): where its DNS records are configured.',
      annotations: annotate(TOOLS.domains_dns),
      inputSchema: {
        domain: z
          .string()
          .describe(
            'Domain name (e.g. "www.example.com"). Must be a domain previously created with domains_set.',
          ),
      },
    }),
    ({ domain }) => call(() => ship.domains.dns(domain)),
  );

  server.registerTool(
    'domains_share',
    titled({
      title: 'Share DNS Setup',
      description:
        "Returns a shareable DNS setup URL that needs no API key, for whoever manages the domain's DNS.",
      annotations: annotate(TOOLS.domains_share),
      inputSchema: {
        domain: z
          .string()
          .describe(
            'Domain name to generate a share link for. Must be a domain previously created with domains_set.',
          ),
      },
    }),
    ({ domain }) => call(() => ship.domains.share(domain)),
  );

  server.registerTool(
    'domains_validate',
    titled({
      title: 'Check Domain Availability',
      description:
        'Check if a domain name is valid and available before creating it. Returns the normalized form and availability.',
      annotations: annotate(TOOLS.domains_validate),
      inputSchema: {
        domain: z
          .string()
          .describe(
            'Domain name to check (e.g. "www.example.com"). Call before domains_set to check availability.',
          ),
      },
    }),
    ({ domain }) => call(() => ship.domains.validate(domain)),
  );

  server.registerTool(
    'domains_verify',
    titled({
      title: 'Verify Domain DNS',
      description:
        'Trigger DNS verification for a custom domain. Call after the user has configured DNS records from domains_records. Verification is asynchronous — the domain status updates once DNS propagates.',
      annotations: annotate(TOOLS.domains_verify),
      inputSchema: {
        domain: z
          .string()
          .describe(
            'Domain name to verify DNS for. Must be a domain previously created with domains_set.',
          ),
      },
    }),
    ({ domain }) => call(() => ship.domains.verify(domain)),
  );

  server.registerTool(
    'domains_delete',
    titled({
      title: 'Delete Domain',
      description: 'Permanently deletes a domain.',
      annotations: annotate(TOOLS.domains_delete),
      inputSchema: {
        domain: z.string().describe('Domain name to delete (e.g. "www.example.com")'),
      },
    }),
    ({ domain }) => call(() => ship.domains.delete(domain)),
  );

  // Account

  server.registerTool(
    'whoami',
    titled({
      title: 'Show Account',
      description: "Returns the account's email, name, plan, current usage and plan caps.",
      annotations: annotate(TOOLS.whoami),
    }),
    () => call(() => ship.whoami().then(accountSummary)),
  );
}
