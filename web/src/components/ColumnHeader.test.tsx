/**
 * ColumnHeader score-pill tests (static markup, no DOM). The pill carries the
 * numeral (never colour alone), maps tone by score, forces weak on a tripped
 * gate, and is absent before a verdict exists.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ColumnHeader } from './ColumnHeader';
import type { AgentColumnConfig } from '../config/columns';

// ColumnHeader is a dormant pre-refactor component (not rendered by the 2×2
// App); these tests still exercise its pure score-pill markup. The config uses
// the 2×2 model's P1 panel + AC2 index naming so it doesn't reference the dead
// 3-panel ids.
const config: AgentColumnConfig = {
  id: 'P1',
  kind: 'agent',
  title: 'P1 · Single · Keyword',
  indexLabel: 'AC2_WWW_SINGLE_KEYWORD',
  agentLabel: 'Single · Keyword',
  appName: 'CENTRAL (0EXRPAXB56)',
  readOnly: false,
  pipeline: 'pipeline',
  accentVar: '--accent-p1',
  proves: 'proves',
  appId: 'APP',
  searchKey: 'KEY',
  agentId: 'AGENT',
  indexName: 'AC2_WWW_SINGLE_KEYWORD',
};

describe('ColumnHeader score pill', () => {
  it('shows no score pill before a verdict exists', () => {
    const html = renderToStaticMarkup(<ColumnHeader config={config} statusTone="idle" statusLabel="Ready" />);
    expect(html).not.toContain('lane-score');
  });

  it('renders the numeral and a strong tone for a clean high score', () => {
    const html = renderToStaticMarkup(
      <ColumnHeader
        config={config}
        statusTone="success"
        statusLabel="Answered"
        score={{ score: 7.9, gateTripped: false, borderline: false }}
      />,
    );
    expect(html).toContain('lane-score is-strong');
    expect(html).toContain('7.9');
    expect(html).toContain('/10');
  });

  it('forces a weak tone when the grounding gate tripped', () => {
    const html = renderToStaticMarkup(
      <ColumnHeader
        config={config}
        statusTone="info"
        statusLabel="Refused"
        score={{ score: 8.5, gateTripped: true, borderline: false }}
      />,
    );
    expect(html).toContain('lane-score is-weak');
    expect(html).toContain('gated');
  });

  it('disables the pill trigger when no onOpenAnalysis is wired', () => {
    const html = renderToStaticMarkup(
      <ColumnHeader
        config={config}
        statusTone="success"
        statusLabel="Answered"
        score={{ score: 6, gateTripped: false, borderline: false }}
      />,
    );
    expect(html).toContain('disabled');
  });
});
