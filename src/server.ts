import type Ship from '@shipstatic/ship';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { call } from './call.js';

const OPEN_WORLD = { openWorldHint: true } as const;
const READ = { readOnlyHint: true, idempotentHint: true, ...OPEN_WORLD } as const;
const WRITE = { idempotentHint: true, ...OPEN_WORLD } as const;
const DESTRUCTIVE = { destructiveHint: true, idempotentHint: true, ...OPEN_WORLD } as const;

export function createServer(ship: Ship): McpServer {
  const server = new McpServer({
    name: 'shipstatic',
    version: '0.1.7',
  }, {
    instructions: 'Deploy a static site to Shipstatic and link it to your domain. To deploy, call deployments_upload with the path to your build output directory. To set up a custom domain, first call domains_validate to check the name, then domains_set to link it to a deployment, then domains_records to get the required DNS records. After DNS is configured, call domains_verify to trigger verification.',
  });

  // Deployments

  server.registerTool('deployments_upload', {
    description: 'Upload deployment from directory',
    annotations: OPEN_WORLD,
    inputSchema: {
      path: z.string().describe('Absolute path to directory or file to deploy'),
      subdomain: z.string().optional().describe('Suggested subdomain'),
      labels: z.array(z.string()).optional().describe('Labels'),
    },
  }, ({ path, subdomain, labels }) =>
    call(() => ship.deployments.upload(path, { subdomain, labels, via: 'mcp' }))
  );

  server.registerTool('deployments_list', {
    description: 'List all deployments',
    annotations: READ,
  }, () => call(() => ship.deployments.list()));

  server.registerTool('deployments_get', {
    description: 'Show deployment information',
    annotations: READ,
    inputSchema: {
      deployment: z.string().describe('Deployment ID (e.g. "happy-cat-abc1234")'),
    },
  }, ({ deployment }) => call(() => ship.deployments.get(deployment)));

  server.registerTool('deployments_set', {
    description: 'Set deployment labels',
    annotations: WRITE,
    inputSchema: {
      deployment: z.string().describe('Deployment ID'),
      labels: z.array(z.string()).describe('New labels for the deployment'),
    },
  }, ({ deployment, labels }) => call(() => ship.deployments.set(deployment, { labels })));

  server.registerTool('deployments_remove', {
    description: 'Delete deployment permanently',
    annotations: DESTRUCTIVE,
    inputSchema: {
      deployment: z.string().describe('Deployment ID to delete'),
    },
  }, ({ deployment }) => call(() => ship.deployments.remove(deployment)));

  // Domains

  server.registerTool('domains_set', {
    description: 'Create domain, link to deployment, or update labels',
    annotations: WRITE,
    inputSchema: {
      domain: z.string().describe('Domain name (e.g. "www.example.com" or "blog.example.com")'),
      deployment: z.string().optional().describe('Deployment ID to link to this domain'),
      labels: z.array(z.string()).optional().describe('Labels'),
    },
  }, ({ domain, deployment, labels }) =>
    call(() => ship.domains.set(domain, { deployment, labels }))
  );

  server.registerTool('domains_list', {
    description: 'List all domains',
    annotations: READ,
  }, () => call(() => ship.domains.list()));

  server.registerTool('domains_get', {
    description: 'Show domain information',
    annotations: READ,
    inputSchema: {
      domain: z.string().describe('Domain name'),
    },
  }, ({ domain }) => call(() => ship.domains.get(domain)));

  server.registerTool('domains_records', {
    description: 'Get required DNS records for a domain',
    annotations: READ,
    inputSchema: {
      domain: z.string().describe('Domain name'),
    },
  }, ({ domain }) => call(() => ship.domains.records(domain)));

  server.registerTool('domains_validate', {
    description: 'Check if domain name is valid and available',
    annotations: READ,
    inputSchema: {
      domain: z.string().describe('Domain name to validate'),
    },
  }, ({ domain }) => call(() => ship.domains.validate(domain)));

  server.registerTool('domains_verify', {
    description: 'Trigger DNS verification for external domain',
    annotations: WRITE,
    inputSchema: {
      domain: z.string().describe('Domain name'),
    },
  }, ({ domain }) => call(() => ship.domains.verify(domain)));

  server.registerTool('domains_remove', {
    description: 'Delete domain permanently',
    annotations: DESTRUCTIVE,
    inputSchema: {
      domain: z.string().describe('Domain name to delete'),
    },
  }, ({ domain }) => call(() => ship.domains.remove(domain)));

  // Debugging

  server.registerTool('whoami', {
    description: 'Show current account information',
    annotations: READ,
  }, () => call(() => ship.whoami()));

  return server;
}
