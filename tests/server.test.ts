import { createRequire } from 'node:module';
import { LABEL_CONSTRAINTS, PASSWORD_CONSTRAINTS } from '@shipstatic/ship';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
  description: string;
  annotations: Record<string, boolean>;
  params: Record<string, ParamSurface>;
}

// =============================================================================
// ANNOTATION CLASSES
// =============================================================================
//
// Restated here rather than imported from `src/server.ts`: importing the
// constants would make the assertion "the tool is annotated the way
// src/server.ts annotates it", which is true by construction. These are the
// four contracts a client relies on — an agent decides whether it may retry
// (idempotent), whether it may call speculatively (readOnly), and whether it
// must confirm first (destructive).

const OPEN_WORLD = { openWorldHint: true };
const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, ...OPEN_WORLD };
/** Deploys are NOT idempotent: every call creates a new deployment. */
const CREATE = { readOnlyHint: false, destructiveHint: false, ...OPEN_WORLD };
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, ...OPEN_WORLD };
const DESTRUCTIVE = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  ...OPEN_WORLD,
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

/** The `deployment` argument, described identically wherever it is accepted. */
const DEPLOYMENT_EXAMPLE = 'happy-cat-abc1234.shipstatic.com';

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
    description:
      'Deploy a static site instantly — free, no account or API key required. Returns the live URL, file count, and size. Without SHIP_TOKEN, the response includes a claim URL (site expires in 3 days) — always show both the deployment URL and claim URL to the user. To make the site private, pass `password`; always show the password to the user if you set one.',
    annotations: CREATE,
    params: {
      path: str(
        'Absolute path to the build output directory to deploy (e.g. "/Users/me/project/dist")',
      ),
      labels: strArray(
        `Labels for organizing deployments (e.g. ["production", "v1.2"]). Lowercase, ${LABEL_CONSTRAINTS.MIN_LENGTH}-${LABEL_CONSTRAINTS.MAX_LENGTH} chars, allows . _ - separators.`,
        false,
      ),
      password: str(
        `Optional password to gate the deployment behind an unlock prompt (${PASSWORD_CONSTRAINTS.MIN_LENGTH}–${PASSWORD_CONSTRAINTS.MAX_LENGTH} characters; whitespace significant). Visitors must enter this password before viewing the site, including on any custom domains pointing at it.`,
        false,
      ),
    },
  },
  deployments_list: {
    description:
      'List all deployments with their URLs, status, labels, and password protection state.',
    annotations: READ,
    params: {},
  },
  deployments_get: {
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
    description: 'Update deployment labels. Replaces all existing labels.',
    annotations: WRITE,
    params: {
      deployment: str(
        `Deployment hostname (e.g. "${DEPLOYMENT_EXAMPLE}"). Use deployments_list to find deployments.`,
      ),
      labels: strArray('Labels to set. Replaces all existing labels. Pass empty array to clear.'),
    },
  },
  deployments_remove: {
    description:
      'Permanently delete a deployment and its files. You MUST confirm with the user before calling this tool, referencing the deployment.',
    annotations: DESTRUCTIVE,
    params: {
      deployment: str(`Deployment hostname to delete (e.g. "${DEPLOYMENT_EXAMPLE}")`),
    },
  },

  // -------------------------------------------------------------------- domains
  domains_set: {
    description:
      'Create or update a custom domain. Can reserve a name (omit deployment), link it to a deployment, switch deployments, or update labels. After creating, call domains_records and show the DNS records to the user.',
    annotations: WRITE,
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
    description: 'List all domains with their URLs, linked deployment, and verification status.',
    annotations: READ,
    params: {},
  },
  domains_get: {
    description:
      'Get domain details including URL, linked deployment, verification status, and labels.',
    annotations: READ,
    params: {
      domain: str('Domain name (e.g. "www.example.com"). Use domains_list to find names.'),
    },
  },
  domains_records: {
    description:
      'Get the DNS records the user needs to configure at their DNS provider. Call after domains_set. You MUST show the returned records to the user.',
    annotations: READ,
    params: {
      domain: str('Domain name. Must be a domain previously created with domains_set.'),
    },
  },
  domains_dns: {
    description:
      'Look up the DNS provider for a domain (e.g. Cloudflare, Namecheap). Helps the user know where to configure their DNS records.',
    annotations: READ,
    params: {
      domain: str('Domain name to look up DNS provider for (e.g. "www.example.com")'),
    },
  },
  domains_share: {
    description:
      'Get a shareable DNS setup hash for a domain. The hash can be shared with the user so they can view the required DNS records without needing an API key.',
    annotations: READ,
    params: {
      domain: str(
        'Domain name to generate a share link for. Must be a domain previously created with domains_set.',
      ),
    },
  },
  domains_validate: {
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
    description:
      'Trigger DNS verification for a custom domain. Call after the user has configured DNS records from domains_records. Verification is asynchronous — the domain status updates once DNS propagates.',
    annotations: WRITE,
    params: {
      domain: str(
        'Domain name to verify DNS for. Must be a domain previously created with domains_set.',
      ),
    },
  },
  domains_remove: {
    description:
      'Permanently delete a domain. You MUST confirm with the user before calling this tool, referencing the domain name.',
    annotations: DESTRUCTIVE,
    params: {
      domain: str('Domain name to delete (e.g. "www.example.com")'),
    },
  },

  // ------------------------------------------------------------------ debugging
  whoami: {
    description: 'Show authenticated account details including email, plan, and usage.',
    annotations: READ,
    params: {},
  },
};

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

  it('every tool matches its pinned surface — name, description, schema, annotations', () => {
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
  // The phrases in tool descriptions that carry a rule rather than a
  // description. `CATALOGUE` already pins them byte-for-byte; these exist so
  // that WHY each phrase is load-bearing is recorded next to it, and so a
  // rewrite that keeps the sentence but drops the rule is still caught.

  it('both destructive tools demand user confirmation, naming the resource', () => {
    for (const name of ['deployments_remove', 'domains_remove'] as const) {
      expect(CATALOGUE[name].description, name).toContain('You MUST confirm with the user');
      expect(CATALOGUE[name].annotations.destructiveHint, name).toBe(true);
    }
  });

  it('domains_records tells the agent it MUST surface the records', () => {
    // A silently-swallowed record set is a domain that never verifies.
    expect(CATALOGUE.domains_records.description).toContain(
      'You MUST show the returned records to the user',
    );
  });

  it('deployments_upload promises the claim URL and the password read-back', () => {
    const { description } = CATALOGUE.deployments_upload;
    expect(description).toContain('no account or API key required');
    expect(description).toContain('always show both the deployment URL and claim URL to the user');
    expect(description).toContain('always show the password to the user if you set one');
  });

  it('deployments_set warns that labels are replaced, not merged', () => {
    expect(CATALOGUE.deployments_set.description).toContain('Replaces all existing labels');
    expect(CATALOGUE.deployments_set.params.labels.schema).toMatchObject({
      description: expect.stringContaining('Pass empty array to clear'),
    });
  });

  it('deploys are the only non-idempotent tool — every other call is safe to retry', () => {
    const nonIdempotent = Object.entries(CATALOGUE)
      .filter(([, tool]) => tool.annotations.idempotentHint !== true)
      .map(([name]) => name);

    expect(nonIdempotent).toEqual(['deployments_upload']);
  });

  it('every tool is open-world — all of them reach a remote API', () => {
    const closed = Object.entries(CATALOGUE)
      .filter(([, tool]) => tool.annotations.openWorldHint !== true)
      .map(([name]) => name);

    expect(closed).toEqual([]);
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
    const result = await harness.client.callTool({ name: 'deployments_delete', arguments: {} });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Tool deployments_delete not found');
  });
});
