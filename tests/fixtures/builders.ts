/**
 * @file Typed builders — the ONLY source of fixture data in this suite.
 *
 * Every value here is a shape the real API can actually produce. The values
 * are carried over from `npm/ship/tests/fixtures/builders.ts`, which was
 * checked against `cloudflare/api` on 2026-07-27; the wire citations travel
 * with them.
 *
 * Why this matters more for MCP than it looks. MCP is a pure pass-through:
 * whatever the SDK returns is `JSON.stringify`d straight into the tool
 * response an agent reads. A fixture that is not a real wire shape means the
 * suite proves the agent sees something no agent will ever see. The 2026-07-27
 * audit of this repo found exactly that in five places — `deployments.list`
 * returning a bare array (the wire returns `{deployments, cursor}`),
 * `domains.set` returning a `Domain` without `isCreate`, and `whoami`,
 * `domains.records`, `domains.validate` all returning `{}`.
 *
 * **Determinism law: no `Date.now()`.** Every timestamp is an explicit
 * argument with a fixed default, so a value that reaches an assertion is
 * always the same value.
 *
 * The `satisfies` clauses below are load-bearing, not decoration — they are
 * checked by `pnpm typecheck` (`tsconfig.check.json` covers `tests/**`). They
 * are also this suite's contract detector for the pending ship 2.0 bump: when
 * `@shipstatic/types` adds a required field, these stop compiling.
 */

import type {
  AccountGetResponse,
  Deployment,
  DeploymentCreateResponse,
  DeploymentDeleteResponse,
  DeploymentListResponse,
  DnsRecord,
  Domain,
  DomainDeleteResponse,
  DomainDnsResponse,
  DomainListResponse,
  DomainRecordsResponse,
  DomainSetResult,
  DomainValidateResponse,
  DomainVerifyResponse,
} from '@shipstatic/types';
import { API_KEY, DEPLOY_TOKEN } from '@shipstatic/types';

// =============================================================================
// PLATFORM CONSTANTS (wire truth)
// =============================================================================

/** The platform's domain. Production is the only public value. */
export const PLATFORM_DOMAIN = 'shipstatic.com';

/** `getCnameTarget(env.DOMAIN)` — wire: cloudflare/shared/domain.ts:18 */
export const CNAME_TARGET = `cname.${PLATFORM_DOMAIN}`;

/** The platform's real A record. wire: wrangler.{dev,prod}.jsonc `A_RECORD_IP` */
export const A_RECORD_IP = '15.204.149.253';

/** Public/anonymous deployment lifetime and claim window. wire: api/src/lib/config.ts */
export const PUBLIC_TTL_SECONDS = 3 * 24 * 60 * 60;

// =============================================================================
// FIXED TIMESTAMPS
// =============================================================================

export const timestamps = {
  /** 2022-01-01T00:00:00Z */
  jan2022: 1640995200,
} as const;

// =============================================================================
// IDENTIFIER SHAPES
// =============================================================================

/**
 * `isDeployment` in `@shipstatic/types` requires `word-word-alnum7`. Anything
 * else is an impossible input — `PUT /domains/:d` rejects it at the schema.
 */
export const deploymentId = (slug = 'brave-otter-a1b2c3d') => `${slug}.${PLATFORM_DOMAIN}`;

/**
 * The three minted populations, each built from its shape constants: every
 * one is named by its prefix, and every one is the platform's single entropy
 * width. Widths are read, never written — a literal here would keep passing
 * while the population it stands for moved. wire: types CREDENTIAL SHAPES.
 */
export const apiKey = (fill = 'a') => `${API_KEY.PREFIX}${fill.repeat(API_KEY.HEX_LENGTH)}`;

export const deployToken = (fill = 'b') =>
  `${DEPLOY_TOKEN.PREFIX}${fill.repeat(DEPLOY_TOKEN.HEX_LENGTH)}`;

export const claimUrl = (code = 'c'.repeat(API_KEY.HEX_LENGTH)) =>
  `https://my.${PLATFORM_DOMAIN}/claim/${code}`;

/** The custom domain every domain tool is exercised against. */
export const CUSTOM_DOMAIN = 'www.example.com';

/** Its apex — where the user actually configures DNS. */
export const CUSTOM_APEX = 'example.com';

// =============================================================================
// BUILDERS
// =============================================================================

export function makeDeployment(overrides: Partial<Deployment> = {}): Deployment {
  const deployment = overrides.deployment ?? deploymentId();
  const slug = deployment.split('.')[0];
  return {
    deployment,
    url: `https://${deployment}`,
    files: 5,
    size: 1024000,
    status: 'success',
    config: false,
    password: false,
    labels: [],
    via: 'mcp',
    created: timestamps.jan2022,
    expires: null,
    screenshot: `https://screenshots.${PLATFORM_DOMAIN}/${slug}/0123456789abcdef`,
    ...overrides,
  } satisfies Deployment;
}

/**
 * An AUTHENTICATED deploy's create response: account-owned, so it never
 * expires and carries no claim URL.
 */
export function makeDeploymentCreateResponse(
  overrides: Partial<DeploymentCreateResponse> = {},
): DeploymentCreateResponse {
  return { ...makeDeployment(), ...overrides } satisfies DeploymentCreateResponse;
}

/**
 * An ANONYMOUS deploy: public-account owned, hence expiring and claimable.
 * wire: deployment-orchestrator.ts (isPublicDeploy → claim + PUBLIC_TTL).
 *
 * This is the shape behind MCP's headline promise — "free, no account
 * required" — and the one the agent must relay to the user.
 */
