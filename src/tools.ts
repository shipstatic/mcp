/**
 * The account-tied toolset: fourteen tools, identical on every transport.
 *
 * `deployments_upload` is not here, and the split is the product's own shape:
 *
 *   - **Upload is the anonymous door.** It is the one operation that works
 *     with no account, and the one whose input differs by transport: a
 *     filesystem path over stdio, inline bytes over HTTP. Each transport
 *     authors it.
 *   - **Everything else needs an identity**, and nothing about these fourteen
 *     depends on how the bytes arrived: same names, same schemas, same prose,
 *     same 1:1 SDK calls. A transport registers them with one call.
 *
 * **The catalogue is static; identity decides what succeeds.** The tools are
 * registered whether or not a credential is present. An anonymous caller sees
 * them and gets a typed authentication error naming how to authenticate on
 * its transport, which is `createCall`'s one per-transport argument. A tool
 * list that changed shape under the caller would be a second contract, and
 * MCP clients cache catalogues.
 *
 * **Every tool carries a `title`.** The Claude connectors directory refuses a
 * tool without one. Titles are short Title Case verb phrases naming what the
 * user gets ("List Deployments", "Set Domain"): the name is `resource_action`
 * for the agent, the title reads as English for a person.
 *
 * **Every tool names its `outputSchema` from the constitution**
 * (`@shipstatic/types/schemas`), never writes one here. The SDK enforces the
 * schema on every success, so a twin that drifted would fail a call that
 * succeeded. `call` attaches the result as `structuredContent`.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type Ship from '@shipstatic/ship';
import {
  AccountSchema,
  DeploymentDeleteResponseSchema,
  DeploymentListResponseSchema,
  DeploymentSchema,
  DomainDeleteResponseSchema,
  DomainDnsResponseSchema,
  DomainListResponseSchema,
  DomainRecordsResponseSchema,
  DomainSchema,
  DomainSetResultSchema,
  DomainShareResponseSchema,
  DomainValidateResponseSchema,
  DomainVerifyResponseSchema,
} from '@shipstatic/types/schemas';
import { z } from 'zod';
import type { CallFn } from './call.js';
import { annotate, type ToolContract, titled, UPLOAD_TOOL_NAME } from './vocabulary.js';

/**
 * The registry: one row per tool, every fact about it that a host reads.
 *
 * Fifteen rows, in registration order, `deployments_upload` included: each
 * transport authors that registration, and its contract is the same on both.
 * `annotate(row)` is every registration's `annotations`, and
 * `ACCOUNT_TOOL_NAMES` is the rows whose `auth` is `required`.
 *
 * The rows are data the registrations read, not a table they are generated
 * from: a `Record<name, factory>` would lose the handler types each
 * registration infers from its own `inputSchema`. A row without a
 * registration, or a registration without a row, turns `tests/server.test.ts`
 * red through a real `tools/list`.
 *
 * Three rows read differently from their names. `domains_dns` reads the
 * provider the platform recorded when the domain was created, and looks
 * nothing up. `domains_validate` and `domains_share` persist nothing.
 * `domains_verify` is an `add`: it starts a verification and overwrites
 * nothing.
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
 * The fourteen, derived from the registry. A second transport states its
 * catalogue as `[UPLOAD_TOOL_NAME, ...ACCOUNT_TOOL_NAMES]`.
 */
export const ACCOUNT_TOOL_NAMES = (Object.keys(TOOLS) as ToolName[]).filter(
  (name): name is AccountToolName => TOOLS[name].auth === 'required',
);

/**
 * What `whoami` answers: exactly the keys its description names. The schema
 * is the projection: parsing the wire's `Account` through this pick drops
 * the rest (billing state, the picture, timestamps), which an agent does not
 * act on, so one declaration owns the `outputSchema` and the result.
 * `suspended` is left out on purpose: it means every write is refused, and
 * the refusal says so itself when it matters.
 */
export const ACCOUNT_SUMMARY = AccountSchema.pick({
  email: true,
  name: true,
  plan: true,
  usage: true,
  caps: true,
});

/**
 * The paging input every list tool takes. A list answers
 * `{<collection>, cursor}`: `cursor` is the whole has-more signal and is null
 * on the last page, so there is no `total` and no boolean.
 *
 * No upper bound is stated: the API clamps `limit` and owns that number.
 * `min(1)` is not a cap, it rejects a value that could never mean anything.
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

/** Appended to every list tool's description: the paging contract, stated once. */
const PAGING_NOTE =
  " The response's `cursor` is null on the last page; pass it back as `cursor` to fetch the next.";

