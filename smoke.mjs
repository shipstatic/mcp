#!/usr/bin/env node
/**
 * Live gate for the PUBLISHED package — the one thing the suite cannot be.
 *
 * `tests/` drives the real server through the real MCP protocol, but the ship
 * SDK there is a typed fake derived from the SDK's own interfaces. That fake
 * catches signature drift at compile time and cannot, even in principle, catch
 * the API answering differently than the SDK's types promise. It has already
 * cost us: `@shipstatic/mcp@0.6.0` pinned a ship that mints an agent token via
 * an endpoint the platform later deleted, so anonymous deploy — this server's
 * headline feature — 404'd while the suite stayed green through every release.
 *
 * So this runs the artifact the registry serves, over `npx`, against a real
 * API, and invokes all fifteen tools. A local `node dist/bin.js` would prove
 * the checkout works; what ships is the tarball with its own resolved
 * dependency tree, and that resolution is exactly where 0.6.0 broke.
 *
 *   node smoke.mjs                              # production API, this repo's version
 *   SHIP_API_URL=… node smoke.mjs               # another environment
 *   node smoke.mjs --version=1.0.0-beta.4       # a specific published version
 *   node smoke.mjs --api=… --version=…          # both, explicitly
 *
 * `SHIP_TOKEN` unlocks the authenticated half. Without it the anonymous half
 * still runs and the rest is reported as NOT VERIFIED — an absent credential
 * is "not proven", never "failed", and only a contradicted assertion exits
 * non-zero. Same doctrine as `cloudflare/api/smoke.mjs`.
 *
 * NOT wired into CI: it needs a live API and a credential, and the whole point
 * is that it tests what a hermetic suite cannot. Manual gate, run after a
 * publish. It is excluded from the tarball by `package.json` `files`.
 *
 * This repo is PUBLIC (root CLAUDE.md, "Environment-Aware URLs"): no
 * non-production hostname appears below. The default is the SDK's own
 * production constant and every other environment arrives from the outside.
 */

import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { DEFAULT_API } from '@shipstatic/ship';

// ---------------------------------------------------------------- arguments

const FLAGS = new Map(
  process.argv.slice(2).map((arg) => {
    const match = /^--([a-z]+)=(.+)$/.exec(arg);
    if (!match) {
      // A bare positional is refused rather than guessed at. The sibling
      // script (`cloudflare/mcp/smoke.mjs`) takes a URL as argv[2] and this
      // one takes a version, so muscle memory from one would silently test
      // the wrong thing in the other.
      console.error(
        `Unrecognized argument: ${arg}\nUsage: node smoke.mjs [--api=URL] [--version=V]`,
      );
      process.exit(2);
    }
    return [match[1], match[2]];
  }),
);

/**
 * The version under test is a PARAMETER defaulting to this repo's own
 * manifest, never a literal. Run straight after a publish, that default makes
 * the run assert "what I am is what the registry serves" — the exact class of
 * failure the 0.6.0 story shows nothing else can catch. The exact pin in the
 * npx specifier also defeats a stale npx cache.
 */
const { version: OWN_VERSION, bin } = createRequire(import.meta.url)('./package.json');
const VERSION = FLAGS.get('version') ?? OWN_VERSION;
/** The executable npx must run — read from the manifest, never spelled out. */
const [BIN_NAME] = Object.keys(bin);
const API_URL = FLAGS.get('api') ?? process.env.SHIP_API_URL ?? DEFAULT_API;

/** Pagination and `idempotencyKey` arrived in this release; earlier ones skip that block. */
const HAS_PAGING = compareVersions(VERSION, '1.0.0-beta.1') >= 0;

/** `ttl` on `deployments_upload` arrived in this one; earlier ones skip its block. */
const HAS_TTL = compareVersions(VERSION, '1.2.0-beta.1') >= 0;

// ------------------------------------------------------------------ output

