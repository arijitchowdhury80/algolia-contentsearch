/**
 * JudgeDrawer tests (static markup, no DOM). Confirms the Phase-4 contract:
 *   - composite is labeled "Confidence" (spec 2026-06-27 D7)
 *   - the four dimension bars are Grounding / Coverage / Depth / Relevance,
 *     in that order (D2)
 *   - flagged claims surface the per-claim `certainty` as a percent
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { JudgeDrawer } from './JudgeDrawer';
import type { PanelJudgeResult } from '../types/chat';
import type { PanelConfig } from '../config/columns';

const config: PanelConfig = {
  id: 'P1',
  arch: 'single',
  retrieval: 'keyword',
  indexName: 'AC2_WWW_SINGLE_KEYWORD',
  label: 'P1 · Single · Keyword',
  appId: 'APP',
  searchKey: 'KEY',
  accentVar: '--accent-p1',
  proves: 'baseline',
  pipeline: 'pipeline',
};

function verdict(over: Partial<PanelJudgeResult> = {}): PanelJudgeResult {
  return {
    panelId: 'P1',
    perJudge: [
      { role: 'skeptic', score: 7.0, note: 'strict' },
      { role: 'referee', score: 7.6, note: 'useful' },
      { role: 'advocate', score: 7.8, note: 'deep' },
    ],
    dims: { grounding: 8, coverage: 6, depth: 7, relevance: 8 },
    composite: 7.4,
    preGateScore: 7.4,
    gateTripped: false,
    borderline: false,
    flaggedClaims: [],
    rationale: 'solid answer',
    ...over,
  };
}

function render(over: Partial<PanelJudgeResult> = {}): string {
  return renderToStaticMarkup(
    <JudgeDrawer
      open
      pinned={false}
      width={380}
      onToggleOpen={() => {}}
      onTogglePin={() => {}}
      onResizeStart={() => {}}
      panelVerdict={verdict(over)}
      panelConfig={config}
      mode="live"
    />,
  );
}

describe('JudgeDrawer composite', () => {
  it('labels the composite "Confidence"', () => {
    const html = render();
    expect(html).toContain('Confidence');
    expect(html).toContain('7.4');
  });
});

describe('JudgeDrawer dimensions', () => {
  it('renders all four dimension labels', () => {
    const html = render();
    for (const label of ['Grounding', 'Coverage', 'Depth', 'Relevance']) {
      expect(html).toContain(label);
    }
  });

  it('orders the dimension BARS grounding → coverage → depth → relevance', () => {
    const html = render();
    // Match the bar labels specifically (class `dimbar__label`) so tooltip copy
    // elsewhere in the drawer doesn't pollute the ordering check.
    const labels = [...html.matchAll(/dimbar__label">([^<]+)</g)].map((m) => m[1]);
    expect(labels).toEqual(['Grounding', 'Coverage', 'Depth', 'Relevance']);
  });

  it('does not render a legacy "Breadth" or stand-alone confidence dimension', () => {
    const html = render();
    expect(html).not.toContain('Breadth');
  });
});

describe('JudgeDrawer flagged claims', () => {
  it('shows the per-claim certainty as a percent when the gate trips', () => {
    const html = render({
      gateTripped: true,
      flaggedClaims: [
        { claim: 'Algolia caps you at 1000 records', reason: 'no source backs this', certainty: 0.78 },
      ],
    });
    expect(html).toContain('78% certainty');
    // The old "k/3 judges" per-claim copy is gone from the claim card.
    expect(html).not.toContain('/3 judges');
  });
});
