/**
 * sources — pure grouping/classification of answer citations for the grouped
 * source-pills UI (ADR-001 D3).
 *
 * No DOM, no React. Classify each Source by type (its `source_type` if present,
 * else inferred from the URL — the live Agent Studio `a:` hits do NOT carry a
 * source_type, so URL inference is the real path here), bucket into ordered
 * non-empty groups, dedup within each group. Tested without a browser.
 */
import type { Source } from '../types/chat';

export interface SourceGroupMeta {
  key: string;
  label: string;
  /** Emoji glyph — paired with the label, never the sole signal. */
  icon: string;
  /** CSS custom-property name for the pill accent (tokens.css). */
  accentVar: string;
}

export interface SourceGroup extends SourceGroupMeta {
  sources: Source[];
}

/** Display order + presentation for known source types. Unknown → 'other'. */
const GROUP_META: SourceGroupMeta[] = [
  { key: 'doc', label: 'Docs', icon: '📄', accentVar: '--algolia-blue' },
  { key: 'guide', label: 'Guides', icon: '📘', accentVar: '--accent-cyan' },
  { key: 'api', label: 'API', icon: '⚙️', accentVar: '--accent-purple' },
  { key: 'blog', label: 'Blog', icon: '📝', accentVar: '--accent-pink' },
  { key: 'customer_story', label: 'Cases', icon: '🏆', accentVar: '--accent-green' },
  { key: 'academy', label: 'Academy', icon: '🎓', accentVar: '--accent-coral' },
  { key: 'support', label: 'Support', icon: '💬', accentVar: '--accent-yellow' },
  { key: 'other', label: 'Other', icon: '🔗', accentVar: '--gray-400' },
];

const META_BY_KEY: Record<string, SourceGroupMeta> = Object.fromEntries(
  GROUP_META.map((m) => [m.key, m]),
);

/** Normalize an arbitrary source_type string to a known group key, else ''. */
function normalizeType(t: string | undefined): string {
  if (!t) return '';
  const k = t.toLowerCase().trim();
  if (META_BY_KEY[k]) return k;
  if (k === 'documentation' || k === 'docs') return 'doc';
  if (k === 'case' || k === 'case_study' || k === 'customer') return 'customer_story';
  if (k === 'help' || k === 'faq') return 'support';
  if (k === 'tutorial' || k === 'guides') return 'guide';
  return '';
}

/**
 * Infer a group key from a URL when source_type is absent. Checks the host
 * (subdomains like academy./blog./support.) then the path, most-specific first.
 * `/doc` is matched before `/guide` so docs URLs like /doc/guides/... stay docs.
 */
function inferFromUrl(url: string | undefined): string {
  if (!url) return '';
  let host = '';
  let path = url.toLowerCase();
  try {
    const u = new URL(url);
    host = u.hostname.toLowerCase();
    path = u.pathname.toLowerCase();
  } catch {
    /* not a full URL — match against the raw string as a path */
  }
  // Host-based (subdomains)
  if (host.startsWith('academy.')) return 'academy';
  if (host.startsWith('blog.')) return 'blog';
  if (host.startsWith('support.') || host.startsWith('help.')) return 'support';
  // Path-based, most specific first
  if (path.includes('/blog')) return 'blog';
  if (path.includes('/academy')) return 'academy';
  if (path.includes('/customers') || path.includes('/case-stud')) return 'customer_story';
  if (path.includes('/doc')) return 'doc'; // /doc/guides/... = docs
  if (path.includes('/api') || path.includes('/rest')) return 'api';
  if (path.includes('/support') || path.includes('/help') || path.includes('/faq')) return 'support';
  if (path.includes('/guide')) return 'guide';
  return '';
}

/** Classify one source → a known group key (always returns a valid key). */
export function classifySource(s: Source): string {
  return normalizeType(s.source_type) || inferFromUrl(s.url ?? s.doc_url) || 'other';
}

/** A stable dedup identity for a source. */
function sourceKey(s: Source): string {
  return (s.url ?? s.doc_url ?? s.objectID ?? s.title ?? s.doc_title ?? '').toLowerCase();
}

/** True when a source has something to show or link. */
function hasContent(s: Source): boolean {
  return Boolean((s.url ?? s.doc_url) || (s.title ?? s.doc_title));
}

/**
 * Group sources by type into ordered, non-empty groups, deduped within each
 * group (first occurrence wins, order preserved). Sources with neither a URL
 * nor a title are dropped (nothing to show).
 */
export function groupSources(sources: Source[]): SourceGroup[] {
  const buckets = new Map<string, { sources: Source[]; seen: Set<string> }>();
  for (const s of sources) {
    if (!hasContent(s)) continue;
    const key = classifySource(s);
    let b = buckets.get(key);
    if (!b) {
      b = { sources: [], seen: new Set() };
      buckets.set(key, b);
    }
    const id = sourceKey(s);
    if (id && b.seen.has(id)) continue;
    if (id) b.seen.add(id);
    b.sources.push(s);
  }
  return GROUP_META.filter((m) => buckets.has(m.key)).map((m) => ({
    ...m,
    sources: buckets.get(m.key)!.sources,
  }));
}

/** Total deduped source count across groups. */
export function totalSources(groups: SourceGroup[]): number {
  return groups.reduce((n, g) => n + g.sources.length, 0);
}

/** Display helpers (handle rc2/Atlas field shape). */
export function sourceTitle(s: Source): string {
  return s.title ?? s.doc_title ?? s.url ?? s.doc_url ?? 'Source';
}
export function sourceUrl(s: Source): string | undefined {
  return s.url ?? s.doc_url;
}
export function sourceSummary(s: Source): string | undefined {
  return s.summary ?? s.doc_summary ?? s.chunk_text;
}
