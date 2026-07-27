/**
 * @file The ONE fake in this suite, at the ONE boundary MCP has.
 *
 * MCP is a thin wrapper: every tool handler is `call(() => ship.x.y(...))`.
 * The ship SDK is therefore its only collaborator, and faking it is faking
 * everything below MCP.
 *
 * **Why a fake and not injected transport.** Ship 2.0 added a `fetch` option,
 * so driving a real `Ship` against a wire-truth handler — the way ship's own
 * suite works — is now possible. It is still the wrong choice HERE, and the
 * reason is worth recording because it will be asked again:
 *
 *   - It would make MCP keep a second hand-maintained twin of `cloudflare/api`.
 *     Ship already maintains one, checked against the real API and backed by
 *     an e2e drift detector. Two twins drift independently, and the second one
 *     has no drift detector.
 *   - It would test the SDK's HTTP layer, which is not MCP's contract. MCP's
 *     contract is "tool X calls SDK method Y with arguments Z" — a statement
 *     about the boundary, best asserted at the boundary.
 *   - `deployments.upload` takes a filesystem PATH. Reaching the wire through
 *     it needs real fixture files, hashing and multipart encoding — a large
 *     apparatus to re-prove something ship proves already.
 *
 * What MCP actually needs is for SDK SIGNATURE drift to be loud. That is a
 * type-level property, and the typing below makes it a compile error.
 *
 * **The typing is the point.** `ShipSurface` is derived from the real `Ship`
 * class with `Pick`, and each `vi.fn` is parameterised by the real method
 * signature off `@shipstatic/types`' resource interfaces. So:
 *
 *   - a `mockResolvedValue` of the wrong shape is a COMPILE error, which is
 *     what stops the five fictional shapes the audit found from coming back;
 *   - if the SDK renames a method, widens an argument, or changes a return
 *     type, this file stops compiling. That is the safety net the pending
 *     ship-2.0 bump lands on — the break surfaces at `pnpm typecheck`, in one
 *     file, instead of at runtime in an agent's session.
 *
 * Note `ShipSurface` deliberately does NOT include `account` or `tokens`:
 * `createServer` never touches them, and a fake should be exactly as wide as
 * the collaboration it stands in for.
 */

import type Ship from '@shipstatic/ship';
import type { DeploymentResource, DomainResource } from '@shipstatic/types';
import { vi } from 'vitest';
import {
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
} from '../fixtures/builders.js';

/**
 * The exact slice of the `Ship` class `createServer` consumes, derived from
 * the class itself rather than restated. Adding a tool that reaches outside
 * this slice is a deliberate edit here, not an accident.
 */
export type ShipSurface = Pick<Ship, 'deployments' | 'domains' | 'whoami'>;

export interface ShipFake extends ShipSurface {
  deployments: {
    [K in keyof DeploymentResource]: ReturnType<typeof vi.fn<DeploymentResource[K]>>;
  };
  domains: { [K in keyof DomainResource]: ReturnType<typeof vi.fn<DomainResource[K]>> };
  whoami: ReturnType<typeof vi.fn<Ship['whoami']>>;
}

/**
 * A fake whose every method resolves a real wire shape. Tests that care about
 * a specific outcome override one method (`ship.deployments.upload
 * .mockResolvedValue(makePublicDeployment())`); tests that only care about
 * wiring leave the defaults alone.
 */
export function createShipFake(): ShipFake {
  return {
    deployments: {
      upload: vi
        .fn<DeploymentResource['upload']>()
        .mockResolvedValue(makeDeploymentCreateResponse()),
      list: vi.fn<DeploymentResource['list']>().mockResolvedValue(makeDeploymentList()),
      get: vi.fn<DeploymentResource['get']>().mockResolvedValue(makeDeployment()),
      set: vi.fn<DeploymentResource['set']>().mockResolvedValue(makeDeployment()),
      // `remove` resolves void — the "Done." path through `call()`.
      remove: vi.fn<DeploymentResource['remove']>().mockResolvedValue(undefined),
    },
    domains: {
      set: vi.fn<DomainResource['set']>().mockResolvedValue(makeDomainSetResult()),
      list: vi.fn<DomainResource['list']>().mockResolvedValue(makeDomainList()),
      get: vi.fn<DomainResource['get']>().mockResolvedValue(makeDomain()),
      remove: vi.fn<DomainResource['remove']>().mockResolvedValue(undefined),
      verify: vi.fn<DomainResource['verify']>().mockResolvedValue(makeDomainVerify()),
      validate: vi.fn<DomainResource['validate']>().mockResolvedValue(makeDomainValidate()),
      dns: vi.fn<DomainResource['dns']>().mockResolvedValue(makeDomainDns()),
      records: vi.fn<DomainResource['records']>().mockResolvedValue(makeDomainRecords()),
      share: vi.fn<DomainResource['share']>().mockResolvedValue(makeDomainShare()),
    },
    whoami: vi.fn<Ship['whoami']>().mockResolvedValue(makeAccount()),
  };
}
