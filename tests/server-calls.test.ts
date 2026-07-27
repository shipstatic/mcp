import { ShipError } from '@shipstatic/types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CUSTOM_DOMAIN,
  deploymentId,
  makeAccount,
  makeDeployment,
  makeDeploymentCreateResponse,
  makeDeploymentList,
  makeDomain,
  makeDomainDns,
  makeDomainList,
  makeDomainRecords,
  makeDomainSetResult,
  makeDomainShare,
  makeDomainValidate,
  makeDomainVerify,
  makePublicDeployment,
  PUBLIC_TTL_SECONDS,
  timestamps,
} from './fixtures/builders.js';
import { connect, type Harness, jsonOf, textOf } from './harness.js';
import type { ShipFake } from './mocks/ship.js';

/**
 * @file Tool CALLS — what happens when an agent invokes a tool. The catalogue
 * it reads first is pinned in `server.test.ts`.
 *
 * Two contracts live here:
 *
 *   1. **Wiring.** Every tool is a one-liner delegating to exactly one SDK
 *      method (`integrations/mcp/CLAUDE.md`, "SDK Wrapper — No Business
 *      Logic"). The table below is that claim made mechanical: arguments in
 *      at the protocol, exact arguments out at the SDK boundary. A tool that
 *      grows business logic breaks it.
 *
 *   2. **Pass-through fidelity.** MCP does not reshape payloads — whatever
 *      the SDK returns is `JSON.stringify`d into the text an agent reads. So
 *      the assertions compare against the wire shapes in `fixtures/builders.ts`
 *      rather than against hand-written expectations.
 *
 * Every call goes through a real `Client` (see `harness.ts`), which means zod
 * validates first — the arguments below are ones an agent could really send.
 */

const DEPLOYMENT = deploymentId();
const ABS_PATH = '/Users/me/project/dist';

// =============================================================================
// WIRING TABLE
// =============================================================================

interface WiringCase {
  tool: string;
  args: Record<string, unknown>;
  /** The single SDK method this tool is allowed to reach. */
  method: (ship: ShipFake) => { mock: { calls: unknown[][] } };
  /** Exactly the arguments that method must receive. */
  received: unknown[];
}

