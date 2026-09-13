import { createRequire } from 'node:module';
import {
  IDEMPOTENCY_KEY_CONSTRAINTS,
  LABEL_CONSTRAINTS,
  PASSWORD_CONSTRAINTS,
} from '@shipstatic/ship';
import { MY_API_KEY_URL } from '@shipstatic/types';
import * as S from '@shipstatic/types/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ACCOUNT_TOOL_NAMES } from '../src/tools.js';
import { UPLOAD_TOOL_NAME } from '../src/vocabulary.js';
import { connect, type Harness, textOf } from './harness.js';

/**
 * @file The tool CATALOGUE — everything an agent learns before it calls
 * anything. Behaviour lives in `server-calls.test.ts`.
 *
 * The catalogue is the product surface. An MCP client's entire understanding
 * of ShipStatic is the `initialize` instructions plus one `tools/list`
 * response: the tool names it may call, the prose telling it when to, and the
 * JSON Schema telling it what to pass. There is no documentation an agent
 * reads instead. So this file pins that response exactly — including the
 * descriptions, because a description is not a comment here, it is the API.
 *
 * Everything is observed through a real `Client` over a real transport (see
 * `harness.ts`), so what is asserted is literally what a client receives.
 */

const { version } = createRequire(import.meta.url)('../package.json') as { version: string };

/** One entry per parameter: its JSON Schema as emitted, plus whether it is required. */
interface ParamSurface {
  required: boolean;
  schema: unknown;
}

interface ToolSurface {
  /**
   * The human-readable label a client shows beside the tool. Pinned like the
   * description because it is the same kind of fact — copy an agent's user
   * reads — and load-bearing beyond taste: the Claude connectors directory
   * refuses submission for a tool without one.
   */
  title: string;
  description: string;
  annotations: Record<string, boolean | string>;
  params: Record<string, ParamSurface>;
}

// =============================================================================
// THE HINTS EACH ROW YIELDS
// =============================================================================
//
// Literals, restated rather than computed through `annotate(TOOLS[name])`:
// that would make the assertion "the tool is annotated the way the registry
// annotates it", true by construction. These are the values a host acts on,
// planted per kind of row so the pinned catalogue below states each tool's
// hints outright. A read may run without a per-call prompt, a destructive
// tool always prompts, a remove may be retried, and only what touches public
// state is open-world.

/** `mutation: 'none'` on an account read: nothing public, nothing to retry. */
const READ = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
/**
 * `mutation: 'add'` reaching the public internet. No `idempotentHint`: a
 * deploy creates on every call, and `idempotencyKey` cannot rescue the claim
 * because the property is per-CALL (true only when a key is supplied) while
 * the hint is static per tool. A static hint cannot say "sometimes".
 */
const ADD_PUBLIC = { readOnlyHint: false, destructiveHint: false, openWorldHint: true };
/** `mutation: 'replace'`: not additive, so destructive; a repeat writes an activity row, so not idempotent. */
const REPLACE = { readOnlyHint: false, destructiveHint: true, openWorldHint: false };
const REPLACE_PUBLIC = { readOnlyHint: false, destructiveHint: true, openWorldHint: true };
/** `mutation: 'remove'`: the one kind whose repeat is measured to do nothing further. */
const REMOVE = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: true,
};

// =============================================================================
// PARAMETER SHORTHANDS
// =============================================================================

const str = (description: string, required = true): ParamSurface => ({
  required,
  schema: { type: 'string', description },
});

const strArray = (description: string, required = true): ParamSurface => ({
  required,
  schema: { type: 'array', items: { type: 'string' }, description },
});

/**
 * A bare number — no `minimum`, no `maximum`, and `number` rather than
 * `integer`. That emptiness is the assertion: every bound on `ttl` belongs to
 * `validateTtl`, which runs in the same process before the upload. A bound
 * appearing in this schema means the tool has grown a second validator.
 */
const num = (description: string, required = true): ParamSurface => ({
  required,
  schema: { type: 'number', description },
});

/** The `deployment` argument, described identically wherever it is accepted. */
const DEPLOYMENT_EXAMPLE = 'happy-cat-abc1234.shipstatic.com';

/**
 * The paging surface both list tools expose. Written once here because it is
 * ONE contract — but restated rather than imported from `src/server.ts`, since
 * importing would make the assertion "the tool is shaped the way the source
 * shapes it", which is true by construction.
 *
 * `maximum` is zod's safe-integer bound on `.int()` — NOT a product cap. The
 * API owns the real page-size limit and clamps server-side, which is exactly
 * why no such number is stated here; if one ever appears in this schema, one
 * fact has grown two owners.
 */