export function makePublicDeployment(
  overrides: Partial<DeploymentCreateResponse> = {},
): DeploymentCreateResponse {
  const created = overrides.created ?? timestamps.jan2022;
  return {
    ...makeDeployment({ created, expires: created + PUBLIC_TTL_SECONDS }),
    claim: claimUrl(),
    ...overrides,
  } satisfies DeploymentCreateResponse;
}

export function makeDeploymentList(
  overrides: Partial<DeploymentListResponse> = {},
): DeploymentListResponse {
  return {
    deployments: [makeDeployment()],
    cursor: null,
    ...overrides,
  } satisfies DeploymentListResponse;
}

export function makeDomain(domain = CUSTOM_DOMAIN, overrides: Partial<Domain> = {}): Domain {
  return {
    domain,
    url: `https://${domain}`,
    deployment: deploymentId(),
    // Custom domains wait on DNS verification.
    status: 'pending',
    labels: [],
    created: timestamps.jan2022,
    linked: timestamps.jan2022,
    links: 1,
    ...overrides,
  } satisfies Domain;
}

/**
 * `domains.set`'s return: a `Domain` plus the SDK-derived `isCreate` flag
 * (HTTP 201 vs 200). Not part of the wire body — the SDK derives it from the
 * status code. wire: @shipstatic/types `DomainSetResult`.
 */
export function makeDomainSetResult(overrides: Partial<DomainSetResult> = {}): DomainSetResult {
  return { ...makeDomain(), isCreate: true, ...overrides } satisfies DomainSetResult;
}

export function makeDomainList(overrides: Partial<DomainListResponse> = {}): DomainListResponse {
  return {
    domains: [makeDomain()],
    cursor: null,
    ...overrides,
  } satisfies DomainListResponse;
}

/** wire: shared/dns.ts `domainRecords(domain, A_RECORD_IP, getCnameTarget(DOMAIN))` */
export function makeDnsRecords(): DnsRecord[] {
  return [
    // A first, CNAME second — the A record is the apex redirect, the CNAME is
    // the hosted endpoint (root CLAUDE.md "Custom Domain Model").
    { type: 'A', name: '@', value: A_RECORD_IP },
    { type: 'CNAME', name: 'www', value: CNAME_TARGET },
  ];
}

export function makeDomainRecords(
  overrides: Partial<DomainRecordsResponse> = {},
): DomainRecordsResponse {
  return {
    domain: CUSTOM_DOMAIN,
    apex: CUSTOM_APEX,
    records: makeDnsRecords(),
    ...overrides,
  } satisfies DomainRecordsResponse;
}

export function makeDomainDns(overrides: Partial<DomainDnsResponse> = {}): DomainDnsResponse {
  return {
    domain: CUSTOM_DOMAIN,
    dns: { provider: { name: 'Cloudflare' } },
    ...overrides,
  } satisfies DomainDnsResponse;
}

export function makeDomainValidate(
  overrides: Partial<DomainValidateResponse> = {},
): DomainValidateResponse {
  return {
    valid: true,
    normalized: CUSTOM_DOMAIN,
    available: true,
    reason: null,
    ...overrides,
  } satisfies DomainValidateResponse;
}

/** `domains.verify` answers the acknowledgement — 202 `{domain}`; wire: `DomainResource.verify`. */
export function makeDomainVerify(domain = CUSTOM_DOMAIN): DomainVerifyResponse {
  return { domain };
}

/**
 * A deletion acknowledgement — the resource noun carrying its canonical key,
 * plus the resource's own state where the state changed. Deletions are not
 * void: the wire answers, and an agent reads the state from the answer.
 */
export function makeDeploymentDelete(deployment = deploymentId()): DeploymentDeleteResponse {
  return { deployment, status: 'deleting' };
}

export function makeDomainDelete(domain = CUSTOM_DOMAIN): DomainDeleteResponse {
  return { domain };
}

/** `domains.share` resolves to the domain plus its finished setup link. */
export function makeDomainShare(
  url = `https://connect.shipstatic.com/${CUSTOM_DOMAIN}/a1b2c3d4e5f60718`,
): { domain: string; url: string } {
  return { domain: CUSTOM_DOMAIN, url };
}

/**
 * What `whoami` resolves: `Account` plus the authorization facts only
 * `GET /account` reports. `authMethod` is required — the API always says how
 * the caller was authorized. wire: `AccountGetResponse`.
 */
export function makeAccount(overrides: Partial<AccountGetResponse> = {}): AccountGetResponse {
  return {
    email: 'test@example.com',
    name: 'Test User',
    picture: 'https://example.com/avatar.jpg',
    plan: 'free',
    suspended: false,
    usage: { deployments: 0, platformDomains: 0, customDomains: 0 },
    caps: { deployments: 100, platformDomains: 10, customDomains: 0 },
    created: timestamps.jan2022,
    activated: null,
    hint: null,
    used: null,
    pastDue: false,
    billed: false,
    upgrade: 'pro',
    // Up is now, down is at period end: the live billing interval and the
    // pending period-end change, both null while nothing bills the account.
    interval: null,
    scheduled: null,
    cancelAt: null,
    // `apiKey` is what a `ship-` prefixed SHIP_TOKEN classifies as; the value's
    // prefix decides, and the server reports the classification back.
    authMethod: 'apiKey',
    ...overrides,
  } satisfies AccountGetResponse;
}
