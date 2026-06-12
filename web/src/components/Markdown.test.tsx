/**
 * Markdown renderer tests — locks the inline/block contract, especially the
 * nested case (code inside bold) that previously leaked literal backticks.
 * Uses renderToStaticMarkup (react-dom, already a dep) — no DOM, no new libs.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Markdown } from './Markdown';

const html = (text: string) => renderToStaticMarkup(<Markdown text={text} />);

describe('Markdown', () => {
  it('renders **bold** as <strong> with no literal asterisks', () => {
    const out = html('Algolia is **fast**.');
    expect(out).toContain('<strong>fast</strong>');
    expect(out).not.toContain('*');
  });

  it('renders nested code inside bold (no leftover backticks or asterisks)', () => {
    const out = html('Enable **`getRankingInfo`** to inspect.');
    expect(out).toContain('<strong><code>getRankingInfo</code></strong>');
    expect(out).not.toContain('`');
    expect(out).not.toContain('*');
  });

  it('renders inline `code`', () => {
    const out = html('Use `removeWordsIfNoResults` here.');
    expect(out).toContain('<code>removeWordsIfNoResults</code>');
    expect(out).not.toContain('`');
  });

  it('does NOT treat underscores as italic (protects code identifiers)', () => {
    const out = html('The field _highlightResult is returned.');
    expect(out).toContain('_highlightResult');
    expect(out).not.toContain('<em>');
  });

  it('renders a markdown link', () => {
    const out = html('See [the docs](https://algolia.com/doc).');
    expect(out).toContain('href="https://algolia.com/doc"');
    expect(out).toContain('>the docs</a>');
  });

  it('linkifies a bare URL', () => {
    const out = html('Source: https://support.algolia.com/hc/x');
    expect(out).toContain('href="https://support.algolia.com/hc/x"');
  });

  it('renders bullet lists with inline markup inside items', () => {
    const out = html('- first **item**\n- second `code`');
    expect(out).toContain('<ul');
    expect(out).toContain('<li>first <strong>item</strong></li>');
    expect(out).toContain('<code>code</code>');
    expect(out).not.toContain('`');
  });

  it('renders numbered lists', () => {
    const out = html('1. one\n2. two');
    expect(out).toContain('<ol');
    expect(out).toContain('two');
  });

  it('renders headings as a heading paragraph (no leftover #)', () => {
    const out = html('## Section\nbody text');
    expect(out).toContain('md-h');
    expect(out).toContain('Section');
    expect(out).not.toContain('#');
  });

  it('separates paragraphs on blank lines', () => {
    const out = html('para one\n\npara two');
    const paraCount = (out.match(/md-p/g) ?? []).length;
    expect(paraCount).toBe(2);
  });
});
