/**
 * The server card: who the server is, as a document a client reads before it
 * connects.
 *
 * MCP Server Cards (SEP-2127) describe a remote server's identity and where
 * it answers. A client finds a card through an AI Catalog, a small document
 * at a domain's `/.well-known/ai-catalog.json` that points at it, or at the
 * reserved location `<server URL>/server-card`.
 *
 * The card is the MCP Registry entry's shape under another schema, so this
 * module is the one owner of both: `server.json` is held to `serverCard` by
 * the docs contract, and the hosted transport serves the card and the
 * catalog from these builders. A transport supplies only what it alone
 * knows: the version it runs and the address it answers at.
 *
 * What a person reads (title, description, website, icons) is `SERVER_INFO`,
 * so a card and a connected server never describe two products. The card's
 * `name` is the registry's reverse-DNS one, as the schema requires;
 * `serverInfo.name` stays `SERVER_NAME`.
 */

import { SERVER_INFO } from './vocabulary.js';

/** The media type a card is served as, and the type a catalog entry gives it. */
export const SERVER_CARD_TYPE = 'application/mcp-server-card+json';

/** The schema every card names. The schema requires this exact address. */
const SERVER_CARD_SCHEMA =
  'https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json';

/** The server's name in the MCP Registry, which is also the card's. */
const REGISTRY_NAME = 'com.shipstatic/mcp';

/** The public repository the registry entry and the card both name. */
const REPOSITORY = {
  url: 'https://github.com/shipstatic/mcp',
  source: 'github',
  id: '1171867838',
} as const;

/**
 * The server's identifier in an AI Catalog: the publisher's domain, the `mcp`
 * namespace, and the server's name. Stated, never derived, because an
 * identifier stays the same when a website address or a title changes.
 */
const CATALOG_IDENTIFIER = 'urn:air:shipstatic.com:mcp:shipstatic';

/** What a transport knows and a card needs. */
export interface ServerCardOptions {
  /** The version the server reports as `serverInfo.version`. */
  version: string;
  /** The Streamable-HTTP address the server answers at. */
  url: string;
}

/**
 * The card for a server answering at `url`. It names no tools: a client
 * lists those once connected.
 */
export function serverCard({ version, url }: ServerCardOptions) {
  return {
    $schema: SERVER_CARD_SCHEMA,
    name: REGISTRY_NAME,
    title: SERVER_INFO.title,
    description: SERVER_INFO.description,
    version,
    websiteUrl: SERVER_INFO.websiteUrl,
    repository: REPOSITORY,
    icons: SERVER_INFO.icons,
    remotes: [{ type: 'streamable-http', url }],
  };
}

/**
 * The AI Catalog that points at a card: one entry, and nothing a client can
 * read from the card itself, so the two cannot drift.
 */
export function aiCatalog(cardUrl: string) {
  return {
    specVersion: '1.0',
    entries: [{ identifier: CATALOG_IDENTIFIER, type: SERVER_CARD_TYPE, url: cardUrl }],
  };
}
