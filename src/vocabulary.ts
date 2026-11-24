/**
 * The vocabulary both transports speak.
 *
 * `@shipstatic/mcp` (stdio) and the hosted Streamable-HTTP server are one
 * product with two doors in. Everything an agent observes that the transport
 * does not force apart lives here and is imported by both, because a fact
 * with two owners drifts.
 *
 * What belongs here is anything true of a ShipStatic deploy however the bytes
 * arrived. Three things do not:
 *
 *   - **The file-input schema.** A filesystem path here, inline content on
 *     the hosted transport, which has no filesystem.
 *   - **Tool descriptions as whole strings.** The hosted one tells its caller
 *     not to base64-encode text, a mistake a filesystem path cannot make.
 *     What the two share is `DESCRIPTION_BLOCKS`, composed per transport.
 *   - **Anything Apps-SDK** (the card, its `_meta`): hosted-only by nature.
 *
 * **A constant is read from whatever acts on it.** The label, password and
 * idempotency-key constraints come from `@shipstatic/ship`, because the SDK
 * validates a value against them before it reaches the wire, and ship bundles
 * its own copy of them: read from `@shipstatic/types`, a describe could
 * advertise a limit the validator beside it rejects. The public-deploy
 * lifetime comes from `@shipstatic/types`: ship never reads it, the API
 * stamps it, so there is no validator to agree with.
 */

import type { Implementation } from '@modelcontextprotocol/sdk/types.js';
import {
  IDEMPOTENCY_KEY_CONSTRAINTS,
  LABEL_CONSTRAINTS,
  PASSWORD_CONSTRAINTS,
} from '@shipstatic/ship';
import { formatDuration, PUBLIC_DEPLOYMENT_TTL_SECONDS } from '@shipstatic/types';

/**
 * The server name every transport reports in `serverInfo`. It is more than
 * prose: the deploy card's handshake sends it as `appInfo.name`, and the host
 * ties the card to its connector by comparing the two.
 */
export const SERVER_NAME = 'shipstatic';

/**
 * Who the server is, as every transport reports it in `serverInfo`: what a
 * client shows a person when they connect. Everything but the version, which
 * each transport reads from its own manifest.
 *
 * - **`title`** is the product's name as people read it.
 * - **`description`** is the product's root sentence, the same on every
 *   transport and every hosted door: it states the product's promise, never
 *   how one door is entered.
 * - **`websiteUrl`** and the **icons** name the product, so they are
 *   production values in every environment.
 * - **The icons** are the brand mark on our own domain: `logo.svg` at `any`
 *   size, and `logo.png` at 512x512, because a client that renders icons must
 *   support PNG and need not support SVG.
 *
 * The MCP Registry entry (`server.json`) states the same title, description,
 * website and icons, and `package.json`'s description opens with the same
 * sentence. The docs contract holds both to this object.
 */
export const SERVER_INFO: Omit<Implementation, 'version'> = {
  name: SERVER_NAME,
  title: 'ShipStatic',
  description:
    'Deploy static websites, landing pages, and prototypes instantly. Free, no account needed.',
  websiteUrl: 'https://shipstatic.com',
  icons: [
    { src: 'https://www.shipstatic.com/logo.svg', mimeType: 'image/svg+xml', sizes: ['any'] },
    { src: 'https://www.shipstatic.com/logo.png', mimeType: 'image/png', sizes: ['512x512'] },
  ],
};

/**
 * The one tool each transport authors for itself: its input differs, its name
 * must not. A second transport states its catalogue as
 * `[UPLOAD_TOOL_NAME, ...ACCOUNT_TOOL_NAMES]`.
 */
export const UPLOAD_TOOL_NAME = 'deployments_upload';

/**
 * The upload tool's `title`. A title names the operation, which is the same
 * on both transports, so it is shared whole where the description is shared
 * only in fragments. The other fourteen titles are inline in `tools.ts`,
 * which both transports register.
 */
export const UPLOAD_TOOL_TITLE = 'Deploy Static Site';

/**
 * How long an anonymous deployment lives, in the words an agent reads:
 * derived from the number the API stamps, and spelled by `formatDuration`,
 * the platform's one way of saying a span of time. A phrase, because every
 * consumer is prose and the value has to carry its own unit. `formatDuration`
 * rounds a lifetime that is not a whole number of its unit (84 hours reads
 * "4 days").
 */
export const PUBLIC_EXPIRY = formatDuration(PUBLIC_DEPLOYMENT_TTL_SECONDS);

