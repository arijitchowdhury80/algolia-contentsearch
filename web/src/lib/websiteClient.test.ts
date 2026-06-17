import { describe, it, expect, vi } from 'vitest';
import { requestWebsiteCapture, type WebsiteResult } from './websiteClient';

const ok: WebsiteResult = {
  answer: 'Current website search results for "x": 1. Foo (https://a)',
  sources: [{ id: 'S1', text: 'Foo — bar', label: 'https://a' }],
};

describe('requestWebsiteCapture', () => {
  it('POSTs the query to /api/website and returns the parsed result', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => ok });
    const out = await requestWebsiteCapture('typo tolerance', f as unknown as typeof fetch);
    expect(out).toEqual(ok);
    const [url, init] = f.mock.calls[0];
    expect(String(url)).toContain('/api/website');
    expect(JSON.parse(init.body).query).toBe('typo tolerance');
  });

  it('throws the server error on a non-ok response', async () => {
    const f = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'capture failed' }) });
    await expect(requestWebsiteCapture('q', f as unknown as typeof fetch)).rejects.toThrow('capture failed');
  });
});
