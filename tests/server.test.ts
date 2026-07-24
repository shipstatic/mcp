import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Deployment, Domain } from '@shipstatic/types';
import { ShipError } from '@shipstatic/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer } from '../src/server.js';

const MOCK_DEPLOYMENT: Deployment = {
  deployment: 'happy-cat-abc1234.shipstatic.com',
  url: 'https://happy-cat-abc1234.shipstatic.com',
  files: 5,
  size: 1024000,
  status: 'success',
  config: false,
  password: false,
  labels: [],
  via: 'mcp',
  created: 1700000000,
  expires: null,
};

const MOCK_DOMAIN: Domain = {
  domain: 'www.example.com',
  url: 'https://www.example.com',
  deployment: 'happy-cat-abc1234.shipstatic.com',
  status: 'success',
  labels: [],
  created: 1700000000,
  linked: 1700000000,
  links: 1,
};

function createMockShip() {
  return {
    deployments: {
      upload: vi.fn().mockResolvedValue(MOCK_DEPLOYMENT),
      list: vi.fn().mockResolvedValue([MOCK_DEPLOYMENT]),
      get: vi.fn().mockResolvedValue(MOCK_DEPLOYMENT),
      set: vi.fn().mockResolvedValue(MOCK_DEPLOYMENT),
      remove: vi.fn().mockResolvedValue(undefined),
    },
    whoami: vi.fn().mockResolvedValue({}),
    domains: {
      set: vi.fn().mockResolvedValue(MOCK_DOMAIN),
      list: vi.fn().mockResolvedValue([MOCK_DOMAIN]),
      get: vi.fn().mockResolvedValue(MOCK_DOMAIN),
      records: vi.fn().mockResolvedValue({}),
      dns: vi.fn().mockResolvedValue({}),
      share: vi.fn().mockResolvedValue({}),
      validate: vi.fn().mockResolvedValue({}),
      verify: vi.fn().mockResolvedValue({}),
      remove: vi.fn().mockResolvedValue(undefined),
    },
  } as any;
}

