import { describe, expect, it } from 'vitest';
import { aiCatalog, SERVER_CARD_TYPE, serverCard } from '../src/server-card.js';
import { SERVER_INFO } from '../src/vocabulary.js';

/**
 * @file The server card and the AI Catalog that points at it.
 *
 * Both are documents other systems parse, so the expectations are written
 * out: a card that changed shape must fail here before a client reads it.
 * The version and the address are planted, so a builder that froze its own
 * could not pass.
 */

const CARD = serverCard({ version: '9.8.7', url: 'https://mcp.example.test/door' });

describe('serverCard', () => {
  it('is the whole card, with the transport’s version and address in it', () => {
    expect(CARD).toEqual({
      $schema: 'https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json',
      name: 'com.shipstatic/mcp',
      title: 'ShipStatic',
      description:
        'Deploy static websites, landing pages, and prototypes instantly. Free, no account needed.',
      version: '9.8.7',
      websiteUrl: 'https://shipstatic.com',
      repository: {
        url: 'https://github.com/shipstatic/mcp',
        source: 'github',
        id: '1171867838',
      },
      icons: [
        { src: 'https://www.shipstatic.com/logo.svg', mimeType: 'image/svg+xml', sizes: ['any'] },
        { src: 'https://www.shipstatic.com/logo.png', mimeType: 'image/png', sizes: ['512x512'] },
      ],
      remotes: [{ type: 'streamable-http', url: 'https://mcp.example.test/door' }],
    });
  });

  it('says what a connected server says about itself', () => {
    // A client reads the card before it connects and `serverInfo` after. The
    // specification asks that the two not contradict each other.
    expect(CARD).toMatchObject({
      title: SERVER_INFO.title,
      description: SERVER_INFO.description,
      websiteUrl: SERVER_INFO.websiteUrl,
      icons: SERVER_INFO.icons,
    });
  });

  it('stays inside what the card schema accepts', () => {
    // The schema's own bounds, restated because nothing here can import them:
    // a reverse-DNS name with one slash, and a description of at most 100
    // characters, which is the MCP Registry's bound too.
    expect(CARD.name).toMatch(/^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/);
    expect(CARD.description.length).toBeGreaterThan(0);
    expect(CARD.description.length).toBeLessThanOrEqual(100);
    expect(CARD.title.length).toBeLessThanOrEqual(100);
  });

  it('names no tool: a client lists those once connected', () => {
    expect(JSON.stringify(CARD)).not.toMatch(/deployments_|domains_|whoami/);
  });
});

describe('aiCatalog', () => {
  it('is one entry that points at the card it is given', () => {
    expect(aiCatalog('https://mcp.example.test/door/server-card')).toEqual({
      specVersion: '1.0',
      entries: [
        {
          identifier: 'urn:air:shipstatic.com:mcp:shipstatic',
          type: 'application/mcp-server-card+json',
          url: 'https://mcp.example.test/door/server-card',
        },
      ],
    });
  });

  it('gives its entry the type a card is served as', () => {
    expect(aiCatalog('https://x.test/server-card').entries[0]?.type).toBe(SERVER_CARD_TYPE);
  });
});