const PAGING_PARAMS: Record<string, ParamSurface> = {
  limit: {
    required: false,
    schema: {
      type: 'integer',
      description: 'Maximum number of items to return in one page. Omit for the server default.',
      minimum: 1,
      maximum: Number.MAX_SAFE_INTEGER,
    },
  },
  cursor: str(
    "Opaque position from the previous response's `cursor` field; omit for the first page.",
    false,
  ),
};

/** Every list tool's description ends with the paging contract, stated once. */
const PAGING_NOTE =
  " The response's `cursor` is null on the last page; pass it back as `cursor` to fetch the next.";

// =============================================================================
// THE PINNED CATALOGUE
// =============================================================================
//
// The two constraint-bearing descriptions are built from the SAME shared
// constants the source interpolates. That is deliberate and stronger than a
// literal: it pins the PROSE while proving the NUMBERS are still derived from
// `@shipstatic/types`. A stale hardcoded "3-25 chars" in `src/server.ts` fails
// here; a platform-wide constraint change does not.

const CATALOGUE: Record<string, ToolSurface> = {
  // ---------------------------------------------------------------- deployments
  deployments_upload: {
    title: 'Deploy Static Site',
    description:
      'Deploy a static site instantly: free, no account or API key required. Returns the live URL, file count, and size. Without SHIP_TOKEN, the response also includes a one-time claim URL, and the site expires in 3 days unless claimed. Pass `password` to make the site private.',
    annotations: ADD_PUBLIC,
    params: {
      path: str(
        'Absolute path to the build output directory to deploy (e.g. "/Users/me/project/dist")',
      ),
      labels: strArray(
        `Labels for organizing deployments (e.g. ["production", "v1.2"]). Lowercase, ${LABEL_CONSTRAINTS.MIN_LENGTH}-${LABEL_CONSTRAINTS.MAX_LENGTH} chars, allows . _ - separators. Up to ${LABEL_CONSTRAINTS.MAX_COUNT}.`,
        false,
      ),
      password: str(
        `Optional password to gate the deployment behind an unlock prompt (${PASSWORD_CONSTRAINTS.MIN_LENGTH}–${PASSWORD_CONSTRAINTS.MAX_LENGTH} characters; whitespace significant). Visitors must enter this password before viewing the site, including on any custom domains pointing at it.`,
        false,
      ),
      // The window is interpolated from the SDK constant for the same reason
      // the label lengths are: the prose is pinned, the number stays derived.
      idempotencyKey: str(
        `Makes this deploy replayable instead of repeatable. A deploy is not naturally idempotent: if a call times out you cannot tell "it never landed" from "it landed and the response was lost", and retrying creates a second deployment. Send the same key on the retry and the original deployment is replayed instead (within ${IDEMPOTENCY_KEY_CONSTRAINTS.WINDOW_SECONDS / 3600} hours). Key the ATTEMPT — a run id, a commit sha, a uuid minted before the first try — never one minted fresh on each retry, which would defeat the point.`,
        false,
      ),
      // No number appears in this string, and none should: the range lives in
      // `TTL_CONSTRAINTS` and is enforced by the SDK in-process, so the prose
      // teaches the two REFUSALS (anonymous, domain-linked) and leaves the
      // bounds to the validator that owns them.
      ttl: num(
        "Seconds until this deployment expires and the platform reclaims it; omit for one that never does. Only for authenticated deploys — an anonymous deployment already expires on the platform's schedule, and a requested ttl on one is refused. A deployment carrying a ttl cannot be linked to a custom domain: deploy without one if the site needs a domain.",
        false,
      ),
    },
  },
  deployments_list: {
    title: 'List Deployments',
    description: `List all deployments with their URLs, status, labels, and password protection state.${PAGING_NOTE}`,
    annotations: READ,
    params: PAGING_PARAMS,
  },
  deployments_get: {
    title: 'Get Deployment',
    description:
      'Get deployment details including URL, status, file count, size, labels, and password protection state.',
    annotations: READ,
    params: {
      deployment: str(
        `Deployment hostname (e.g. "${DEPLOYMENT_EXAMPLE}"). Returned by deployments_upload or deployments_list.`,
      ),
    },
  },
  deployments_set: {
    title: 'Update Deployment Labels',
    description: 'Update deployment labels. Replaces all existing labels.',
    annotations: REPLACE,
    params: {
      deployment: str(
        `Deployment hostname (e.g. "${DEPLOYMENT_EXAMPLE}"). Use deployments_list to find deployments.`,
      ),
      labels: strArray('Labels to set. Replaces all existing labels. Pass empty array to clear.'),
    },
  },
  deployments_delete: {
    title: 'Delete Deployment',
    description: 'Permanently deletes a deployment and its files.',
    annotations: REMOVE,
    params: {
      deployment: str(`Deployment hostname to delete (e.g. "${DEPLOYMENT_EXAMPLE}")`),
    },
  },

  // -------------------------------------------------------------------- domains
  domains_set: {
    title: 'Connect Custom Domain',
    description:
      'Create or update a custom domain. Can reserve a name (omit deployment), link it to a deployment, switch deployments, or update labels. domains_records then returns the DNS records to configure.',
    annotations: REPLACE_PUBLIC,
    params: {
      domain: str('Domain name (e.g. "www.example.com" or "blog.example.com")'),
      deployment: str(
        `Deployment to serve on this domain (e.g. "${DEPLOYMENT_EXAMPLE}"). Omit to reserve the domain without linking.`,
        false,
      ),
      labels: strArray('Labels for organizing domains (e.g. ["production"]).', false),
    },
  },
  domains_list: {
    title: 'List Domains',
    description: `List all domains with their URLs, linked deployment, and verification status.${PAGING_NOTE}`,
    annotations: READ,
    params: PAGING_PARAMS,
  },
  domains_get: {
    title: 'Get Domain',
    description:
      'Get domain details including URL, linked deployment, verification status, and labels.',
    annotations: READ,
    params: {
      domain: str('Domain name (e.g. "www.example.com"). Use domains_list to find names.'),
    },
  },
  domains_records: {
    title: 'Get DNS Records',
    description:
      "Returns the DNS records to configure at the domain's DNS provider. Call after domains_set.",
    annotations: READ,
    params: {
      domain: str('Domain name. Must be a domain previously created with domains_set.'),
    },
  },
  domains_dns: {
    title: 'Get DNS Provider',
    description:
      'Returns the DNS provider recorded for the domain, if known (e.g. Cloudflare, Namecheap): where its DNS records are configured.',
    annotations: READ,
    params: {
      domain: str(
        'Domain name (e.g. "www.example.com"). Must be a domain previously created with domains_set.',
      ),
    },
  },
  domains_share: {
    title: 'Share DNS Setup',
    description:
      "Returns a shareable DNS setup URL that needs no API key, for whoever manages the domain's DNS.",
    annotations: READ,
    params: {
      domain: str(
        'Domain name to generate a share link for. Must be a domain previously created with domains_set.',
      ),
    },
  },
  domains_validate: {
    title: 'Check Domain Availability',
    description:
      'Check if a domain name is valid and available before creating it. Returns the normalized form and availability.',
    annotations: READ,
    params: {
      domain: str(
        'Domain name to check (e.g. "www.example.com"). Call before domains_set to check availability.',
      ),
    },
  },
  domains_verify: {
    title: 'Verify Domain DNS',
    description:
      'Trigger DNS verification for a custom domain. Call after the user has configured DNS records from domains_records. Verification is asynchronous — the domain status updates once DNS propagates.',
    annotations: ADD_PUBLIC,
    params: {
      domain: str(
        'Domain name to verify DNS for. Must be a domain previously created with domains_set.',
      ),
    },
  },
  domains_delete: {
    title: 'Delete Domain',
    description: 'Permanently deletes a domain.',
    annotations: REMOVE,
    params: {
      domain: str('Domain name to delete (e.g. "www.example.com")'),
    },
  },

  // ------------------------------------------------------------------ debugging
  whoami: {
    title: 'Show Account',
    description: "Returns the account's email, name, plan, current usage and plan caps.",
    annotations: READ,
    params: {},
  },
};

