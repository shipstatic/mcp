import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createServer } from '../src/server.js';

function createMockShip() {
  return {
    deployments: {
      upload: vi.fn().mockResolvedValue({}),
      list: vi.fn().mockResolvedValue({}),
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue({}),
      remove: vi.fn().mockResolvedValue(undefined),
    },
    domains: {
      set: vi.fn().mockResolvedValue({}),
      list: vi.fn().mockResolvedValue({}),
      get: vi.fn().mockResolvedValue({}),
      records: vi.fn().mockResolvedValue({}),
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
    vi.spyOn(McpServer.prototype, 'registerTool').mockImplementation(
      function (this: McpServer, name: string, config: any, cb: any) {
        tools.set(name, cb);
        configs.set(name, config);
        return orig.call(this, name, config, cb);
      },
    );

    createServer(ship);
    vi.restoreAllMocks();
  });

  it('registers 12 tools', () => {
    expect([...tools.keys()].sort()).toEqual([
      'deployments_get',
      'deployments_list',
      'deployments_remove',
      'deployments_set',
      'deployments_upload',
      'domains_get',
      'domains_list',
      'domains_records',
      'domains_remove',
      'domains_set',
      'domains_validate',
      'domains_verify',
    ]);
  });

  it('marks read-only tools', () => {
    const readOnly = ['deployments_list', 'deployments_get', 'domains_list', 'domains_get', 'domains_records', 'domains_validate'];
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

  // Deployments

  it('upload passes path, options, and via:mcp', async () => {
    await tools.get('deployments_upload')!({ path: '/tmp/dist', subdomain: 'my-site', labels: ['v1'] }, {});
    expect(ship.deployments.upload).toHaveBeenCalledWith('/tmp/dist', {
      subdomain: 'my-site', labels: ['v1'], via: 'mcp',
    });
  });

  it('upload passes undefined for omitted optional args', async () => {
    await tools.get('deployments_upload')!({ path: '/tmp/dist' }, {});
    expect(ship.deployments.upload).toHaveBeenCalledWith('/tmp/dist', {
      subdomain: undefined, labels: undefined, via: 'mcp',
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
    await tools.get('domains_set')!({ domain: 'www.example.com', deployment: 'abc', labels: ['prod'] }, {});
    expect(ship.domains.set).toHaveBeenCalledWith('www.example.com', {
      deployment: 'abc', labels: ['prod'],
    });
  });

  it('domains set passes undefined for omitted optional args', async () => {
    await tools.get('domains_set')!({ domain: 'www.example.com' }, {});
    expect(ship.domains.set).toHaveBeenCalledWith('www.example.com', {
      deployment: undefined, labels: undefined,
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
});
