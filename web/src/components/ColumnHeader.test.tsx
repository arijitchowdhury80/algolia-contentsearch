/**
 * ColumnHeader score-pill tests (static markup, no DOM). The pill carries the
 * numeral (never colour alone), maps tone by score, forces weak on a tripped
 * gate, and is absent before a verdict exists.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ColumnHeader } from './ColumnHeader';
import type { AgentColumnConfig } from '../config/columns';

const config: AgentColumnConfig = {
  id: 'tuned',
  kind: 'agent',
  title: '③ Our System',
  indexLabel: 'visibility_www_tuned',
  agentLabel: 'Our System',
  appName: 'Our build app',
  readOnly: false,
  pipeline: 'pipeline',
  accentVar: '--algolia-blue',
  proves: 'proves',
  appId: 'APP',
  searchKey: 'KEY',
  agentId: 'AGENT',
  indexName: 'visibility_www_tuned',
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