describe('server', () => {
  let ship: ReturnType<typeof createMockShip>;
  let tools: Map<string, Function>;
  let configs: Map<string, any>;

  beforeEach(() => {
    ship = createMockShip();
    tools = new Map();
    configs = new Map();

    const orig = McpServer.prototype.registerTool;
    const spy = vi.spyOn(McpServer.prototype, 'registerTool').mockImplementation(function (
      this: McpServer,
      name: string,
      config: any,
      cb: any,
    ) {
      tools.set(name, cb);
      configs.set(name, config);
      return orig.call(this, name, config, cb);
    });

    createServer(ship);
    spy.mockRestore();
  });

  it('registers 15 tools', () => {
    expect([...tools.keys()].sort()).toEqual([
      'deployments_get',
      'deployments_list',
      'deployments_remove',
      'deployments_set',
      'deployments_upload',
      'domains_dns',
      'domains_get',
      'domains_list',
      'domains_records',
      'domains_remove',
      'domains_set',
      'domains_share',
      'domains_validate',
      'domains_verify',
      'whoami',
    ]);
  });

  it('marks read-only tools', () => {
    const readOnly = [
      'deployments_list',
      'deployments_get',
      'domains_list',
      'domains_get',
      'domains_records',
      'domains_dns',
      'domains_share',
      'domains_validate',
      'whoami',
    ];
    for (const name of readOnly) {
      expect(configs.get(name)?.annotations?.readOnlyHint, name).toBe(true);
    }
  });

  it('marks destructive tools', () => {
    const destructive = ['deployments_remove', 'domains_remove'];
    for (const name of destructive) {
      expect(configs.get(name)?.annotations?.destructiveHint, name).toBe(true);
    }
  });

  it('does not mark upload as idempotent', () => {
    expect(configs.get('deployments_upload')?.annotations?.idempotentHint).toBeUndefined();
  });

  it('marks non-destructive write tools', () => {
    const nonDestructive = [
      'deployments_upload',
      'deployments_set',
      'domains_set',
      'domains_verify',
    ];
    for (const name of nonDestructive) {
      expect(configs.get(name)?.annotations?.destructiveHint, name).toBe(false);
    }
  });

  // Deployments

  it('upload passes path, labels, password, and via:mcp', async () => {
    await tools.get('deployments_upload')!(
      { path: '/tmp/dist', labels: ['v1'], password: 'secret123' },
      {},
    );
    expect(ship.deployments.upload).toHaveBeenCalledWith('/tmp/dist', {
      labels: ['v1'],
      password: 'secret123',
      via: 'mcp',
    });
  });

  it('upload passes undefined for omitted optional args', async () => {
    await tools.get('deployments_upload')!({ path: '/tmp/dist' }, {});
    expect(ship.deployments.upload).toHaveBeenCalledWith('/tmp/dist', {
      labels: undefined,
      password: undefined,
      via: 'mcp',
    });
  });

  it('list calls ship.deployments.list', async () => {
    await tools.get('deployments_list')!({});
    expect(ship.deployments.list).toHaveBeenCalled();
  });

  it('get passes deployment ID', async () => {
    await tools.get('deployments_get')!({ deployment: 'abc' }, {});
    expect(ship.deployments.get).toHaveBeenCalledWith('abc');
  });

  it('set passes ID and labels', async () => {
    await tools.get('deployments_set')!({ deployment: 'abc', labels: ['staging'] }, {});
    expect(ship.deployments.set).toHaveBeenCalledWith('abc', { labels: ['staging'] });
  });

  it('remove passes deployment ID', async () => {
    await tools.get('deployments_remove')!({ deployment: 'abc' }, {});
    expect(ship.deployments.remove).toHaveBeenCalledWith('abc');
  });

  // Domains

  it('domains set passes domain, deployment, and labels', async () => {
    await tools.get('domains_set')!(
      { domain: 'www.example.com', deployment: 'abc', labels: ['prod'] },
      {},
    );
    expect(ship.domains.set).toHaveBeenCalledWith('www.example.com', {
      deployment: 'abc',
      labels: ['prod'],
    });
  });

  it('domains set passes undefined for omitted optional args', async () => {
    await tools.get('domains_set')!({ domain: 'www.example.com' }, {});
    expect(ship.domains.set).toHaveBeenCalledWith('www.example.com', {
      deployment: undefined,
      labels: undefined,
    });
  });

  it('domains list calls ship.domains.list', async () => {
    await tools.get('domains_list')!({});
    expect(ship.domains.list).toHaveBeenCalled();
  });

  it('domains get passes domain name', async () => {
    await tools.get('domains_get')!({ domain: 'www.example.com' }, {});
    expect(ship.domains.get).toHaveBeenCalledWith('www.example.com');
  });

  it('domains records passes domain name', async () => {
    await tools.get('domains_records')!({ domain: 'www.example.com' }, {});
    expect(ship.domains.records).toHaveBeenCalledWith('www.example.com');
  });

  it('domains dns passes domain name', async () => {
    await tools.get('domains_dns')!({ domain: 'www.example.com' }, {});
    expect(ship.domains.dns).toHaveBeenCalledWith('www.example.com');
  });

  it('domains share passes domain name', async () => {
    await tools.get('domains_share')!({ domain: 'www.example.com' }, {});
    expect(ship.domains.share).toHaveBeenCalledWith('www.example.com');
  });

  it('domains validate passes domain name', async () => {
    await tools.get('domains_validate')!({ domain: 'www.example.com' }, {});
    expect(ship.domains.validate).toHaveBeenCalledWith('www.example.com');
  });

  it('domains verify passes domain name', async () => {
    await tools.get('domains_verify')!({ domain: 'www.example.com' }, {});
    expect(ship.domains.verify).toHaveBeenCalledWith('www.example.com');
  });

  it('domains remove passes domain name', async () => {
    await tools.get('domains_remove')!({ domain: 'www.example.com' }, {});
    expect(ship.domains.remove).toHaveBeenCalledWith('www.example.com');
  });

  // Debugging

  it('whoami calls ship.whoami', async () => {
    await tools.get('whoami')!({});
    expect(ship.whoami).toHaveBeenCalled();
  });

  // End-to-end error mapping through call()

  it('tool returns MCP error when SDK throws Authentication, with SHIP_API_KEY hint', async () => {
    ship.deployments.list.mockRejectedValueOnce(ShipError.authentication('Invalid API key'));
    const result = await tools.get('deployments_list')!({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Invalid API key');
    expect(result.content[0].text).toContain('SHIP_API_KEY');
  });

  it('tool returns MCP error when SDK throws NotFound, no auth hint', async () => {
    ship.deployments.get.mockRejectedValueOnce(ShipError.notFound('Deployment', 'abc123'));
    const result = await tools.get('deployments_get')!({ deployment: 'abc123' }, {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).not.toContain('SHIP_API_KEY');
  });

  it('tool returns success result as JSON-stringified payload', async () => {
    const result = await tools.get('deployments_get')!({ deployment: 'happy-cat-abc1234' }, {});
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text)).toEqual(MOCK_DEPLOYMENT);
  });

  it('tool returns "Done." for void destructive operations', async () => {
    const result = await tools.get('deployments_remove')!({ deployment: 'happy-cat-abc1234' }, {});
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toBe('Done.');
  });
});
