import type Ship from '@shipstatic/ship';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { call } from './call.js';

const OPEN_WORLD = { openWorldHint: true } as const;
const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, ...OPEN_WORLD } as const;
const CREATE = { destructiveHint: false, ...OPEN_WORLD } as const;
const WRITE = { destructiveHint: false, idempotentHint: true, ...OPEN_WORLD } as const;
const DESTRUCTIVE = { destructiveHint: true, idempotentHint: true, ...OPEN_WORLD } as const;

const INSTRUCTIONS = `ShipStatic deploys static websites instantly. No account required.

To deploy: call deployments_upload with the build output directory path. The site is live immediately.

Without SHIP_API_KEY, deployments are public and expire in 3 days. The response includes a claim URL — always show the deployment URL and the claim URL to the user so they can keep the site permanently.

With SHIP_API_KEY configured, deployments go to the user's account and never expire. Listing, managing, and domain operations also require SHIP_API_KEY.

Concepts:
- Deployment: an immutable set of files with an instant URL (e.g. happy-cat-abc1234.shipstatic.com). No setup needed.
- Domain: a custom domain (e.g. www.example.com) pointing to a deployment. Optional. Subdomains only — not apex domains.

To add a custom domain: domains_validate → domains_set → domains_records (show DNS records to user) → user configures DNS → domains_verify.`;

export function createServer(ship: Ship): McpServer {
  const server = new McpServer({
    name: 'shipstatic',
    version: '0.4.3',
  }, {
    instructions: INSTRUCTIONS,
  });

  // Deployments

  server.registerTool('deployments_upload', {
    description: 'Deploy a static site instantly. No account or API key required. Returns the live URL, file count, and size. Without SHIP_API_KEY, the response includes a claim URL (site expires in 3 days) — always show both the deployment URL and claim URL to the user.',
    annotations: CREATE,
    inputSchema: {
      path: z.string().describe('Absolute path to the build output directory to deploy (e.g. "/Users/me/project/dist")'),
      labels: z.array(z.string()).optional().describe('Labels for organizing deployments (e.g. ["production", "v1.2"]). Lowercase, 3-25 chars, allows . _ - separators.'),
    },
  }, ({ path, labels }) =>
    call(() => ship.deployments.upload(path, { labels, via: 'mcp' }))
  );

  server.registerTool('deployments_list', {
    description: 'List all deployments with their URLs, status, and labels.',
    annotations: READ,
  }, () => call(() => ship.deployments.list()));

  server.registerTool('deployments_get', {
    description: 'Get deployment details including URL, status, file count, size, and labels.',
    annotations: READ,
    inputSchema: {
      deployment: z.string().describe('Deployment hostname (e.g. "happy-cat-abc1234.shipstatic.com"). Returned by deployments_upload or deployments_list.'),
    },
  }, ({ deployment }) => call(() => ship.deployments.get(deployment)));

  server.registerTool('deployments_set', {
    description: 'Update deployment labels. Replaces all existing labels.',
    annotations: WRITE,
    inputSchema: {
      deployment: z.string().describe('Deployment hostname (e.g. "happy-cat-abc1234.shipstatic.com"). Use deployments_list to find deployments.'),
      labels: z.array(z.string()).describe('Labels to set. Replaces all existing labels. Pass empty array to clear.'),
    },
  }, ({ deployment, labels }) => call(() => ship.deployments.set(deployment, { labels })));

  server.registerTool('deployments_remove', {
    description: 'Permanently delete a deployment and its files. You MUST confirm with the user before calling this tool, referencing the deployment.',
    annotations: DESTRUCTIVE,
    inputSchema: {
      deployment: z.string().describe('Deployment hostname to delete (e.g. "happy-cat-abc1234.shipstatic.com")'),
    },
  }, ({ deployment }) => call(() => ship.deployments.remove(deployment)));

  // Domains

  server.registerTool('domains_set', {
    description: 'Create or update a custom domain. Can reserve a name (omit deployment), link it to a deployment, switch deployments, or update labels. After creating, call domains_records and show the DNS records to the user.',
    annotations: WRITE,
    inputSchema: {
      domain: z.string().describe('Domain name (e.g. "www.example.com" or "blog.example.com")'),
      deployment: z.string().optional().describe('Deployment to serve on this domain (e.g. "happy-cat-abc1234.shipstatic.com"). Omit to reserve the domain without linking.'),
      labels: z.array(z.string()).optional().describe('Labels for organizing domains (e.g. ["production"]).'),
    },
  }, ({ domain, deployment, labels }) =>
    call(() => ship.domains.set(domain, { deployment, labels }))
  );

  server.registerTool('domains_list', {
    description: 'List all domains with their URLs, linked deployments, and verification status.',
    annotations: READ,
  }, () => call(() => ship.domains.list()));

  server.registerTool('domains_get', {
    description: 'Get domain details including URL, linked deployment, verification status, and labels.',
    annotations: READ,
    inputSchema: {
      domain: z.string().describe('Domain name (e.g. "www.example.com"). Use domains_list to find names.'),
    },
  }, ({ domain }) => call(() => ship.domains.get(domain)));

  server.registerTool('domains_records', {
    description: 'Get the DNS records the user needs to configure at their DNS provider. Call after domains_set. You MUST show the returned records to the user.',
    annotations: READ,
    inputSchema: {
      domain: z.string().describe('Domain name. Must be a domain previously created with domains_set.'),
    },
  }, ({ domain }) => call(() => ship.domains.records(domain)));

  server.registerTool('domains_dns', {
    description: 'Look up the DNS provider for a domain (e.g. Cloudflare, Namecheap). Helps the user know where to configure their DNS records.',
    annotations: READ,
    inputSchema: {
      domain: z.string().describe('Domain name to look up DNS provider for (e.g. "www.example.com")'),
    },
  }, ({ domain }) => call(() => ship.domains.dns(domain)));

  server.registerTool('domains_share', {
    description: 'Get a shareable DNS setup hash for a domain. The hash can be shared with the user so they can view the required DNS records without needing an API key.',
    annotations: READ,
    inputSchema: {
      domain: z.string().describe('Domain name to generate a share link for. Must be a domain previously created with domains_set.'),
    },
  }, ({ domain }) => call(() => ship.domains.share(domain)));

  server.registerTool('domains_validate', {
    description: 'Check if a domain name is valid and available before creating it. Returns the normalized form and availability.',
    annotations: READ,
    inputSchema: {
      domain: z.string().describe('Domain name to check (e.g. "www.example.com"). Call before domains_set to check availability.'),
    },
  }, ({ domain }) => call(() => ship.domains.validate(domain)));

  server.registerTool('domains_verify', {
    description: 'Trigger DNS verification for a custom domain. Call after the user has configured DNS records from domains_records. Verification is asynchronous — the domain status updates once DNS propagates.',
    annotations: WRITE,
    inputSchema: {
      domain: z.string().describe('Domain name to verify DNS for. Must be a domain previously created with domains_set.'),
    },
  }, ({ domain }) => call(() => ship.domains.verify(domain)));

  server.registerTool('domains_remove', {
    description: 'Permanently delete a domain. You MUST confirm with the user before calling this tool, referencing the domain name.',
    annotations: DESTRUCTIVE,
    inputSchema: {
      domain: z.string().describe('Domain name to delete (e.g. "www.example.com")'),
    },
  }, ({ domain }) => call(() => ship.domains.remove(domain)));

  // Debugging

  server.registerTool('whoami', {
    description: 'Show authenticated account details including email, plan, and usage.',
    annotations: READ,
  }, () => call(() => ship.whoami()));

  return server;
}