// The observed annotations carry the tool's title too: `vocabulary.titled`
// projects the top-level title into `annotations.title`, the 2025-03-26 slot
// the Claude connectors portal reads (measured 2026-08-31: it flagged all
// fifteen tools "Missing annotations: title" while rendering the top-level
// titles as headings). The expectation derives that slot from each entry's
// OWN pinned title, so it stays a planted value rather than the subject's,
// and the deep-equal below is what holds the two slots identical per tool.
for (const surface of Object.values(CATALOGUE)) {
  surface.annotations = { ...surface.annotations, title: surface.title };
}

// =============================================================================

describe('tool catalogue', () => {
  let harness: Harness;
  let listed: Awaited<ReturnType<Harness['client']['listTools']>>['tools'];

  beforeAll(async () => {
    harness = await connect();
    listed = (await harness.client.listTools()).tools;
  });

  afterAll(() => harness.close());

  it('exposes exactly the 15 documented tools', () => {
    expect(listed.map((t) => t.name).sort()).toEqual(Object.keys(CATALOGUE).sort());
  });

  it('registers exactly the names it publishes — the account list, plus the one tool each transport authors', () => {
    // The one place this file imports from `src/` rather than restating, and
    // it is not tautological for the same reason the descriptions would be:
    // `ACCOUNT_TOOL_NAMES` is a SEPARATE declaration from the fourteen
    // `registerTool` calls, exported so the hosted transport can state its
    // expected catalogue without counting to fifteen a second time. A
    // registration added without its name, a name without its registration,
    // and a typo in either all land here — through a real `tools/list`, so
    // what is compared is what a client receives.
    expect(listed.map((t) => t.name).sort()).toEqual(
      [UPLOAD_TOOL_NAME, ...ACCOUNT_TOOL_NAMES].sort(),
    );
  });

  it('every tool carries a title in BOTH wire slots — the connectors directory reads each', () => {
    // The pinned surface below already holds each title byte-for-byte. This
    // says the thing the pin cannot: that the rule applies to tools nobody has
    // written yet. A new tool added without a title, or registered without the
    // `titled` projection, fails HERE with the reason in the test name rather
    // than in a portal review weeks later. Both slots are load-bearing: the
    // top-level title is the 2025-06-18 field hosts render, and
    // `annotations.title` is the older slot the portal's Tools checker keys
    // on (it flagged all fifteen tools without it, 2026-08-31).
    const untitled = listed.filter((tool) => !tool.title?.trim()).map((tool) => tool.name);
    const unprojected = listed
      .filter((tool) => tool.annotations?.title !== tool.title)
      .map((tool) => tool.name);

    expect(untitled).toEqual([]);
    expect(unprojected).toEqual([]);
  });

  it('every tool matches its pinned surface — name, title, description, schema, annotations', () => {
    // One assertion over the whole catalogue rather than 15 separate ones: a
    // rename, a dropped tool, and a reworded description all surface in the
    // same diff, and no tool can be added without appearing in it.
    // The projection is deliberately NOT typed as `ToolSurface`: it is the
    // OBSERVED value, and a missing description or a dropped annotations block
    // is exactly the kind of drift this assertion exists to surface. Typing it
    // as conformant would hide that behind a compile error in the wrong place.
    const actual = Object.fromEntries(
      listed.map((tool) => {
        const schema = tool.inputSchema as {
          properties?: Record<string, unknown>;
          required?: string[];
        };
        const required = new Set(schema.required ?? []);
        return [
          tool.name,
          {
            title: tool.title,
            description: tool.description,
            annotations: tool.annotations,
            params: Object.fromEntries(
              Object.entries(schema.properties ?? {}).map(([name, propSchema]) => [
                name,
                { required: required.has(name), schema: propSchema },
              ]),
            ),
          },
        ];
      }),
    );

    expect(actual).toEqual(CATALOGUE);
  });

  it("every tool publishes an outputSchema, and it is the constitution's", () => {
    // Planted: which schema each tool answers with. Compared through the
    // JSON Schema both sides publish, on the properties an agent reads, so a
    // tool that stopped importing and started restating fails here.
    const published = (schema: z.ZodType) =>
      z.toJSONSchema(schema) as { properties: Record<string, unknown>; required?: string[] };
    const expected: Record<string, z.ZodType> = {
      deployments_upload: S.DeploymentCreateResponseSchema,
      deployments_list: S.DeploymentListResponseSchema,
      deployments_get: S.DeploymentSchema,
      deployments_set: S.DeploymentSchema,
      deployments_delete: S.DeploymentDeleteResponseSchema,
      domains_set: S.DomainSetResultSchema,
      domains_list: S.DomainListResponseSchema,
      domains_get: S.DomainSchema,
      domains_records: S.DomainRecordsResponseSchema,
      domains_dns: S.DomainDnsResponseSchema,
      domains_share: S.DomainShareResponseSchema,
      domains_validate: S.DomainValidateResponseSchema,
      domains_verify: S.DomainVerifyResponseSchema,
      domains_delete: S.DomainDeleteResponseSchema,
      whoami: S.AccountSchema.pick({
        email: true,
        name: true,
        plan: true,
        usage: true,
        caps: true,
      }),
    };
    expect(Object.keys(expected).sort()).toEqual(listed.map((t) => t.name).sort());
    for (const tool of listed) {
      const observed = tool.outputSchema as {
        properties?: Record<string, unknown>;
        required?: string[];
      };
      const want = published(expected[tool.name]!);
      expect(observed?.properties, tool.name).toEqual(want.properties);
      expect(observed?.required ?? [], tool.name).toEqual(want.required ?? []);
    }
  });

  it('every parameter carries a description — an undescribed parameter is unusable to an agent', () => {
    const undescribed = listed.flatMap((tool) => {
      const properties = (
        tool.inputSchema as { properties?: Record<string, { description?: string }> }
      ).properties;
      return Object.entries(properties ?? {})
        .filter(([, schema]) => !schema.description?.trim())
        .map(([name]) => `${tool.name}.${name}`);
    });

    expect(undescribed).toEqual([]);
  });

  it('advertises the package version, so a client reports the server it is actually running', () => {
    expect(harness.client.getServerVersion()).toEqual({ name: 'shipstatic', version });
  });
});

