/**
 * Markdown — a tiny, dependency-free, XSS-safe renderer for agent answers.
 *
 * Agents emit Markdown (headings, bold, italic, inline code, links, lists). We
 * render the common subset WITHOUT a library (decision #10 caps runtime deps at
 * algoliasearch + React). Text only ever becomes text nodes or <a> elements —
 * no dangerouslySetInnerHTML, so no injection surface.
 *
 * Deliberately does NOT treat `_` as italic, so code identifiers like
 * `removeWordsIfNoResults` render intact.
 */
import type { ReactNode } from 'react';

// Order matters: bold (**) before italic (*) so `**x**` isn't mis-split.
const INLINE_PATTERN =
  '(?<bold>\\*\\*[^*]+\\*\\*)|(?<italic>\\*[^*\\n]+\\*)|(?<code>`[^`]+`)|(?<link>\\[[^\\]]+\\]\\(https?://[^\\s)]+\\))|(?<url>https?://[^\\s)]+)';

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;
  // Fresh regex per call: renderInline recurses (code inside bold), and a
  // shared global-flag regex would have its lastIndex clobbered by the recursion.
  const re = new RegExp(INLINE_PATTERN, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const matchStart = m.index;
    const matchEnd = re.lastIndex;
    if (matchStart > last) nodes.push(text.slice(last, matchStart));
    const g = m.groups!;
    if (g.bold) {
      // Recurse so nested markup (e.g. `code` inside **bold**) renders too.
      nodes.push(<strong key={key++}>{renderInline(g.bold.slice(2, -2))}</strong>);
    } else if (g.italic) {
      nodes.push(<em key={key++}>{renderInline(g.italic.slice(1, -1))}</em>);
    } else if (g.code) {
      nodes.push(<code key={key++}>{g.code.slice(1, -1)}</code>);
    } else if (g.link) {
      const sep = g.link.indexOf('](');
      const label = g.link.slice(1, sep);
      const href = g.link.slice(sep + 2, -1);
      nodes.push(
        <a key={key++} href={href} target="_blank" rel="noopener noreferrer">
          {label}
        </a>,
      );
    } else if (g.url) {
      nodes.push(
        <a key={key++} href={g.url} target="_blank" rel="noopener noreferrer">
          {g.url}
        </a>,
      );
    }
    last = matchEnd;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

const BULLET = /^\s*[-*]\s+/;
const ORDERED = /^\s*\d+\.\s+/;
const HEADING = /^\s*#{1,6}\s+/;

export function Markdown({ text }: { text: string }) {
  const lines = text.split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    if (HEADING.test(line)) {
      blocks.push(
        <p key={key++} className="md-h">
          {renderInline(line.replace(HEADING, ''))}
        </p>,
      );
      i++;
      continue;
    }
    if (BULLET.test(line)) {
      const items: string[] = [];
      while (i < lines.length && BULLET.test(lines[i])) {
        items.push(lines[i].replace(BULLET, ''));
        i++;
      }
      blocks.push(
        <ul key={key++} className="md-list">
          {items.map((it, j) => (
            <li key={j}>{renderInline(it)}</li>
          ))}
        </ul>,
      );
      continue;
    }
    if (ORDERED.test(line)) {
      const items: string[] = [];
      while (i < lines.length && ORDERED.test(lines[i])) {
        items.push(lines[i].replace(ORDERED, ''));
        i++;
      }
      blocks.push(
        <ol key={key++} className="md-list">
          {items.map((it, j) => (
            <li key={j}>{renderInline(it)}</li>
          ))}
        </ol>,
      );
      continue;
    }
    // Paragraph: gather consecutive non-blank, non-block lines.
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !BULLET.test(lines[i]) &&
      !ORDERED.test(lines[i]) &&
      !HEADING.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(
      <p key={key++} className="md-p">
        {renderInline(para.join(' '))}
      </p>,
    );
  }

  return <>{blocks}</>;
}
