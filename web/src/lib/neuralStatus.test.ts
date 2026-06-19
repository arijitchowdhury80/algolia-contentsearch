import { describe, it, expect } from 'vitest';
import { parseNeuralStatus, isNeuralPending, fetchNeuralStatus } from './neuralStatus';

describe('parseNeuralStatus', () => {
  it('extracts a well-formed neural map', () => {
    const body = { ok: true, neural: { AC2_WWW_SINGLE_NEURAL: true, AC2_WWW_MULTI_NEURAL: false } };
    expect(parseNeuralStatus(body)).toEqual({
      AC2_WWW_SINGLE_NEURAL: true,
      AC2_WWW_MULTI_NEURAL: false,
    });
  });

  it('drops non-boolean values', () => {
    const body = { neural: { A: true, B: 'yes', C: 1 } };
    expect(parseNeuralStatus(body)).toEqual({ A: true });
  });

  it('returns {} for a missing neural field (old backend)', () => {
    expect(parseNeuralStatus({ ok: true })).toEqual({});
  });

  it('returns {} for malformed / non-object bodies', () => {
    expect(parseNeuralStatus(null)).toEqual({});
    expect(parseNeuralStatus('nope')).toEqual({});
    expect(parseNeuralStatus({ neural: 'x' })).toEqual({});
    expect(parseNeuralStatus({ neural: null })).toEqual({});
  });
});

describe('isNeuralPending', () => {
  const live: Record<string, boolean> = { IX_N: true };
  const off: Record<string, boolean> = { IX_N: false };

  it('is never pending for keyword panels', () => {
    expect(isNeuralPending('keyword', 'IX_K', {})).toBe(false);
    expect(isNeuralPending('keyword', 'IX_K', off)).toBe(false);
  });

  it('is pending for a neural panel whose index is not yet live', () => {
    expect(isNeuralPending('neural', 'IX_N', off)).toBe(true);
    expect(isNeuralPending('neural', 'IX_N', {})).toBe(true); // unknown → conservative
  });

  it('clears once the index reports live (self-healing)', () => {
    expect(isNeuralPending('neural', 'IX_N', live)).toBe(false);
  });
});

describe('fetchNeuralStatus', () => {
  const ok = (json: unknown): typeof fetch =>
    (async () => ({ ok: true, json: async () => json })) as unknown as typeof fetch;

  it('parses the neural map from a successful /health', async () => {
    const f = ok({ ok: true, neural: { IX: true } });
    expect(await fetchNeuralStatus(f)).toEqual({ IX: true });
  });

  it('returns {} on a non-ok response', async () => {
    const f = (async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch;
    expect(await fetchNeuralStatus(f)).toEqual({});
  });

  it('returns {} when the fetch throws (backend down)', async () => {
    const f = (async () => { throw new Error('network'); }) as unknown as typeof fetch;
    expect(await fetchNeuralStatus(f)).toEqual({});
  });
});