const WIRING: WiringCase[] = [
  // ---------------------------------------------------------------- deployments
  {
    tool: 'deployments_upload',
    args: { path: ABS_PATH, labels: ['production', 'v1.2'], password: 'hunter22' },
    method: (s) => s.deployments.upload,
    // `via: 'mcp'` is origin tracking — the MCP analogue of the CLI's
    // `via: 'cli'`. It is the only value MCP adds to any call.
    received: [ABS_PATH, { labels: ['production', 'v1.2'], password: 'hunter22', via: 'mcp' }],
  },
  {
    tool: 'deployments_upload',
    args: { path: ABS_PATH },
    method: (s) => s.deployments.upload,
    // Omitted optionals stay `undefined` rather than being dropped: the SDK
    // distinguishes "not supplied" from "supplied empty" for `password`.
    received: [ABS_PATH, { labels: undefined, password: undefined, via: 'mcp' }],
  },
  {
    tool: 'deployments_list',
    args: {},
    method: (s) => s.deployments.list,
    // No arguments at all. This is also the pagination pin: the SDK's
    // `list(options?)` can page, and MCP never passes anything — see
    // HANDOVER-MCP-TESTING.md, "Flagged: pagination".
    received: [],
  },
  {
    tool: 'deployments_get',
    args: { deployment: DEPLOYMENT },
    method: (s) => s.deployments.get,
    received: [DEPLOYMENT],
  },
  {
    tool: 'deployments_set',
    args: { deployment: DEPLOYMENT, labels: ['staging'] },
    method: (s) => s.deployments.set,
    received: [DEPLOYMENT, { labels: ['staging'] }],
  },
  {
    tool: 'deployments_set',
    args: { deployment: DEPLOYMENT, labels: [] },
    method: (s) => s.deployments.set,
    // An empty array is the documented "clear all labels" instruction, and it
    // must survive as an empty array rather than collapsing to undefined.
    received: [DEPLOYMENT, { labels: [] }],
  },
  {
    tool: 'deployments_remove',
    args: { deployment: DEPLOYMENT },
    method: (s) => s.deployments.remove,
    received: [DEPLOYMENT],
  },

  // -------------------------------------------------------------------- domains
  {
    tool: 'domains_set',
    args: { domain: CUSTOM_DOMAIN, deployment: DEPLOYMENT, labels: ['production'] },
    method: (s) => s.domains.set,
    received: [CUSTOM_DOMAIN, { deployment: DEPLOYMENT, labels: ['production'] }],
  },
  {
    tool: 'domains_set',
    args: { domain: CUSTOM_DOMAIN },
    method: (s) => s.domains.set,
    // Reservation: a domain created without a deployment. Supported by design
    // (root CLAUDE.md, "Domain-Deployment Linking").
    received: [CUSTOM_DOMAIN, { deployment: undefined, labels: undefined }],
  },
  { tool: 'domains_list', args: {}, method: (s) => s.domains.list, received: [] },
  {
    tool: 'domains_get',
    args: { domain: CUSTOM_DOMAIN },
    method: (s) => s.domains.get,
    received: [CUSTOM_DOMAIN],
  },
  {
    tool: 'domains_records',
    args: { domain: CUSTOM_DOMAIN },
    method: (s) => s.domains.records,
    received: [CUSTOM_DOMAIN],
  },
  {
    tool: 'domains_dns',
    args: { domain: CUSTOM_DOMAIN },
    method: (s) => s.domains.dns,
    received: [CUSTOM_DOMAIN],
  },
  {
    tool: 'domains_share',
    args: { domain: CUSTOM_DOMAIN },
    method: (s) => s.domains.share,
    received: [CUSTOM_DOMAIN],
  },
  {
    tool: 'domains_validate',
    args: { domain: CUSTOM_DOMAIN },
    method: (s) => s.domains.validate,
    received: [CUSTOM_DOMAIN],
  },
  {
    tool: 'domains_verify',
    args: { domain: CUSTOM_DOMAIN },
    method: (s) => s.domains.verify,
    received: [CUSTOM_DOMAIN],
  },
  {
    tool: 'domains_remove',
    args: { domain: CUSTOM_DOMAIN },
    method: (s) => s.domains.remove,
    received: [CUSTOM_DOMAIN],
  },

  // ------------------------------------------------------------------ debugging
  { tool: 'whoami', args: {}, method: (s) => s.whoami, received: [] },
];

// =============================================================================

describe('tool wiring', () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await connect();
  });
  afterEach(() => harness.close());

  for (const { tool, args, method, received } of WIRING) {
    const label = Object.keys(args).length ? Object.keys(args).join('+') : 'no arguments';

    it(`${tool} (${label}) reaches its SDK method with exactly the expected arguments`, async () => {
      const result = await harness.client.callTool({ name: tool, arguments: args });

      expect(result.isError, textOf(result)).toBeFalsy();
      expect(method(harness.ship).mock.calls).toEqual([received]);
    });
  }

  it('every tool reaches exactly one SDK method — no tool fans out', async () => {
    // The "no business logic" contract stated as a whole-surface invariant:
    // one protocol call must produce one SDK call, never two.
    const everyMethod = (ship: ShipFake) => [
      ...Object.values(ship.deployments),
      ...Object.values(ship.domains),
      ship.whoami,
    ];

    for (const { tool, args, method } of WIRING) {
      const fresh = await connect();
      await fresh.client.callTool({ name: tool, arguments: args });

      const called = everyMethod(fresh.ship).filter((fn) => fn.mock.calls.length > 0);
      expect(called, tool).toHaveLength(1);
      expect(called[0], tool).toBe(method(fresh.ship));

      await fresh.close();
    }
  });
});

