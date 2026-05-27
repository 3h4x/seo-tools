import { describe, it, expect } from 'vitest';
import { readJsonBody } from '../json-body';

describe('readJsonBody', () => {
  it('returns { ok: true, body } for valid JSON', async () => {
    const req = new Request('http://localhost/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: 'value' }),
    });
    const result = await readJsonBody(req);
    expect(result).toEqual({ ok: true, body: { key: 'value' } });
  });

  it('returns { ok: false } for malformed JSON', async () => {
    const req = new Request('http://localhost/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"key":',
    });
    const result = await readJsonBody(req);
    expect(result).toEqual({ ok: false });
  });

  it('returns { ok: true, body: null } for JSON null', async () => {
    const req = new Request('http://localhost/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'null',
    });
    const result = await readJsonBody(req);
    expect(result).toEqual({ ok: true, body: null });
  });

  it('returns { ok: true, body } for a JSON array', async () => {
    const req = new Request('http://localhost/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '[1, 2, 3]',
    });
    const result = await readJsonBody(req);
    expect(result).toEqual({ ok: true, body: [1, 2, 3] });
  });
});