let failed = 0;
const pass = (label) => console.log(`  ✓ ${label}`);
const fail = (label, detail) => {
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  failed += 1;
};
const skip = (what, why) => console.log(`  – ${what} SKIPPED (${why})`);
/** What a skipped block leaves unproven — never let that go unsaid. */
const unverified = (what) => console.log(`    ${what} NOT verified by this run`);
const note = (text) => console.log(`  · ${text}`);
const section = (title) => console.log(`\n${title}`);

/** `expected === actual`, reported with both when it is not. */
const check = (label, ok, detail) => (ok ? pass(label) : fail(label, detail));

// ------------------------------------------------------------- the client

/**
 * The stdio transport is newline-delimited JSON-RPC on stdin/stdout — no
 * framing beyond the newline — so a child process is drivable directly and no
 * MCP client library is needed. The server writes its startup banner to
 * STDERR by design; keeping the streams apart is load-bearing, since a merged
 * read corrupts the first JSON-RPC parse.
 */
class StdioClient {
  constructor(env, cwd) {
    this.id = 0;
    this.pending = new Map();
    this.stderr = '';
    // `--package=… -- <bin>` rather than a bare specifier, and a cwd OUTSIDE
    // this repo. Both defend the script's whole thesis. Run from the package's
    // own directory, npx resolves against the local tree, finds no installed
    // `shipstatic-bin` shim and dies with "command not found" — and a checkout
    // that DID have one would be tested in place of the registry's copy, which
    // is the one thing this file exists to never do. The bin name is read from
    // the manifest for the same reason the version is.
    this.proc = spawn('npx', ['-y', `--package=@shipstatic/mcp@${VERSION}`, '--', BIN_NAME], {
      env,
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    createInterface({ input: this.proc.stdout }).on('line', (line) => {
      if (!line.trim()) return;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        return;
      }
      this.settle(message.id, (entry) => entry.resolve(message));
    });
    this.proc.stderr.on('data', (chunk) => {
      this.stderr += String(chunk);
    });
    // Registered before anything can fire, so `close()` never awaits an event
    // that already happened — an exited child would otherwise hang the run
    // with an empty event loop and no message but "unsettled top-level await".
    this.exited = new Promise((resolve) => this.proc.once('exit', resolve));
    this.proc.on('error', (error) => this.abort(`could not start the server: ${error.message}`));
    this.proc.on('exit', (code, signal) => {
      // A child that dies mid-call must fail loudly and NOW. Waiting out the
      // 120s timeout would report the symptom (slow) instead of the cause.
      if (this.pending.size > 0) {
        this.abort(`server exited early (code ${code}, signal ${signal})`);
      }
    });
  }

  /** Resolve or reject one in-flight call, clearing its timer exactly once. */
  settle(id, apply) {
    const entry = this.pending.get(id);
    if (!entry) return;
    this.pending.delete(id);
    clearTimeout(entry.timer);
    apply(entry);
  }

  /** Fail every in-flight call with the same cause, stderr attached. */
  abort(reason) {
    const detail = this.stderr.trim();
    for (const id of [...this.pending.keys()]) {
      this.settle(id, (entry) =>
        entry.reject(new Error(`${reason}${detail ? ` — stderr: ${detail}` : ''}`)),
      );
    }
  }

  send(method, params) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      // Generous by necessity: the first npx call may download the package,
      // and an upload hashes and transfers files.
      const timer = setTimeout(() => this.abort(`timeout after 120s: ${method}`), 120_000);
      this.pending.set(id, { resolve, reject, timer });
      this.proc.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  }

