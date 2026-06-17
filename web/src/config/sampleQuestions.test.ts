import { describe, it, expect } from 'vitest';
import { SAMPLE_CATEGORIES, SAMPLE_QUESTION_COUNT } from './sampleQuestions';

describe('sampleQuestions config', () => {
  it('has 8 categories', () => {
    expect(SAMPLE_CATEGORIES).toHaveLength(8);
  });

  it('counts every question (27 in the locked v2 set)', () => {
    const total = SAMPLE_CATEGORIES.reduce((n, c) => n + c.questions.length, 0);
    expect(SAMPLE_QUESTION_COUNT).toBe(total);
    expect(SAMPLE_QUESTION_COUNT).toBe(27);
  });

  it('every question has an id, a label, and a full prompt', () => {
    for (const c of SAMPLE_CATEGORIES) {
      for (const q of c.questions) {
        expect(q.id).toBeTruthy();
        expect(q.label.trim().length).toBeGreaterThan(0);
        expect(q.prompt.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('the multi-turn category carries a follow-up on every question', () => {
    const multi = SAMPLE_CATEGORIES.find((c) => c.key === 'multiturn')!;
    expect(multi.questions.length).toBe(6);
    expect(multi.questions.every((q) => !!q.followUp)).toBe(true);
  });

  it('question ids and prompts are unique', () => {
    const ids = SAMPLE_CATEGORIES.flatMap((c) => c.questions.map((q) => q.id));
    const prompts = SAMPLE_CATEGORIES.flatMap((c) => c.questions.map((q) => q.prompt));
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(prompts).size).toBe(prompts.length);
  });
});
