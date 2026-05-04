import { describe, it, expect } from 'vitest';
import { ShipError } from '@shipstatic/types';
import { call } from '../src/call.js';

describe('call', () => {
  it('returns JSON-stringified result', async () => {
    const result = await call(() => Promise.resolve({ id: 1, name: 'test' }));

    expect(result.isError).toBeUndefined();
    expect(JSON.parse((result.content[0] as any).text)).toEqual({ id: 1, name: 'test' });
  });

  it('returns "Done." for void operations', async () => {
    const result = await call(() => Promise.resolve(undefined));

    expect(result.isError).toBeUndefined();
    expect((result.content[0] as any).text).toBe('Done.');
  });

  it('maps authentication error with SHIP_API_KEY hint', async () => {
    const result = await call(() => Promise.reject(ShipError.authentication('Invalid API key')));

    expect(result.isError).toBe(true);
    const text = (result.content[0] as any).text;
    expect(text).toContain('Invalid API key');
    expect(text).toContain('SHIP_API_KEY');
  });

  it('maps validation error with details', async () => {
    const result = await call(() =>
      Promise.reject(ShipError.validation('Invalid input', { field: 'name', reason: 'too short' }))
    );

    expect(result.isError).toBe(true);
    const text = (result.content[0] as any).text;
    expect(text).toContain('Invalid input');
    expect(text).toContain('"field"');
    expect(text).toContain('too short');
  });

  it('maps not found error without hint', async () => {
    const result = await call(() => Promise.reject(ShipError.notFound('Deployment', 'abc123')));

    expect(result.isError).toBe(true);
    const text = (result.content[0] as any).text;
    expect(text).not.toContain('SHIP_API_KEY');
  });

  it('maps business error', async () => {
    const result = await call(() => Promise.reject(ShipError.business('Quota exceeded')));

    expect(result.isError).toBe(true);
    expect((result.content[0] as any).text).toBe('Quota exceeded');
  });

  it('maps unknown Error without leaking stack', async () => {
    const result = await call(() => Promise.reject(new Error('Something went wrong')));

    expect(result.isError).toBe(true);
    const text = (result.content[0] as any).text;
    expect(text).toBe('Something went wrong');
    expect(text).not.toContain('at ');
  });

  it('maps non-Error values', async () => {
    const result = await call(() => Promise.reject('string error'));

    expect(result.isError).toBe(true);
    expect((result.content[0] as any).text).toBe('An unexpected error occurred');
  });

  it('does not append SHIP_API_KEY hint to rate-limit errors', async () => {
    const result = await call(() => Promise.reject(ShipError.rateLimit('Too many requests')));

    expect(result.isError).toBe(true);
    const text = (result.content[0] as any).text;
    expect(text).toContain('Too many requests');
    expect(text).not.toContain('SHIP_API_KEY');
  });

  it('survives circular validation details', async () => {
    const circular: any = { field: 'name' };
    circular.self = circular;
    const result = await call(() => Promise.reject(ShipError.validation('Bad input', circular)));

    expect(result.isError).toBe(true);
    const text = (result.content[0] as any).text;
    expect(text).toContain('Bad input');
    // Doesn't crash; falls back to String() representation when JSON.stringify throws
    expect(text).toContain('Details:');
  });

  it('serializes null result as JSON literal', async () => {
    const result = await call(() => Promise.resolve(null));

    expect(result.isError).toBeUndefined();
    expect((result.content[0] as any).text).toBe('null');
  });
});
