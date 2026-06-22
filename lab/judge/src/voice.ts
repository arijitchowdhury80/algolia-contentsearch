export interface VoiceResult { compliant: boolean; violations: string[] }

const CODE_BLOCK_RE = /```[\s\S]*?```/;
const DOC_BOT_OPENER_RE = /^\s*(to\s+[a-z]+\s|in\s+order\s+to\s|the\s+(?:[a-z]+\s+){1,4}(is|are|can|lets?|provides?|offers?|allows?|helps?)\s)/i;
const ALGOLIA_LINK_RE = /\]\(https?:\/\/(?:www\.)?algolia\.com[^\s)]*\)/i;
const MAX_WORDS = 400;
const MIN_WORDS_SUBSTANTIVE = 50;

export function validateVoice(
  persona: "maverick" | "elena" | "bruno",
  answer: string,
  opts: { substantive: boolean },
): VoiceResult {
  const violations: string[] = [];
  const words = answer.trim().split(/\s+/).filter(Boolean);

  if (persona === "maverick") {
    if (CODE_BLOCK_RE.test(answer)) violations.push("Code block present — Maverick is banned from code.");
    if (DOC_BOT_OPENER_RE.test(answer)) violations.push("Doc-bot opener detected — open with a value hook.");
    if (words.length > MAX_WORDS) violations.push(`Encyclopedic word count (${words.length} > ${MAX_WORDS}).`);
  }
  if (opts.substantive) {
    if (!ALGOLIA_LINK_RE.test(answer)) violations.push("No markdown algolia.com citation on a substantive answer.");
  }
  return { compliant: violations.length === 0, violations };
}