describe('response payloads', () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await connect();
  });
  afterEach(() => harness.close());

  // The payloads below are the ones the 2026-07-27 audit found faked. The old
  // suite had `deployments.list` resolving a bare array, `domains.set`
  // resolving a `Domain` with no `isCreate`, and `whoami`, `domains.records`,
  // `domains.validate` all resolving `{}` — so it proved an agent sees data
  // the API cannot produce. Each test names the field that was missing.

  it('deployments_list relays the paginated envelope, not a bare array', async () => {
    const wire = makeDeploymentList({ cursor: 'eyJpZCI6MX0', total: 42 });
    harness.ship.deployments.list.mockResolvedValue(wire);

    const payload = await harness.client
      .callTool({ name: 'deployments_list', arguments: {} })
      .then(jsonOf);

    expect(payload).toEqual(wire);
    expect(payload).toMatchObject({ cursor: 'eyJpZCI6MX0', total: 42 });
  });

  it('domains_list relays the paginated envelope, not a bare array', async () => {
    const wire = makeDomainList({ cursor: null, total: 3 });
    harness.ship.domains.list.mockResolvedValue(wire);

    expect(
      await harness.client.callTool({ name: 'domains_list', arguments: {} }).then(jsonOf),
    ).toEqual(wire);
  });

  it('domains_set relays isCreate, which distinguishes a new domain from a repoint', async () => {
    const wire = makeDomainSetResult({ isCreate: false });
    harness.ship.domains.set.mockResolvedValue(wire);

    const payload = await harness.client
      .callTool({ name: 'domains_set', arguments: { domain: CUSTOM_DOMAIN } })
      .then(jsonOf);

    expect(payload).toEqual(wire);
    expect(payload).toMatchObject({ isCreate: false });
  });

  it('domains_records relays the A-then-CNAME record pair the user must configure', async () => {
    const wire = makeDomainRecords();
    harness.ship.domains.records.mockResolvedValue(wire);

    const payload = await harness.client
      .callTool({ name: 'domains_records', arguments: { domain: CUSTOM_DOMAIN } })
      .then(jsonOf);

    expect(payload).toEqual(wire);
    // A first, CNAME second — the A record is the apex redirect, the CNAME is
    // the hosted endpoint (root CLAUDE.md, "Custom Domain Model"). Order is
    // part of the instruction the agent relays.
    expect((payload as typeof wire).records.map((r) => r.type)).toEqual(['A', 'CNAME']);
  });

  it.each([
    ['deployments_get', { deployment: DEPLOYMENT }, makeDeployment()],
    ['domains_get', { domain: CUSTOM_DOMAIN }, makeDomain()],
    ['domains_dns', { domain: CUSTOM_DOMAIN }, makeDomainDns()],
    ['domains_validate', { domain: CUSTOM_DOMAIN }, makeDomainValidate()],
    ['domains_verify', { domain: CUSTOM_DOMAIN }, makeDomainVerify()],
    ['domains_share', { domain: CUSTOM_DOMAIN }, makeDomainShare()],
    ['whoami', {}, makeAccount()],
  ] as const)('%s relays its wire shape verbatim', async (tool, args, wire) => {
    expect(await harness.client.callTool({ name: tool, arguments: args }).then(jsonOf)).toEqual(
      wire,
    );
  });

  it('serializes payloads as indented JSON — an agent reads this text, not a data structure', async () => {
    const text = await harness.client
      .callTool({ name: 'deployments_get', arguments: { deployment: DEPLOYMENT } })
      .then(textOf);

    expect(text).toBe(JSON.stringify(makeDeployment(), null, 2));
  });

  it.each(['deployments_remove', 'domains_remove'] as const)(
    '%s answers "Done." — the SDK resolves void and there is nothing to serialize',
    async (tool) => {
      const args =
        tool === 'deployments_remove' ? { deployment: DEPLOYMENT } : { domain: CUSTOM_DOMAIN };
      const result = await harness.client.callTool({ name: tool, arguments: args });

      expect(result.isError).toBeFalsy();
      expect(textOf(result)).toBe('Done.');
    },
  );
});

