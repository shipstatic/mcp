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
 *   - **Tool descriptions.** Deliberately rewritten hosted-side for an
 *     Apps-SDK caller that must be told not to base64-encode text — a failure
 *     mode the filesystem path does not have.
 *   - **Anything Apps-SDK** (widget, `_meta`, `outputSchema`): hosted-only by
 *     nature.
 *
 * Each of those is recorded in `cloudflare/mcp/CLAUDE.md`'s divergence table.
 * Everything else should be here, and adding a shared fact anywhere else is
 * how the next year's drift starts.
 */

import { LABEL_CONSTRAINTS, PASSWORD_CONSTRAINTS } from '@shipstatic/ship';

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
 * Deploy-parameter descriptions shared by both transports.
 *
 * The numbers interpolate from `@shipstatic/types` rather than being written
 * out, so a platform constraint change reaches every agent-facing string
 * without anyone editing prose — the same reason the API and the SDK import
 * them instead of restating them.
 */
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

export const PARAM_DESCRIPTIONS = {
  labels: `Labels for organizing deployments (e.g. ["production", "v1.2"]). Lowercase, ${LABEL_CONSTRAINTS.MIN_LENGTH}-${LABEL_CONSTRAINTS.MAX_LENGTH} chars, allows . _ - separators. Up to ${LABEL_CONSTRAINTS.MAX_COUNT}.`,
  password: `Optional password to gate the deployment behind an unlock prompt (${PASSWORD_CONSTRAINTS.MIN_LENGTH}–${PASSWORD_CONSTRAINTS.MAX_LENGTH} characters; whitespace significant). Visitors must enter this password before viewing the site, including on any custom domains pointing at it.`,
} as const;
