/**
 * followup — detect an agent's two-way clarifying question so the UI can surface
 * it as an elevated engagement affordance (FollowUpCallout) instead of burying it
 * in the answer prose (ADR-001 D4). Pure + dependency-free.
 *
 * Heuristic, deliberately conservative (reliability SOP — a misfiring parser is
 * worse than none):
 *   - A follow-up exists only when the answer's FINAL sentence ends with '?'.
 *     (A question buried mid-answer is not the engagement prompt.)
 *   - Quick-reply chips are extracted ONLY from a clean trailing "A or B[ or C]"
 *     enumeration of short options; anything messy yields no chips and the user
 *     simply types the reply into the composer. The question always shows.
 */
export interface FollowUp {
  /** The agent's trailing clarifying question (verbatim, trimmed). */
  question: string;
  /** Clean short quick-reply options, or [] when none could be safely extracted. */
  replies: string[];
}

/** Leading filler stripped from each extracted option to get to the noun. */
const LEAD = new Set([
  'a', 'an', 'the', 'for', 'with', 'to', 'your', 'you', 'is', 'it', 'are', 'do',
  'does', 'mean', 'using', 'build', 'building', 'want', 'case', 'use', 'or', 'on',
  'this', 'that', 'about', 'in', 'of',
]);

function cleanOption(raw: string): string {
  let toks = raw.trim().replace(/^[,:;\s]+|[?.!,:;\s]+$/g, '').split(/\s+/);
  while (toks.length > 1 && LEAD.has(toks[0].toLowerCase())) toks.shift();
  return toks.join(' ');
}

function extractOptions(question: string): string[] {
  const body = question.replace(/[?]+\s*$/, '').trim();
  if (!/\bor\b/i.test(body)) return [];

  // Split the trailing enumeration: "A or B" → [A,B]; "A, B, or C" → [A,B,C].
  const orParts = body.split(/\s+or\s+/i);
  if (orParts.length < 2) return [];
  const head = orParts.slice(0, -1).join(' or ');
  const tail = orParts[orParts.length - 1];
  const segments = [...head.split(/\s*,\s*/), tail];

  const opts = segments.map(cleanOption).filter(Boolean);
  if (opts.length < 2 || opts.length > 4) return [];
  // Reject anything that didn't reduce to a short, clean option.
  if (opts.some((o) => o.split(/\s+/).length > 3 || o.length > 28)) return [];
  return opts;
}

/** A clarifying question is short; longer than this is almost certainly a mis-split. */
const MAX_QUESTION_LEN = 240;

export function detectFollowUp(content: string): FollowUp | null {
  const text = (content ?? '').trim();
  if (!text.endsWith('?')) return null;

  // The final sentence is the question; anything before it is the answer body.
  // Caveat: the lookbehind needs whitespace after the delimiter, so abbreviations
  // ("U.S. or EU?") or no-space punctuation ("docs.Which?") can fold into one
  // segment. The length guard below keeps a bad split from surfacing a huge blob;
  // chips stay guarded regardless. Conservative by design (reliability SOP).
  const sentences = text.split(/(?<=[.?!])\s+/).map((s) => s.trim()).filter(Boolean);
  const question = sentences[sentences.length - 1];
  if (!question || !question.endsWith('?')) return null;
  // Guard against a stray "?" with no real question (e.g. "?" alone).
  if (question.replace(/[?\s]/g, '').length < 3) return null;
  // A genuine clarifying question is short; a long one means the split was wrong.
  if (question.length > MAX_QUESTION_LEN) return null;

  return { question, replies: extractOptions(question) };
}