/**
 * What is true of one tool, on the three axes a host reads. One row per tool
 * lives in the registry (`TOOLS` in `tools.ts`), and every other statement
 * about the tool derives from its row: the annotations (`annotate`), the
 * account-tool set, and what the hosted transport declares each tool needs.
 */
export interface ToolContract {
  /** `optional`: works without an account, does more with one. */
  auth: 'optional' | 'required';
  /**
   * What a call does to the platform's state. `add` is additive: it creates
   * something or starts work, and overwrites nothing. `replace` overwrites
   * what is there. `remove` deletes it.
   */
  mutation: 'none' | 'add' | 'replace' | 'remove';
  /** Whether the call changes public internet state, or only the account's. */
  reach: 'account' | 'public';
}

/**
 * The MCP annotations a tool's contract implies. A host reads them to decide
 * whether a call may run speculatively (`readOnlyHint`), whether to confirm
 * with the user first (`destructiveHint`), whether a retry is free
 * (`idempotentHint`), and whether the call changes public state
 * (`openWorldHint`).
 *
 * **`idempotentHint` is promised only for a remove**, the one mutation where
 * a repeat has no further effect. A replace records an activity per call, and
 * `domains_set` may start DNS work besides. An add acts on every call, and
 * `idempotencyKey` cannot rescue the claim: it depends on an argument the
 * caller may not pass, and the annotation is static. Reads carry none,
 * because the specification defines the hint only for tools that mutate.
 */
export function annotate({ mutation, reach }: ToolContract) {
  return {
    readOnlyHint: mutation === 'none',
    destructiveHint: mutation === 'replace' || mutation === 'remove',
    ...(mutation === 'remove' ? { idempotentHint: true } : {}),
    openWorldHint: reach === 'public',
  } as const;
}

/**
 * One title, two wire slots: copies a tool config's top-level `title` into
 * `annotations.title`.
 *
 * The specification carries a tool title in both places. The top-level one
 * is current (2025-06-18) and `annotations.title` is the older slot some
 * readers still key on: the Claude connectors portal shows the first as the
 * heading and flags a tool whose second is missing. The top-level `title` is
 * the owner, this is the only writer of the copy, and the catalogue tests
 * hold the two slots equal on every tool.
 */
export function titled<C extends { title: string; annotations?: object }>(config: C): C {
  return { ...config, annotations: { ...config.annotations, title: config.title } };
}

/**
 * The instruction sentences both transports say. `initialize`'s instructions
 * are what an agent reads before acting, beside the catalogue. Each transport
 * composes its own from these blocks and adds the two things that are its
 * own: how files arrive, and how a caller authenticates.
 */
export const INSTRUCTION_BLOCKS = {
  opening: 'ShipStatic deploys static websites instantly. Free, no account needed.',
  /**
   * Publishing first: the no-account promise holds only if nothing stands
   * between a person and their first link.
   */
  accountLater:
    'Deploy straight away, and bring up an account only when the user asks to see or manage their sites, or to use their own domain.',
  live: 'The site is live immediately.',
  /**
   * The platform refuses a deployment with no `index.html` at its root. The
   * refusal says so too; this sentence lets an agent shape the files right
   * the first time, above all the one-file publish.
   */
  home: "The files need an `index.html` at the top: it's the page visitors see first, and a site without one is refused. To publish one page, name it `index.html`. To publish another kind of file, like a PDF, add a small `index.html` that links to it.",
  /**
   * The platform sets up a single-page app's routing by itself, and misses
   * some apps. The agent that built the app knows it routes, so it is told
   * the sign of a miss and the one file that fixes it. A remedy, never a
   * default: a catch-all on a site of plain pages answers every mistyped URL
   * with the home page. A site with a `ship.json` of its own is one the
   * platform leaves alone, so the rewrite joins that file, last, because the
   * first matching rewrite wins.
   */
  routes:
    'Single-page apps are detected, and their routes are set up for you. If the app has its own routes (like `/dashboard`) and reloading one shows a 404, add a `ship.json` at the top with `{"rewrites":[{"source":"/(.*)","destination":"/index.html"}]}` and deploy again. If the site already has a `ship.json`, add that rewrite last in its `rewrites` instead.',
  /**
   * Names the feature and keeps the agent from writing a password page of its
   * own, which anyone can read past in the page's source. The rule to tell
   * the user the password lives here and never in the upload description:
   * `instructions` is where a server says what an agent should do, and
   * listing reviews reject a description that instructs the model.
   */
  password:
    "To make the site private, pass `password`: that is ShipStatic's built-in password protection, checked before any file is served. When the user asks for a password or a private site, use it, and do not build a password page or script into the site itself. Visitors must unlock before viewing, including on any custom domains pointing at it. Tell the user any password you set, since one they never see locks them out.",
  claim:
    'The response includes a claim URL. Always show the deployment URL and the claim URL to the user, so they can keep the site permanently.',
  conceptsHeader: 'Concepts:',
  deploymentConcept:
    '- Deployment: an immutable set of files with an instant URL (e.g. happy-cat-abc1234.shipstatic.com). No setup needed.',
  domainConcept:
    '- Domain: a name pointing to a deployment. Optional. A ShipStatic domain (e.g. yourname.shipstatic.com) needs no setup; a custom domain (e.g. www.example.com) needs DNS records. Subdomains only, not apex domains.',
  domainWorkflow:
    'To give a deployment a ShipStatic domain: domains_validate → domains_set with the domain and the deployment. It is live at once, with no DNS. To add a custom domain: domains_validate → domains_set → domains_records (show DNS records to user) → user configures DNS → domains_verify, only while its `status` is `unverified` → domains_set with the deployment to serve. A domain serves nothing until a deployment is linked, so ask the user which one and link it. Read `status` to know where a domain stands: `unverified` means its DNS records are not configured yet, `unlinked` means DNS is right and nothing is published there, `live` means it serves, `paused` means the plan has no room for it.',
} as const;

