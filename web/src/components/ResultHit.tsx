/** ResultHit — one ranked row in the keyword lane (title, url, snippet, rank #). */

interface Props {
  hit: Record<string, unknown>;
  rank: number;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v : undefined;
}

/** Pull a snippet from common content fields, trimmed for display. */
function snippet(hit: Record<string, unknown>): string | undefined {
  const raw =
    str(hit.summary) ??
    str(hit.description) ??
    str(hit.content) ??
    str(hit.excerpt) ??
    str(hit.text);
  if (!raw) return undefined;
  return raw.length > 220 ? `${raw.slice(0, 220)}…` : raw;
}

function prettyUrl(url?: string): string | undefined {
  if (!url) return undefined;
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

export function ResultHit({ hit, rank }: Props) {
  const title = str(hit.title) ?? str(hit.name) ?? str(hit.objectID) ?? 'Untitled';
  const url = str(hit.url) ?? str(hit.permalink);
  const snip = snippet(hit);

  return (
    <li className="hit">
      <span className="hit__rank" aria-hidden="true">
        {rank}
      </span>
      <div className="hit__body">
        {url ? (
          <a className="hit__title" href={url} target="_blank" rel="noopener noreferrer">
            {title}
          </a>
        ) : (
          <span className="hit__title">{title}</span>
        )}
        {url && <span className="hit__url">{prettyUrl(url)}</span>}
        {snip && <p className="hit__snip">{snip}</p>}
      </div>
    </li>
  );
}
