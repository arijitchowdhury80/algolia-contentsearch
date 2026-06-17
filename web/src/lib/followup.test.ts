import { describe, it, expect } from 'vitest';
import { detectFollowUp } from './followup';

describe('detectFollowUp', () => {
  it('returns null when the answer does not end in a question', () => {
    expect(detectFollowUp('Algolia supports typo tolerance out of the box.')).toBeNull();
  });

  it('returns null when a question is buried mid-answer but the end is a statement', () => {
    expect(
      detectFollowUp('Are you on the latest plan? Here is how typo tolerance works in detail.'),
    ).toBeNull();
  });

  it('detects a trailing clarifying question as the engagement prompt', () => {
    const fu = detectFollowUp(
      'Algolia handles this in a few ways. Which area should I focus on first?',
    );
    expect(fu).not.toBeNull();
    expect(fu!.question).toBe('Which area should I focus on first?');
  });

  it('extracts clean quick-reply chips from a trailing "A or B" enumeration', () => {
    const fu = detectFollowUp('Happy to help. Are you building for ecommerce or documentation?');
    expect(fu!.replies).toEqual(['ecommerce', 'documentation']);
  });

  it('extracts a three-way "A, B, or C" enumeration', () => {
    const fu = detectFollowUp('Got it. Is this for search, recommendations, or analytics?');
    expect(fu!.replies).toEqual(['search', 'recommendations', 'analytics']);
  });

  it('yields no chips for a messy / long question (conservative — user types the reply)', () => {
    const fu = detectFollowUp(
      'I can go deeper. Do you want speed, or should I explain the ranking formula in depth?',
    );
    expect(fu!.replies).toEqual([]);
  });

  it('yields no chips for an open (non-enumerated) question but still surfaces it', () => {
    const fu = detectFollowUp('Sure. What is your primary use case?');
    expect(fu!.question).toBe('What is your primary use case?');
    expect(fu!.replies).toEqual([]);
  });

  it('ignores a lone stray question mark', () => {
    expect(detectFollowUp('Here is the answer. ?')).toBeNull();
  });

  it('ignores an over-long trailing "question" (a bad sentence split, not a clarifier)', () => {
    const blob = `Here is a very long run-on that never broke into sentences ${'and kept going '.repeat(20)}so what now?`;
    expect(detectFollowUp(blob)).toBeNull();
  });
});