  /** A notification has no id and is never answered. */
  notify(method) {
    this.proc.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method })}\n`);
  }

  async handshake() {
    const response = await this.send('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'mcp-smoke', version: '1' },
    });
    this.notify('notifications/initialized');
    return response.result;
  }

  /** A tool result is TEXT. Parse it when it is JSON; keep the prose either way. */
  async call(name, args) {
    const response = await this.send('tools/call', { name, arguments: args ?? {} });
    if (response.error) return { isError: true, text: JSON.stringify(response.error) };
    const text = response.result?.content?.[0]?.text ?? '';
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      /* prose, not JSON — the error arms answer this way */
    }
    return { isError: response.result?.isError === true, text, data };
  }

  /** ALWAYS call, pass or fail — an unkilled npx child outlives the run. */
  async close() {
    if (this.proc.exitCode === null && this.proc.signalCode === null) {
      this.proc.stdin.end();
      this.proc.kill();
    }
    await this.exited;
  }
}

/**
 * The credential is read once, at construction, so anonymous and authenticated
 * are two PROCESSES rather than two calls — which is the point: it proves the
 * anonymous path is genuinely credential-free instead of quietly inheriting an
 * ambient token.
 *
 * Every `SHIP_*` variable is scrubbed and only the two this run means to set
 * are put back. An operator's exported credential would otherwise authenticate
 * the "no token configured" half, and an exported `SHIP_VIA` would falsify the
 * origin-tracking assertion. Same scrub as `tests/setup.ts`, same reason.
 */
function childEnv(token) {
  const clean = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('SHIP_')),
  );
  return { ...clean, SHIP_API_URL: API_URL, SHIP_TOKEN: token };
}

// ------------------------------------------------------------------ helpers

/** Semver-ish comparison, prerelease-aware enough for `1.0.0-beta.N`. */
function compareVersions(a, b) {
  const parse = (v) => {
    const [core, pre] = v.split('-');
    return [...core.split('.').map(Number), ...(pre ? pre.split('.') : ['~'])];
  };
  const [left, right] = [parse(a), parse(b)];
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const l = left[i] ?? 0;
    const r = right[i] ?? 0;
    if (l === r) continue;
    // A missing prerelease sorts ABOVE any prerelease: 1.0.0 > 1.0.0-beta.1.
    if (typeof l !== typeof r) return typeof l === 'string' ? 1 : -1;
    return l > r ? 1 : -1;
  }
  return 0;
}

const isUrl = (value) => typeof value === 'string' && /^https?:\/\//.test(value);

/**
 * A refusal is not a failure. The platform can legitimately decline a whole
 * block — no credential, a credential for another environment, a plan without
 * custom domains — and the honest verdict then is "not verified", exit 0.
 */
const REFUSAL = /not authorized|authentication|forbidden|not permitted|plan|billing|upgrade/i;
const refusalReason = (result) =>
  result.isError ? result.text.split('\n')[0].slice(0, 140) : null;

// --------------------------------------------------------------- the run

console.log(`Smoke test: @shipstatic/mcp@${VERSION} → ${API_URL}`);

const scratch = await mkdtemp(join(tmpdir(), 'ship-mcp-smoke-'));
const marker = `smoke-${Math.random().toString(36).slice(2)}`;
await writeFile(join(scratch, 'index.html'), `<!doctype html><title>${marker}</title>${marker}`);

// A domain that is genuinely external and unique per run. Platform subdomains
// have no DNS surface (`domains_records` refuses them) and apex domains are
// not hosted at all, so `example.com` subdomains are the only correct choice.
const testDomain = `${marker}.example.com`;

try {
  await anonymousHalf();
  await authenticatedHalf();
} finally {
  await rm(scratch, { recursive: true, force: true });
}

console.log();
if (failed > 0) {
  console.log(`✗ ${failed} check(s) failed`);
  process.exit(1);
}
console.log('✓ all checks passed');

// ============================================================ anonymous half

async function anonymousHalf() {
  section('Anonymous (no credential)');
  // An empty string, explicitly. The SDK coerces it to `undefined`, and
  // setting it is what defends against the operator's own shell credential.
  const client = new StdioClient(childEnv(''), scratch);
  try {
    const info = await client.handshake();

    check(
      `initialize → shipstatic v${VERSION}`,
      info?.serverInfo?.name === 'shipstatic' && info?.serverInfo?.version === VERSION,
      // The stale-npx-cache detector: compared against the parameter, never a
      // literal, so this file survives every release without an edit.
      `got ${JSON.stringify(info?.serverInfo)}`,
    );
    check(
      'instructions name the credential that upgrades the session',
      (info?.instructions ?? '').includes('SHIP_TOKEN'),
    );

    const { tools } = (await client.send('tools/list', {})).result ?? {};
    const names = (tools ?? []).map((t) => t.name);
    check('tools/list → 15 tools', names.length === 15, `got ${names.length}: ${names.join(',')}`);
    check(
      'the delete tools are named delete',
      names.includes('deployments_delete') && names.includes('domains_delete'),
      names.join(','),
    );
    check(
      'no *_remove survives the 1.x rename',
      names.every((n) => !n.endsWith('_remove')),
      names.filter((n) => n.endsWith('_remove')).join(','),
    );

    // Catalogue facts need no credential, so they are proven here even when
    // the authenticated half is skipped.
    const byName = Object.fromEntries((tools ?? []).map((t) => [t.name, t]));
    const props = (name) => Object.keys(byName[name]?.inputSchema?.properties ?? {});

    if (HAS_PAGING) {
      check(
        'both list tools accept limit + cursor',
        ['deployments_list', 'domains_list'].every(
          (n) => props(n).includes('limit') && props(n).includes('cursor'),
        ),
        `deployments_list=${props('deployments_list')} domains_list=${props('domains_list')}`,
      );
      check(
        'deployments_upload accepts idempotencyKey',
        props('deployments_upload').includes('idempotencyKey'),
        props('deployments_upload').join(','),
      );
    } else {
      skip('pagination + idempotency schema checks', `${VERSION} predates 1.0.0-beta.1`);
    }

    if (HAS_TTL) {
      check(
        'deployments_upload accepts ttl',
        props('deployments_upload').includes('ttl'),
        props('deployments_upload').join(','),
      );
    } else {
      skip('the ttl schema check', `${VERSION} predates 1.2.0-beta.1`);
    }

    const upload = await client.call('deployments_upload', { path: scratch });
    if (upload.isError) {
      // The headline feature. A refusal here is a failure, not a skip: no
      // credential is required, so nothing can legitimately decline it.
      fail('anonymous deployments_upload', upload.text.slice(0, 200));
      return;
    }
    const deployment = upload.data ?? {};
    check(
      'anonymous deployments_upload → deployment + url',
      typeof deployment.deployment === 'string' && isUrl(deployment.url),
      JSON.stringify(deployment).slice(0, 200),
    );
    check('  carries a claim URL', isUrl(deployment.claim), String(deployment.claim));
    check(
      '  expires is present and non-null',
      deployment.expires !== null && deployment.expires !== undefined,
      String(deployment.expires),
    );

    const served = await fetch(deployment.url);
    const body = await served.text();
    check(
      '  the URL serves the uploaded content',
      served.status === 200 && body.includes(marker),
      `status=${served.status}`,
    );
    // Left to expire on its own: deleting it would need the claim flow.
    note(`anonymous deployment left to expire: ${deployment.url}`);
  } finally {
    await client.close();
  }
}

// ======================================================== authenticated half

async function authenticatedHalf() {
  section('Authenticated');
  const token = process.env.SHIP_TOKEN;
  if (!token) {
    skip('authenticated checks', 'no SHIP_TOKEN set');
    unverified('the account-tied 14 tools, the acknowledgement law and the list shapes are');
    return;
  }

  const client = new StdioClient(childEnv(token), scratch);
  try {
    await client.handshake();

    const who = await client.call('whoami');
    if (who.isError) {
      // A token refused by `whoami` is the wrong-environment case: the
      // credential is fine, it simply does not belong to this API.
      skip('authenticated checks', `SHIP_TOKEN refused (${refusalReason(who)})`);
      unverified('the account-tied 14 tools, the acknowledgement law and the list shapes are');
      return;
    }
    check(
      'whoami → an account with an email',
      typeof who.data?.email === 'string',
      who.text.slice(0, 140),
    );

    const owned = await deploymentBlock(client);
    if (HAS_PAGING) await paginationBlock(client);
    else skip('pagination + idempotency replay', `${VERSION} predates 1.0.0-beta.1`);
    if (HAS_TTL) await ttlBlock(client);
    else skip('the owned-and-expiring deploy', `${VERSION} predates 1.2.0-beta.1`);
    await domainBlock(client);
    await deleteBlock(client, owned);
    await errorRelayBlock(client);
  } finally {
    await client.close();
  }
}

/** Upload owned, then read it back and mutate it — the item-reads must agree. */
async function deploymentBlock(client) {
  const upload = await client.call('deployments_upload', { path: scratch, labels: ['smoke'] });
  if (upload.isError) {
    fail('authenticated deployments_upload', upload.text.slice(0, 200));
    return null;
  }
  const d = upload.data ?? {};
  check('authenticated deployments_upload → deployment + url', typeof d.deployment === 'string');
  check(
    '  no claim URL — the deployment is owned, not claimable',
    !('claim' in d),
    String(d.claim),
  );
  check(
    '  expires is the key, present and literally null',
    // The response builder writes `expires: deployment.expires ?? null` — a
    // deliberate presence-with-null field, so assert both halves.
    'expires' in d && d.expires === null,
    `${'expires' in d ? 'present' : 'absent'} value=${String(d.expires)}`,
  );
  check("  via: 'mcp' — origin tracking on the wire", d.via === 'mcp', String(d.via));
  check('  screenshot URL present', isUrl(d.screenshot), String(d.screenshot));

  const read = await client.call('deployments_get', { deployment: d.deployment });
  check(
    'deployments_get → the same entity the mutation answered',
    read.data?.deployment === d.deployment,
    read.text.slice(0, 140),
  );

  const relabelled = await client.call('deployments_set', {
    deployment: d.deployment,
    labels: ['smoke-relabelled'],
  });
  check(
    'deployments_set → the ENTITY carrying the new labels, not an acknowledgement',
    Array.isArray(relabelled.data?.labels) && relabelled.data.labels.includes('smoke-relabelled'),
    relabelled.text.slice(0, 140),
  );

  return d.deployment;
}

/** The cursor is the whole has-more signal, and a repeated key replays. */
async function paginationBlock(client) {
  // Two uploads under one key. The second must replay the first rather than
  // create anything — proven on the PUBLISHED artifact, which is the only
  // place the SDK's header plumbing is real.
  const key = `smoke-${marker}`;
  const first = await client.call('deployments_upload', { path: scratch, idempotencyKey: key });
  const replay = await client.call('deployments_upload', { path: scratch, idempotencyKey: key });
  const replayed = first.data?.deployment;
  check(
    'the same idempotencyKey answers one deployment twice',
    !first.isError && !replay.isError && replayed && replay.data?.deployment === replayed,
    `${first.data?.deployment} vs ${replay.data?.deployment}`,
  );

  const list = await client.call('deployments_list');
  check('deployments_list → an array of deployments', Array.isArray(list.data?.deployments));
  check('  no `total` — the cursor is the whole has-more signal', !('total' in (list.data ?? {})));

  const page1 = await client.call('deployments_list', { limit: 1 });
  const rows1 = page1.data?.deployments ?? [];
  check('deployments_list {limit:1} → exactly one row', rows1.length === 1, `got ${rows1.length}`);
  check(
    '  cursor is non-null with more pages behind it',
    typeof page1.data?.cursor === 'string' && page1.data.cursor.length > 0,
    String(page1.data?.cursor),
  );

  if (typeof page1.data?.cursor === 'string') {
    const page2 = await client.call('deployments_list', { limit: 1, cursor: page1.data.cursor });
    const rows2 = page2.data?.deployments ?? [];
    check(
      '  the cursor advances to a different row',
      rows2.length === 1 && rows2[0]?.deployment !== rows1[0]?.deployment,
      `${rows1[0]?.deployment} vs ${rows2[0]?.deployment}`,
    );

    // Walk to exhaustion. The contract is that it TERMINATES — a cursor that
    // never nulls is an infinite agent loop, so the bound is the assertion.
    let cursor = page2.data?.cursor;
    let pages = 2;
    while (cursor && pages < 50) {
      const next = await client.call('deployments_list', { limit: 1, cursor });
      cursor = next.data?.cursor;
      pages += 1;
    }
    check(
      `  walking to exhaustion terminates with cursor: null (${pages} pages)`,
      cursor === null,
      `stopped at ${String(cursor)} after ${pages} pages`,
    );
  }

  // Housekeeping: the replay left one owned deployment behind that no
  // assertion below deletes. Litter on dev is still litter.
  if (replayed) await client.call('deployments_delete', { deployment: replayed });
}

/**
 * The third deployment state: owned AND expiring, which until `ttl` could not
 * exist — `expires` and `claim` arrived together and left together.
 *
 * Only a live run can prove it. The suite's ship fake resolves whatever it is
 * handed, so nothing there can catch the API ignoring the option, refusing it,
 * or granting a different lease than the one asked for; and the option would
 * otherwise be a schema field no run has ever invoked, which is exactly the
 * hole "all fifteen tools, live" exists to close.
 */
async function ttlBlock(client) {
  // Short, because it is deleted below anyway — but long enough that a run
  // reading the deployment back would still find it alive.
  const TTL_SECONDS = 300;

  const upload = await client.call('deployments_upload', { path: scratch, ttl: TTL_SECONDS });
  if (upload.isError) {
    fail(`authenticated deployments_upload {ttl:${TTL_SECONDS}}`, upload.text.slice(0, 200));
    return;
  }
  const d = upload.data ?? {};
  check(
    `deployments_upload {ttl:${TTL_SECONDS}} → a deployment that expires`,
    typeof d.deployment === 'string' && d.expires !== null && d.expires !== undefined,
    JSON.stringify(d).slice(0, 200),
  );
  check(
    '  the lease is exactly the one requested — created + ttl, stamped on one clock',
    // Not merely "some expiry": an authenticated deploy defaults to null, so a
    // non-null value proves the option was READ, and the arithmetic proves it
    // was read at the value sent rather than rounded, clamped or defaulted.
    d.expires === d.created + TTL_SECONDS,
    `created=${d.created} expires=${d.expires} — wanted ${d.created + TTL_SECONDS}`,
  );
  check(
    '  expiring yet NOT claimable — an owned deployment carries no claim URL',
    !('claim' in d),
    String(d.claim),
  );

  // Litter on dev is still litter, and the lease would outlive the run.
  if (typeof d.deployment === 'string') {
    await client.call('deployments_delete', { deployment: d.deployment });
  }
}

/** validate → set → get → records → dns → share → verify → list → delete. */
async function domainBlock(client) {
  const validated = await client.call('domains_validate', { domain: testDomain });
  if (validated.isError) {
    skip('domain block', `domains_validate refused (${refusalReason(validated)})`);
    unverified('the nine domain tools are');
    return;
  }
  const v = validated.data ?? {};
  check(
    'domains_validate → {valid, normalized, available, reason}',
    ['valid', 'normalized', 'available', 'reason'].every((k) => k in v),
    Object.keys(v).join(','),
  );
  check(
    '  no `error` key — the field is `reason` since 2.x',
    !('error' in v),
    Object.keys(v).join(','),
  );

  const created = await client.call('domains_set', { domain: testDomain });
  if (created.isError) {
    // The custom-domain gate is a plan/billing decision, and declining it is a
    // legitimate answer rather than a broken contract.
    const reason = refusalReason(created);
    if (REFUSAL.test(reason ?? '')) {
      skip('domain block', `domains_set refused (${reason})`);
      unverified('domains_set/get/records/dns/share/verify/list/delete are');
      return;
    }
    fail('domains_set', created.text.slice(0, 200));
    return;
  }
  check(
    'domains_set → the domain carrying isCreate',
    created.data?.isCreate === true,
    created.text.slice(0, 140),
  );

  try {
    const got = await client.call('domains_get', { domain: testDomain });
    check(
      'domains_get → the domain entity by normalized name',
      got.data?.domain === testDomain,
      got.text.slice(0, 140),
    );

    const records = await client.call('domains_records', { domain: testDomain });
    check(
      'domains_records → a non-empty records array',
      Array.isArray(records.data?.records) && records.data.records.length > 0,
      records.text.slice(0, 140),
    );

    const dns = await client.call('domains_dns', { domain: testDomain });
    // Shape only. The values depend on real DNS for a name we do not own, so
    // asserting them would make this run depend on the internet's opinion.
    check(
      'domains_dns → the lookup shape (values not asserted)',
      !dns.isError && 'dns' in (dns.data ?? {}),
      dns.text.slice(0, 140),
    );

    const share = await client.call('domains_share', { domain: testDomain });
    check(
      'domains_share → {domain, hash}',
      typeof share.data?.hash === 'string' && share.data.hash.length > 0,
      share.text.slice(0, 140),
    );

    const verified = await client.call('domains_verify', { domain: testDomain });
    check(
      'domains_verify → {domain}',
      verified.data?.domain === testDomain,
      verified.text.slice(0, 140),
    );
    check(
      '  no prose `message` — 1.x answered that way, 2.x answers the resource',
      !('message' in (verified.data ?? {})),
      Object.keys(verified.data ?? {}).join(','),
    );

    if (HAS_PAGING) {
      const page = await client.call('domains_list', { limit: 1 });
      check(
        'domains_list {limit:1} → at most one row, cursor present',
        (page.data?.domains ?? []).length <= 1 && 'cursor' in (page.data ?? {}),
        page.text.slice(0, 140),
      );
    }
  } finally {
    const deleted = await client.call('domains_delete', { domain: testDomain });
    check(
      'domains_delete → {domain}',
      deleted.data?.domain === testDomain,
      deleted.text.slice(0, 140),
    );
  }
}

/** 2.x replaced void deletes with typed acknowledgements. */
async function deleteBlock(client, deployment) {
  if (!deployment) {
    skip('deployments_delete', 'no owned deployment to delete');
    unverified('the deletion acknowledgement is');
    return;
  }
  const deleted = await client.call('deployments_delete', { deployment });
  check(
    "deployments_delete → {deployment, status: 'deleting'}",
    deleted.data?.deployment === deployment && deleted.data?.status === 'deleting',
    deleted.text.slice(0, 140),
  );
  check(
    '  not "Done." — the acknowledgement reached the agent as data',
    // `call()` answers "Done." only for a genuinely void SDK result, so this
    // is what tells an acknowledgement apart from a swallowed one.
    deleted.text.trim() !== 'Done.',
    deleted.text.slice(0, 60),
  );
}

/** A hint on the wrong error arm sends an agent chasing a credential. */
async function errorRelayBlock(client) {
  const missing = await client.call('deployments_get', {
    deployment: `no-such-${marker}.shipstatic.com`,
  });
  check(
    'deployments_get {bogus} → an error the agent can read',
    missing.isError === true,
    missing.text.slice(0, 140),
  );
  check(
    '  no credential hint on a not-found — only the auth arm earns one',
    !missing.text.includes('SHIP_TOKEN'),
    missing.text.slice(0, 140),
  );
}