describe('server instructions', () => {
  let harness: Harness;
  let instructions: string;

  beforeAll(async () => {
    harness = await connect();
    instructions = harness.client.getInstructions() ?? '';
  });

  afterAll(() => harness.close());

  // Instructions reach the agent once, at `initialize`, and shape every
  // decision it makes afterwards. Each assertion below is a product promise,
  // not a phrasing preference — which is why they are separate named tests
  // rather than one byte-comparison: the wording may improve, the promise may
  // not silently disappear.

  it('leads with the no-account promise', () => {
    expect(instructions).toContain('Free, no account required.');
  });

  it('tells the agent to relay the claim URL — the anonymous deploy is worthless to the user otherwise', () => {
    expect(instructions).toContain('claim URL');
    expect(instructions).toMatch(/always show the deployment URL and the claim URL to the user/);
  });

  it('states the 3-day expiry for keyless deployments', () => {
    expect(instructions).toMatch(/expire in 3 days/);
  });

  it('names the credential that upgrades the session', () => {
    expect(instructions).toContain('SHIP_TOKEN');
  });

  it('resolves the two names one credential wears — the config asks for a token, the console mints an API key', () => {
    // An agent guiding a person through setup is the one who has to bridge the
    // vocabulary: the user returns from the console holding an "API key" and
    // the config slot is called SHIP_TOKEN. Unless the instructions say they
    // are the same value, the agent cannot either — and the mint URL beside it
    // is what turns "you need a token" into a step the user can actually take.
    expect(instructions).toContain("its value is the user's API key");
    expect(instructions).toContain(MY_API_KEY_URL);
  });

  it('offers the authenticated caller a deployment that expires on purpose, in seconds', () => {
    // The UNIT is the load-bearing half. "Never expire" is the account default,
    // so an agent only learns of the choice here — and a `ttl` read as minutes
    // or days is a 60× or 86400× error the platform cannot detect, since every
    // wrong value is a well-formed one.
    expect(instructions).toContain('`ttl` (seconds)');
  });

  it('states the apex-domain exclusion — the platform hosts subdomains only', () => {
    expect(instructions).toMatch(/Subdomains only — not apex domains/);
  });

  it('spells out the custom-domain workflow in execution order', () => {
    expect(instructions).toContain(
      'domains_validate → domains_set → domains_records (show DNS records to user) → user configures DNS → domains_verify',
    );
  });
});