describe('the anonymous claim story', () => {
  // MCP's headline promise is "deploy with no account". The mechanism is a
  // deployment owned by the public account: it expires, and the response
  // carries a one-time claim URL that converts it to a permanent one. If that
  // URL does not reach the agent's text, the user's site silently disappears
  // after three days. This is the sharpest agent-visible edge in the product.

  let harness: Harness;

  beforeEach(async () => {
    harness = await connect();
  });
  afterEach(() => harness.close());

  it('surfaces the claim URL in the tool response text', async () => {
    const anonymous = makePublicDeployment();
    harness.ship.deployments.upload.mockResolvedValue(anonymous);

    const text = await harness.client
      .callTool({ name: 'deployments_upload', arguments: { path: ABS_PATH } })
      .then(textOf);

    // Asserted on the TEXT, not the parsed object: the text is what the model
    // actually reads, and a claim URL present in the payload but absent from
    // the rendered text would be invisible to it.
    expect(text).toContain(anonymous.claim);
    expect(text).toContain(anonymous.url);
  });

  it('surfaces the expiry alongside it, so the agent can state the deadline', async () => {
    const anonymous = makePublicDeployment({ created: timestamps.jan2022 });
    harness.ship.deployments.upload.mockResolvedValue(anonymous);

    const payload = (await harness.client
      .callTool({ name: 'deployments_upload', arguments: { path: ABS_PATH } })
      .then(jsonOf)) as typeof anonymous;

    expect(payload.expires).toBe(timestamps.jan2022 + PUBLIC_TTL_SECONDS);
    expect(payload.claim).toBe(anonymous.claim);
  });

  it('records via:mcp on the wire, so anonymous deploys are attributable to MCP', async () => {
    await harness.client.callTool({ name: 'deployments_upload', arguments: { path: ABS_PATH } });

    expect(harness.ship.deployments.upload).toHaveBeenCalledWith(
      ABS_PATH,
      expect.objectContaining({ via: 'mcp' }),
    );
  });

  it('an authenticated deploy carries no claim URL and never expires', async () => {
    harness.ship.deployments.upload.mockResolvedValue(makeDeploymentCreateResponse());

    const payload = (await harness.client
      .callTool({ name: 'deployments_upload', arguments: { path: ABS_PATH } })
      .then(jsonOf)) as Record<string, unknown>;

    expect(payload.claim).toBeUndefined();
    expect(payload.expires).toBeNull();
  });
});

describe('error surfaces', () => {
  // `call.test.ts` pins the ShipError → CallToolResult mapping directly. These
  // prove it survives the protocol round trip, and — the part only a real
  // client can show — that a failing tool returns an in-band result rather
  // than a JSON-RPC error. That distinction is the difference between an agent
  // that can read the hint and retry, and one whose request simply failed.

  let harness: Harness;

  beforeEach(async () => {
    harness = await connect();
  });
  afterEach(() => harness.close());

  it('an SDK authentication failure arrives as an error result carrying the credential hint', async () => {
    harness.ship.deployments.list.mockRejectedValue(ShipError.authentication('Invalid API key'));

    const result = await harness.client.callTool({ name: 'deployments_list', arguments: {} });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Invalid API key');
    expect(textOf(result)).toContain('SHIP_TOKEN');
  });

  it('a not-found does not suggest credentials — the agent must not retry with a key', async () => {
    harness.ship.deployments.get.mockRejectedValue(
      ShipError.notFound('Deployment', 'brave-otter-a1b2c3d'),
    );

    const result = await harness.client.callTool({
      name: 'deployments_get',
      arguments: { deployment: DEPLOYMENT },
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).not.toContain('SHIP_TOKEN');
  });

  it('a validation failure relays the field-level details', async () => {
    harness.ship.domains.set.mockRejectedValue(
      ShipError.validation('Invalid domain', { field: 'domain', reason: 'apex not supported' }),
    );

    const text = await harness.client
      .callTool({ name: 'domains_set', arguments: { domain: CUSTOM_DOMAIN } })
      .then(textOf);

    expect(text).toContain('Invalid domain');
    expect(text).toContain('apex not supported');
  });

  it('a forbidden failure tells the agent to STOP rather than burn the plan retrying', async () => {
    harness.ship.deployments.upload.mockRejectedValue(
      ShipError.forbidden('Deployment limit reached'),
    );

    const text = await harness.client
      .callTool({ name: 'deployments_upload', arguments: { path: ABS_PATH } })
      .then(textOf);

    expect(text).toContain('Stop retrying');
  });

  it('a tool failure is an in-band result, not a protocol error — the session survives it', async () => {
    harness.ship.whoami.mockRejectedValue(ShipError.authentication('Invalid API key'));

    // Resolves rather than throws...
    const failed = await harness.client.callTool({ name: 'whoami', arguments: {} });
    expect(failed.isError).toBe(true);

    // ...and the same connection still serves the next call.
    harness.ship.whoami.mockResolvedValue(makeAccount());
    const recovered = await harness.client.callTool({ name: 'whoami', arguments: {} });
    expect(recovered.isError).toBeFalsy();
  });
});
