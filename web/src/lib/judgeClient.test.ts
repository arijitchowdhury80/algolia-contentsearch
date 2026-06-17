import { describe, it, expect, vi } from 'vitest';
import { toJudgeSource, requestJudge, type JudgeResult } from './judgeClient';
import type { Source } from '../types/chat';

describe('toJudgeSource', () => {
  it('prefers chunk_text, then summary, then title for grounding text', () => {
    const withChunk: Source = { objectID: 'a', title: 'T', url: 'u', summary: 's', chunk_text: 'body' };
    expect(toJudgeSource(withChunk)).toMatchObject({ id: 'a', title: 'T', url: 'u', text: 'body' });

    const withSummary: Source = { objectID: 'b', title: 'T2', summary: 'sum' };
    expect(toJudgeSource(withSummary).text).toBe('sum');

    const titleOnly: Source = { objectID: 'c', title: 'OnlyT' };
    expect(toJudgeSource(titleOnly).text).toBe('OnlyT');
  });
});

describe('requestJudge', () => {
  const okResult: JudgeResult = {
    rounds: 2,
    panels: [
      { panelId: 'tuned', judges: [{ role: 'skeptic', score: 6, note: 'n' }], synthesizedScore: 5.9, preGateScore: 6.1, gateTripped: false, borderline: false, rationale: 'r' },
    ],
  };

  it('POSTs the request and returns the parsed result', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => okResult,
    });
    const out = await requestJudge(
      { question: 'q', panels: [{ panelId: 'tuned', answer: 'a', sources: [] }] },
      fetchImpl as unknown as typeof fetch,
    );
    expect(out).toEqual(okResult);
    const [, init] = fetchImpl.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body).question).toBe('q');
  });

  it('throws the server error message on a non-ok response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'question is required' }),
    });
    await expect(
      requestJudge({ question: '', panels: [] }, fetchImpl as unknown as typeof fetch),
    ).rejects.toThrow('question is required');
  });
});