describe('tool doctrine', () => {
  // The rules the catalogue carries beyond its bytes. `CATALOGUE` already
  // pins every description; these record WHY a property is load-bearing, so
  // a rewrite that keeps the pin green but drops the rule is still caught.

  /**
   * The phrases that turn a description into an instruction. Both listing
   * reviews reject a description that tells the model how to behave;
   * confirmation is `destructiveHint`'s job and "show the user" belongs to
   * `instructions`. The last two phrases are what a tail like "…and show the
   * DNS records to the user" slipped past when only the first three were
   * looked for.
   */
  const INSTRUCTS = /you must|always show|share the link|to the user|with the user/i;

  it('no description instructs the model: a description describes the tool', async () => {
    const harness = await connect();
    try {
      const { tools } = await harness.client.listTools();
      const instructing = tools
        .filter((tool) => INSTRUCTS.test(tool.description ?? ''))
        .map((tool) => tool.name);
      expect(tools.length).toBeGreaterThan(0);
      expect(instructing).toEqual([]);
    } finally {
      await harness.close();
    }
  });

  it('would catch an instructing sentence, so the sweep above cannot pass vacuously', () => {
    expect('Call after domains_set and show the records to the user.').toMatch(INSTRUCTS);
    expect('You MUST confirm before calling this tool.').toMatch(INSTRUCTS);
    // Invocation guidance about the tool's FUNCTION is permitted and stays.
    expect('Call after domains_set.').not.toMatch(INSTRUCTS);
  });

  it('both removes are destructive AND idempotent; nothing else promises a free retry', () => {
    // The two deletes are fenced in the API as repeat-safe (a repeat neither
    // flips state nor writes an audit row). A replace writes an activity row
    // per call, an add creates per call, and a read has nothing to promise.
    const idempotent = Object.entries(CATALOGUE)
      .filter(([, tool]) => tool.annotations.idempotentHint === true)
      .map(([name]) => name);
    expect(idempotent).toEqual(['deployments_delete', 'domains_delete']);
    for (const name of idempotent) {
      expect(CATALOGUE[name].annotations.destructiveHint, name).toBe(true);
    }
  });

  it('only what touches public internet state is open-world', () => {
    // Anthropic reads the hint as the spec defines it (a closed domain of
    // interaction), OpenAI as "can change public state". An account read
    // reaches this platform and nothing beyond it; a deploy, a domain link,
    // a verification and both deletes change what the public internet
    // serves.
    const open = Object.entries(CATALOGUE)
      .filter(([, tool]) => tool.annotations.openWorldHint === true)
      .map(([name]) => name)
      .sort();
    expect(open).toEqual(
      [
        'deployments_upload',
        'deployments_delete',
        'domains_set',
        'domains_verify',
        'domains_delete',
      ].sort(),
    );
  });

  it('deployments_set warns that labels are replaced, not merged', () => {
    expect(CATALOGUE.deployments_set.description).toContain('Replaces all existing labels');
    expect(CATALOGUE.deployments_set.params.labels.schema).toMatchObject({
      description: expect.stringContaining('Pass empty array to clear'),
    });
  });

  it('deployments_upload states the no-account promise and the claim URL, and instructs nobody', () => {
    const { description } = CATALOGUE.deployments_upload;
    expect(description).toContain('no account or API key required');
    expect(description).toContain('claim URL');
    expect(description).not.toMatch(INSTRUCTS);
  });
});

