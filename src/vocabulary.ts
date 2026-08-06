/**
 * The vocabulary both transports speak.
 *
 * `@shipstatic/mcp` (stdio) and the hosted Streamable-HTTP server are one
 * product with two doors in. Everything an agent observes that is NOT forced
 * apart by the transport lives here and is IMPORTED by both — because a fact
 * with two owners is a fact that drifts. This pair kept ten such strings
 * byte-identical by hand for a year, and the hand slipped: a tool description
 * diverged unnoticed, a one-word correction had to be applied at three sites,
 * and a test mock invented constraint numbers production never used. A
 * coordination table written in prose is a specification for drift, not a
 * defence against it.
 *
 * What belongs here: anything true of a ShipStatic deploy regardless of how
 * the bytes arrived. What does not, and why:
 *
 *   - **The file-input schema.** A filesystem path here, inline content there:
 *     Workers has no filesystem. Structurally forced apart.
 *   - **Tool descriptions**, as whole strings. They are deliberately rewritten
 *     hosted-side for an Apps-SDK caller that must be told not to base64-encode
 *     text — a failure mode the filesystem path does not have. What genuinely
 *     overlaps is exported as `DESCRIPTION_BLOCKS` and composed per transport.
 *   - **Anything Apps-SDK** (widget, `_meta`, `outputSchema`): hosted-only by
 *     nature.
 *
 * Each of those is recorded in `cloudflare/mcp/CLAUDE.md`'s divergence table.
 * Everything else should be here, and adding a shared fact anywhere else is
 * how the next year's drift starts.
 */

import {
  IDEMPOTENCY_KEY_CONSTRAINTS,
  LABEL_CONSTRAINTS,
  PASSWORD_CONSTRAINTS,
} from '@shipstatic/ship';

/**
 * The server name every transport reports in `serverInfo`.
 *
 * Shared because it is not only prose: the Apps-SDK widget's bridge handshake
 * sends `appInfo.name`, which the HOST correlates against `serverInfo.name` to
 * tie the rendered view to the connector. Two literals kept equal by comment
 * is exactly the shape this package exists to delete.
 */
export const SERVER_NAME = 'shipstatic';

/**
 * The one tool authored per transport — its INPUT differs (a filesystem path
 * over stdio, inline bytes over HTTP), its NAME must not. Exported so the
 * hosted parity fence can build the expected catalogue as
 * `[UPLOAD_TOOL_NAME, ...ACCOUNT_TOOL_NAMES]` rather than counting to fifteen.
 */
export const UPLOAD_TOOL_NAME = 'deployments_upload';

/**
 * How long an anonymous deployment lives, in the words an agent reads.
 *
 * **The fact is owned by `cloudflare/api` (`DEPLOYMENT.PUBLIC_TTL`), which
 * `@shipstatic/types` does not yet export** — so this is a restatement, and it
 * is deliberately the ONLY one. It previously appeared in eight places across
 * the two servers and the widget; a TTL change had to find all eight. When
 * types exports the constant, this line becomes a derivation and nothing above
 * it moves.
 *
 * A phrase rather than a number because every consumer is prose: the value has
 * to carry its own unit, and `PUBLIC_TTL / 86400` interpolated at eight sites
 * would restate the unit eight times instead of the number.
 */
export const PUBLIC_EXPIRY = '3 days';

const OPEN_WORLD = { openWorldHint: true } as const;

/**
 * MCP tool annotations by kind of operation. An agent reads these to decide
 * whether it may call speculatively (`readOnlyHint`), whether a retry is free
 * (`idempotentHint`), and whether it must confirm with the user first
 * (`destructiveHint`).
 *
 * **`CREATE` carries no `idempotentHint`, deliberately.** A deploy creates a
 * new deployment on every call. `idempotencyKey` makes a retry replay the
 * original instead — but that property is conditional on an argument the
 * caller may not pass, while the annotation is static per tool. Advertising it
 * would promise every agent that any retry is free, which is exactly false for
 * the keyless caller, and an annotation an agent trusts wrongly is worse than
 * one it never reads.
 */
export const ANNOTATIONS = {
  READ: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, ...OPEN_WORLD },
  CREATE: { readOnlyHint: false, destructiveHint: false, ...OPEN_WORLD },
  WRITE: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, ...OPEN_WORLD },
  DESTRUCTIVE: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, ...OPEN_WORLD },
} as const;

