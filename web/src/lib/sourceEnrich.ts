/**
 * sourceEnrich — recover real source URLs on the client.
 *
 * The /api/answer payload's `sources` carry a title but an EMPTY url (the backend
 * doesn't yet pass each hit's url/facet). Without a url the source pills can't be
 * grouped by topic (everything falls into one bucket → a single "N sources" pill)
 * and the dropdown items aren't clickable.
 *
 * But the answer markdown DOES cite its sources as `[title](url)`. We parse those
 * citations and back-fill the url onto any source whose title matches — so the
 * pills can group by content category and every row becomes a real link. Pure;
 * frontend-only; works against the current backend (no redeploy needed).
 */
import type { AnswerSource } from '../types/chat';

/** Map each cited link's text → url (first occurrence wins), lower-cased keys. */
function citationMap(markdown: string): Map<string, string> {
  const map = new Map<string, string>();
  const re = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    const text = m[1].trim().toLowerCase();
    if (text && !map.has(text)) map.set(text, m[2]);
  }
  return map;
}

/** Back-fill missing urls on sources by matching title → a cited link in the answer. */
export function enrichSourcesWithUrls(
  sources: AnswerSource[],
  answerMarkdown: string,
): AnswerSource[] {
  if (!answerMarkdown) return sources;
  const map = citationMap(answerMarkdown);
  if (map.size === 0) return sources;
  return sources.map((s) => {
    if (s.url) return s;
    const key = (s.title || '').trim().toLowerCase();
    const url = key ? map.get(key) : undefined;
    return url ? { ...s, url } : s;
  });
}

/** Short, human "where it goes" label for a url: host + first path segment. */
export function domainLabel(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    const seg = u.pathname.split('/').filter(Boolean)[0];
    return seg ? `${host}/${seg}` : host;
  } catch {
    return url;
  }
}
