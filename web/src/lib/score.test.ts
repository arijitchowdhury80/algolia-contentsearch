import { describe, it, expect } from 'vitest';
import { scoreTone, laneTone } from './score';

describe('scoreTone', () => {
  it('maps by threshold: ≥7.5 strong, ≥5 mid, else weak', () => {
    expect(scoreTone(9)).toBe('is-strong');
    expect(scoreTone(7.5)).toBe('is-strong');
    expect(scoreTone(7.4)).toBe('is-mid');
    expect(scoreTone(5)).toBe('is-mid');
    expect(scoreTone(4.9)).toBe('is-weak');
    expect(scoreTone(0)).toBe('is-weak');
  });
});

describe('laneTone', () => {
  it('follows the score when grounding is clean', () => {
    expect(laneTone({ score: 8, gateTripped: false, borderline: false })).toBe('is-strong');
    expect(laneTone({ score: 6, gateTripped: false, borderline: false })).toBe('is-mid');
  });

  it('forces weak when the grounding gate tripped, even on a high score', () => {
    expect(laneTone({ score: 9, gateTripped: true, borderline: false })).toBe('is-weak');
  });
});