/**
 * INSTRUCTIONS sentences both transports say.
 *
 * `initialize`'s instructions are the other half of what an agent reads
 * before acting (the catalogue is the first). Each transport composes its own
 * from these blocks plus the two things that are genuinely its own: how files
 * arrive, and how a caller authenticates.
 *
 * Three of these are duplicated prose TODAY, kept equal by review. The last
 * two are stdio-only only because the hosted transport has no domain tools
 * yet — when it gains them with OAuth they become shared too, which is
 * precisely when someone would otherwise copy them across.
 */
export const INSTRUCTION_BLOCKS = {
  opening: 'ShipStatic deploys static websites instantly. Free, no account required.',
  liveAndPassword:
    'The site is live immediately. To make the site private, pass `password` — visitors must unlock before viewing, including on any custom domains pointing at it.',
  claim:
    'The response includes a claim URL — always show the deployment URL and the claim URL to the user so they can keep the site permanently.',
  conceptsHeader: 'Concepts:',
  deploymentConcept:
    '- Deployment: an immutable set of files with an instant URL (e.g. happy-cat-abc1234.shipstatic.com). No setup needed.',
  domainConcept:
    '- Domain: a custom domain (e.g. www.example.com) pointing to a deployment. Optional. Subdomains only — not apex domains.',
  domainWorkflow:
    'To add a custom domain: domains_validate → domains_set → domains_records (show DNS records to user) → user configures DNS → domains_verify.',
} as const;

/**
 * The fragments of the upload tool's description that both transports say.
 *
 * The surrounding descriptions diverge on purpose — hosted opens for an
 * Apps-SDK caller and spends a paragraph on plain-text-vs-base64, stdio takes
 * a filesystem path and has no such hazard — so what is shared is smaller than
 * a sentence in one case and exactly a sentence in the other. Both were pinned
 * by a `toContain` on each side, which meant three copies of each fragment
 * (two sources and a test literal) held equal by nobody.
 *
 * Same reasoning as `INSTRUCTION_BLOCKS`, one altitude down: blocks are shared,
 * composition is per transport.
 */
export const DESCRIPTION_BLOCKS = {
  /** The no-account promise, mid-sentence in both openings. */
  free: 'free, no account or API key required',
  /** The password read-back rule — a password the user never sees locks them out. */
  password:
    'To make the site private, pass `password`; always show the password to the user if you set one.',
} as const;

/**
 * Deploy-parameter descriptions shared by both transports.
 *
 * The numbers interpolate from `@shipstatic/types` rather than being written
 * out, so a platform constraint change reaches every agent-facing string
 * without anyone editing prose — the same reason the API and the SDK import
 * them instead of restating them.
 */
export const PARAM_DESCRIPTIONS = {
  labels: `Labels for organizing deployments (e.g. ["production", "v1.2"]). Lowercase, ${LABEL_CONSTRAINTS.MIN_LENGTH}-${LABEL_CONSTRAINTS.MAX_LENGTH} chars, allows . _ - separators. Up to ${LABEL_CONSTRAINTS.MAX_COUNT}.`,
  password: `Optional password to gate the deployment behind an unlock prompt (${PASSWORD_CONSTRAINTS.MIN_LENGTH}–${PASSWORD_CONSTRAINTS.MAX_LENGTH} characters; whitespace significant). Visitors must enter this password before viewing the site, including on any custom domains pointing at it.`,
  /**
   * Shared even though only stdio offers the option today: the hosted door
   * gains it with OAuth (it can scope a replay per user once callers have an
   * identity), and the law this teaches — key the ATTEMPT, never the try — is
   * the same one on both. The window is derived, never typed out.
   */
  idempotencyKey: `Makes this deploy replayable instead of repeatable. A deploy is not naturally idempotent: if a call times out you cannot tell "it never landed" from "it landed and the response was lost", and retrying creates a second deployment. Send the same key on the retry and the original deployment is replayed instead (within ${IDEMPOTENCY_KEY_CONSTRAINTS.WINDOW_SECONDS / 3600} hours). Key the ATTEMPT — a run id, a commit sha, a uuid minted before the first try — never one minted fresh on each retry, which would defeat the point.`,
} as const;