/**
 * The fragments of the upload tool's description that both transports say.
 * The descriptions around them differ on purpose, so what is shared is
 * smaller than a sentence in one case and exactly a sentence in the other.
 */
export const DESCRIPTION_BLOCKS = {
  /** The no-account promise, mid-sentence in both openings. */
  free: 'free, no account or API key required',
  /** The option, stated as a capability. What to do with it is `INSTRUCTION_BLOCKS.password`. */
  password: 'Pass `password` to make the site private.',
} as const;

/**
 * The deploy-parameter descriptions both transports say. Every number is
 * interpolated from its owner, never typed out.
 *
 * No member names a credential: stdio owns `SHIP_TOKEN` and the hosted
 * transport owns "connect an account", and a shared string naming either
 * would put one door's fact in the other's mouth. `tests/vocabulary.test.ts`
 * holds every shared string to that.
 */
export const PARAM_DESCRIPTIONS = {
  labels: `Labels for organizing deployments (e.g. ["env:production", "v1.2"]). Each is a word, or a key and a value split by one ":". Lowercase, ${LABEL_CONSTRAINTS.MIN_LENGTH}-${LABEL_CONSTRAINTS.MAX_LENGTH} chars, allows . _ - inside a word. Up to ${LABEL_CONSTRAINTS.MAX_COUNT}.`,
  password: `Optional password to gate the deployment behind an unlock prompt (${PASSWORD_CONSTRAINTS.MIN_LENGTH} to ${PASSWORD_CONSTRAINTS.MAX_LENGTH} characters; spaces at the start and end are trimmed). Visitors must enter this password before viewing the site, including on any custom domains pointing at it.`,
  /**
   * The API keeps one rule for every caller: a key names the live deployment
   * it made, within the account that sent it, and an anonymous key is
   * ignored. So no door appends a clause of its own.
   */
  idempotencyKey: `Makes this deploy replayable instead of repeatable. A deploy is not naturally idempotent: if a call times out you cannot tell "it never landed" from "it landed and the response was lost", and retrying creates a second deployment. Send the same key on the retry and you get back the deployment the first try made, if it went live in the last ${IDEMPOTENCY_KEY_CONSTRAINTS.WINDOW_SECONDS / 3600} hours. A key works only within the account that sent it: without an account it is ignored, and a retry deploys again. Key the ATTEMPT (a run id, a commit sha, a uuid minted before the first try), never one minted fresh on each retry, which would defeat the point.`,
  /**
   * States no range: `@shipstatic/ship` validates it before a byte is
   * uploaded and relays the platform's own sentence, which a second copy
   * here could only disagree with.
   */
  ttl: "Seconds until this deployment expires and the platform reclaims it; omit for one that never does. Only for authenticated deploys: an anonymous deployment already expires on the platform's schedule, and a requested ttl on one is refused. A deployment carrying a ttl cannot be linked to any domain: deploy without one if the site needs a domain.",
} as const;