/** The example hostname every deployment argument shows. */
const DEPLOYMENT_EXAMPLE = 'happy-cat-abc1234.shipstatic.com';

export function registerAccountTools(server: McpServer, ship: Ship, call: CallFn): void {
  // Deployments

  server.registerTool(
    'deployments_list',
    titled({
      title: 'List Deployments',
      description: `List all deployments with their URLs, status, labels, and password protection state.${PAGING_NOTE}`,
      annotations: annotate(TOOLS.deployments_list),
      outputSchema: DeploymentListResponseSchema,
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
      outputSchema: DeploymentSchema,
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
      outputSchema: DeploymentSchema,
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
      outputSchema: DeploymentDeleteResponseSchema,
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
      title: 'Set Domain',
      description:
        'Create or update a domain: a ShipStatic domain (e.g. "yourname.shipstatic.com"), live as soon as a deployment is linked, or a custom domain (e.g. "www.example.com"), which needs DNS records first. Can reserve a name (omit deployment), link it to a deployment, switch deployments, or update labels. For a custom domain, domains_records then returns the DNS records to configure.',
      annotations: annotate(TOOLS.domains_set),
      outputSchema: DomainSetResultSchema,
      inputSchema: {
        domain: z
          .string()
          .describe(
            'Domain name: a ShipStatic domain (e.g. "yourname.shipstatic.com") or a custom domain (e.g. "www.example.com")',
          ),
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
      description: `List all domains with their URLs, linked deployment, and \`status\`.${PAGING_NOTE}`,
      annotations: annotate(TOOLS.domains_list),
      outputSchema: DomainListResponseSchema,
      inputSchema: PAGINATION_INPUT,
    }),
    ({ limit, cursor }) => call(() => ship.domains.list({ limit, cursor })),
  );

  server.registerTool(
    'domains_get',
    titled({
      title: 'Get Domain',
      description:
        'Get domain details including URL, linked deployment, labels, and `status`: the one word saying what the domain needs from its owner (`unverified`, `unlinked`, `live`, `paused`).',
      annotations: annotate(TOOLS.domains_get),
      outputSchema: DomainSchema,
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
        "Returns the DNS records to configure at the domain's DNS provider. Call after domains_set. Custom domains only: a ShipStatic domain has no records to configure.",
      annotations: annotate(TOOLS.domains_records),
      outputSchema: DomainRecordsResponseSchema,
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
        'Returns the DNS provider recorded for the domain, if known (e.g. Cloudflare, Namecheap): where its DNS records are configured. Custom domains only, and only while the domain is unverified; once its DNS is right there is nothing left to locate.',
      annotations: annotate(TOOLS.domains_dns),
      outputSchema: DomainDnsResponseSchema,
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
        "Returns a shareable DNS setup URL that needs no API key, for whoever manages the domain's DNS. Custom domains only, and only while the domain is unverified; a verified domain has no setup left to share.",
      annotations: annotate(TOOLS.domains_share),
      outputSchema: DomainShareResponseSchema,
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
      outputSchema: DomainValidateResponseSchema,
      inputSchema: {
        domain: z
          .string()
          .describe(
            'Domain name to check (e.g. "yourname.shipstatic.com" or "www.example.com"). Call before domains_set to check availability.',
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
        'Trigger DNS verification for a custom domain. Call after the user has configured DNS records from domains_records. Custom domains only, and refused once the domain is verified: read domains_get instead. Verification is asynchronous: read the domain again with domains_get to learn the verdict, since its `status` has not moved yet when this returns. A verified domain serves nothing until a deployment is linked with domains_set.',
      annotations: annotate(TOOLS.domains_verify),
      outputSchema: DomainVerifyResponseSchema,
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
      outputSchema: DomainDeleteResponseSchema,
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
      description: "Returns your email and name, and the account's plan, usage and caps.",
      annotations: annotate(TOOLS.whoami),
      outputSchema: ACCOUNT_SUMMARY,
    }),
    () => call(() => ship.whoami().then((account) => ACCOUNT_SUMMARY.parse(account))),
  );
}
