/**
 * ConfidenceChip tests (static markup, no DOM — matches the lab's vitest `node`
 * environment). The chip is the per-answer Confidence surface: it shows a
 * "scoring…" placeholder while the judge is in flight, then the clickable
 * composite once a verdict lands, with a tone that goes weak on a tripped gate
 * and a "⚠ N flagged" tail when claims are flagged.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ConfidenceChip } from './ConfidenceChip';
import type { PanelJudgeResult } from '../types/chat';

function verdict(over: Partial<PanelJudgeResult> = {}): PanelJudgeResult {
  return {
    panelId: 'P1',
    perJudge: [],
    dims: { grounding: 8, coverage: 6, depth: 7, relevance: 8 },
    composite: 7.4,
    preGateScore: 7.4,
    gateTripped: false,
    borderline: false,
    flaggedClaims: [],
    rationale: 'solid',
    ...over,
  };
}

describe('ConfidenceChip', () => {
  it('renders nothing before the answer is judged and not scoring', () => {
    const html = renderToStaticMarkup(<ConfidenceChip onOpenJudge={() => {}} />);
    expect(html).toBe('');
  });

  it('shows a "scoring…" placeholder while the judge is in flight', () => {
    const html = renderToStaticMarkup(<ConfidenceChip scoring />);
    expect(html).toContain('confchip--scoring');
    expect(html).toContain('Confidence');
    expect(html).toContain('scoring');
    // The scoring state is non-interactive (no clickable button).
    expect(html).not.toContain('<button');
  });

  it('renders "Confidence N.N" as a clickable chip once the verdict lands', () => {
    const html = renderToStaticMarkup(
      <ConfidenceChip verdict={verdict({ composite: 7.4 })} onOpenJudge={() => {}} />,
    );
    expect(html).toContain('<button');
    expect(html).toContain('confchip--scored');
    expect(html).toContain('Confidence');
    expect(html).toContain('7.4');
  });

  it('maps a strong tone for a clean high score', () => {
    const html = renderToStaticMarkup(
      <ConfidenceChip verdict={verdict({ composite: 8.2 })} onOpenJudge={() => {}} />,
    );
    expect(html).toContain('is-strong');
  });

  it('forces a weak tone and shows the flagged tail when the grounding gate tripped', () => {
    const html = renderToStaticMarkup(
      <ConfidenceChip
        verdict={verdict({
          composite: 8.5,
          gateTripped: true,
          flaggedClaims: [
            { claim: 'x', reason: 'unsupported', certainty: 0.8 },
            { claim: 'y', reason: 'unsupported', certainty: 0.6 },
          ],
        })}
        onOpenJudge={() => {}}
      />,
    );
    // A high-but-ungrounded answer must never read green.
    expect(html).toContain('is-weak');
    expect(html).toContain('2 flagged');
  });

  it('disables the chip when no onOpenJudge handler is wired', () => {
    const html = renderToStaticMarkup(<ConfidenceChip verdict={verdict()} />);
    expect(html).toContain('disabled');
  });

  it('shows the winner star when isWinner is set', () => {
    const html = renderToStaticMarkup(
      <ConfidenceChip verdict={verdict()} isWinner onOpenJudge={() => {}} />,
    );
    expect(html).toContain('★');
  });

  it('renders the inline variant class for the header pill', () => {
    const html = renderToStaticMarkup(
      <ConfidenceChip variant="inline" verdict={verdict()} onOpenJudge={() => {}} />,
    );
    expect(html).toContain('confchip--inline');
  });
});