describe('input validation', () => {
  // These pass only because the suite goes through the protocol. The previous
  // tests invoked handler callbacks directly, so zod never ran and every
  // assertion below would have been vacuous.

  let harness: Harness;

  beforeAll(async () => {
    harness = await connect();
  });

  afterAll(() => harness.close());

  it('rejects a wrong-typed argument before the SDK is reached', async () => {
    const result = await harness.client.callTool({
      name: 'deployments_upload',
      arguments: { path: 123 },
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Invalid arguments for tool deployments_upload');
    expect(harness.ship.deployments.upload).not.toHaveBeenCalled();
  });

  it('rejects a missing required argument', async () => {
    const result = await harness.client.callTool({
      name: 'deployments_get',
      arguments: {},
    });

    expect(result.isError).toBe(true);
    expect(harness.ship.deployments.get).not.toHaveBeenCalled();
  });

  it('rejects a non-string element inside an array argument', async () => {
    const result = await harness.client.callTool({
      name: 'deployments_set',
      arguments: { deployment: 'brave-otter-a1b2c3d.shipstatic.com', labels: ['ok', 7] },
    });

    expect(result.isError).toBe(true);
    expect(harness.ship.deployments.set).not.toHaveBeenCalled();
  });

  it('reports an unknown tool rather than failing silently', async () => {
    // The name must be one no tool can ever take. This read `deployments_delete`
    // until the platform standardised its verb on `delete` — at which point the
    // "obviously nonexistent" name became a real, registered tool and the test
    // asserted a validation error instead of a lookup failure.
    const result = await harness.client.callTool({ name: 'deployments_nonesuch', arguments: {} });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Tool deployments_nonesuch not found');
  });
});
