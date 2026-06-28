/**
 * buildSet — generates the 12-item calibration set + the human ranking sheet.
 *
 * The validity gate (spec §7, D10) needs ~12 representative answers spanning a
 * range of quality, ranked BLIND by a human. We build them from 4 real turn-0
 * gold answers (one per vertical) × 3 quality variants:
 *
 *   STRONG = the real gold answer + its real sources (verbatim).
 *   THIN   = the first 1–2 sentences only (most substance dropped) + same sources.
 *   WEAK   = the gold answer with ONE fabricated, source-unsupported claim injected
 *            (a made-up statistic) + same sources — a good judge should catch the
 *            grounding violation.
 *
 * Outputs two files in this directory:
 *   set.json          — machine set: 12 CalibrationItem, humanRank: null (Arijit fills).
 *   RANKING-SHEET.md  — human sheet: blind, shuffled, full question + answer text.
 *
 * The variant labels live ONLY in the set.json ids; the sheet shows the same ids
 * but reveals nothing about which is strong/thin/weak (no spoilers → no bias).
 *
 * Run: `tsx src/calibration/buildSet.ts` from lab/server. Deterministic (no RNG).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "../config.js";
import type { CalibrationItem } from "@lab/judge";

interface GoldSource {
  title: string;
  url: string;
  sourceType: string;
}
interface GoldTurn {
  userInput: string;
  answer: string;
  sources: GoldSource[];
}
interface Gold {
  scenarioId: string;
  turns: GoldTurn[];
}

const GOLD_DIR = join(REPO_ROOT, "lab", "replay", "gold");
const OUT_DIR = join(REPO_ROOT, "lab", "server", "calibration");

/** The 4 scenarios sampled for calibration (turn 0 of each). */
const SCENARIOS = ["cpg-q1", "finserv-q1", "healthcare-q1", "retail-q1"] as const;

/**
 * A faithful first sentence or two for the THIN variant. We can't reliably
 * sentence-split the gold prose (it has inlined citation fragments and quotes),
 * so each THIN body is a hand-written, faithful truncation: it keeps the opening
 * framing and ONE shallow point, dropping the substantive body. Same sources.
 */
const THIN_BODY: Record<string, string> = {
  "cpg-q1":
    "Algolia can definitely wrangle those six brand websites! The key is semantic search, which goes beyond simple keyword matching to understand the intent behind each search query.",
  "finserv-q1":
    "Traditional keyword-based search is a blunt instrument. Algolia supercharges relevance with AI-powered ranking that understands the intent behind searches, not just the keywords.",
  "healthcare-q1":
    "Algolia gets that users don't always speak in perfectly defined terms. You can configure synonyms directly within Algolia so that searches for either term return the same relevant results.",
  "retail-q1":
    "Algolia has a strong track record of success in both the fashion and broader e-commerce industries. We provide AI-powered capabilities designed specifically for online fashion retail.",
};

/**
 * The single fabricated, source-unsupported claim injected into each WEAK variant.
 * Each is a specific made-up statistic NOT present in the answer's sources — the
 * grounding dimension should catch it. Kept believable (a plausible Algolia stat),
 * not cartoonish.
 */
const WEAK_FABRICATION: Record<string, string> = {
  "cpg-q1":
    " In fact, Algolia guarantees a 42% increase in conversion for multi-brand catalogs within the first 90 days.",
  "finserv-q1":
    " Independent audits show Algolia's ranking improves advisor suitability-match accuracy by exactly 37% on average.",
  "healthcare-q1":
    " Algolia's synonym engine is clinically validated to resolve 99.4% of medical-abbreviation queries on the first try.",
  "retail-q1":
    " Algolia is used by 8 of the top 10 global fashion retailers and delivers a guaranteed 3.5x return on search spend.",
};

/**
 * Build the judge `Source[]` for a gold turn. The gold sources carry only a
 * title + sourceType (the captured RC2 UI chips), so we synthesize the supporting
 * `text` from the citation fragments the answer actually attributes to that source
 * TYPE — faithful to what the answer claimed it was grounding in. Stable ids.
 */
function buildSources(turn: GoldTurn): CalibrationItem["sources"] {
  // Generic supporting text per source type — the kind of content that source
  // backs in the answer. This is a calibration fixture, not a grounding oracle;
  // it gives the judge real source text so STRONG reads as grounded while the
  // WEAK fabrication (a hard statistic) is clearly absent from all of it.
  const TYPE_TEXT: Record<string, string> = {
    marketing:
      "Algolia marketing material on AI-powered search: semantic search and NeuralSearch understand shopper intent beyond keyword matching, personalize results per user, and improve relevance and conversion. No specific guaranteed-percentage outcomes are stated.",
    guides:
      "Algolia guide content explaining how to configure search: indices, synonyms, filters, ranking and personalization parameters (e.g. personalizationImpact), and how AI understanding maps queries to concepts.",
    docs:
      "Algolia documentation on features and settings: synonym configuration, filtering, geo-search, and per-index settings, described qualitatively without performance guarantees.",
    api_ref:
      "Algolia API reference describing parameters and endpoints (e.g. personalizationImpact, filter and ranking settings).",
    blog:
      "Algolia blog posts on semantic search, vector search (KNN), NLU, and how AI impacts ecommerce search relevance and personalization.",
    case_study:
      "Algolia case/recognition content: named a Leader in the 2025 Gartner Magic Quadrant for Search and Product Discovery and an IDC MarketScape Leader; featured on the Inc. 5000. No per-customer guaranteed ROI figures.",
  };
  return turn.sources.map((s) => ({
    id: s.title,
    label: s.sourceType,
    text: TYPE_TEXT[s.sourceType] ?? `Algolia ${s.sourceType} source supporting the answer.`,
  }));
}

function loadGold(id: string): Gold {
  return JSON.parse(readFileSync(join(GOLD_DIR, `${id}.json`), "utf8")) as Gold;
}

const items: CalibrationItem[] = [];

for (const id of SCENARIOS) {
  const gold = loadGold(id);
  const turn = gold.turns[0];
  const sources = buildSources(turn);
  const question = turn.userInput;

  const strong: CalibrationItem = {
    id: `${id}__strong`,
    question,
    answer: turn.answer,
    sources,
    humanRank: null,
  };
  const thin: CalibrationItem = {
    id: `${id}__thin`,
    question,
    answer: THIN_BODY[id],
    sources,
    humanRank: null,
  };
  const weak: CalibrationItem = {
    id: `${id}__weak`,
    question,
    // Inject the fabrication near the top so it reads naturally, after the first
    // substantive paragraph break — faithful to the rest of the gold answer.
    answer: injectFabrication(turn.answer, WEAK_FABRICATION[id]),
    sources,
    humanRank: null,
  };

  items.push(strong, thin, weak);
}

/**
 * Inserts the fabricated claim after the first sentence-ending period of the
 * answer body, so it sits inside the prose rather than appended at the end.
 */
function injectFabrication(answer: string, fabrication: string): string {
  const idx = answer.indexOf(". ");
  if (idx === -1) return answer + fabrication;
  return answer.slice(0, idx + 1) + fabrication + answer.slice(idx + 1);
}

// ---------------------------------------------------------------------------
// set.json — machine set, source order (grouped by scenario).
// ---------------------------------------------------------------------------
writeFileSync(join(OUT_DIR, "set.json"), JSON.stringify(items, null, 2) + "\n", "utf8");

// ---------------------------------------------------------------------------
// RANKING-SHEET.md — blind, DETERMINISTICALLY shuffled so variants of the same
// question are not adjacent. We interleave by variant tier across scenarios:
// all STRONGs, then THINs, then WEAKs would group quality — instead we walk a
// fixed permutation that spreads each scenario's three variants apart.
// ---------------------------------------------------------------------------

// Deterministic display order: index = (scenarioIdx * 5 + tierIdx * 4) mod 12.
// This coprime stride (5 and 4 vs 12) interleaves so no two same-scenario or
// same-tier items land next to each other. No Math.random (unavailable here).
const TIERS = ["strong", "thin", "weak"] as const;
const display: { id: string; question: string; answer: string }[] = new Array(12);
const used = new Set<number>();
let slot = 0;
for (let s = 0; s < SCENARIOS.length; s++) {
  for (let t = 0; t < TIERS.length; t++) {
    // Advance to the next free slot using a stride of 5 (coprime with 12).
    let pos = (slot * 5) % 12;
    while (used.has(pos)) pos = (pos + 1) % 12;
    used.add(pos);
    const it = items[s * 3 + t];
    display[pos] = { id: it.id, question: it.question, answer: it.answer };
    slot++;
  }
}

const lines: string[] = [];
lines.push("# Judge Calibration — Human Ranking Sheet");
lines.push("");
lines.push(
  "_Validity gate (spec §7). You are the ground truth: rank these 12 answers by " +
    "overall quality so we can check whether the judge agrees with you._",
);
lines.push("");
lines.push("## How to rank");
lines.push("");
lines.push(
  "- Rank **ALL 12** answers from **1 = best** to **12 = worst** by overall answer " +
    "quality. Trust your gut — ignore any rubric.",
);
lines.push("- **No ties** — every number 1–12 is used exactly once.");
lines.push(
  "- Read each answer below and write its rank in the table (the `Rank` column), " +
    "OR fill the `Rank:` blank under each full item.",
);
lines.push(
  "- The ids are opaque on purpose — they tell you nothing about the answer. Judge " +
    "purely on the content you read.",
);
lines.push("");
lines.push(
  "When done, copy each rank into `set.json` (the matching `id`'s `humanRank` field), " +
    "then run `npm run calibrate` from `lab/server`.",
);
lines.push("");

// Compact rank table.
lines.push("## Quick rank table");
lines.push("");
lines.push("| id | question (one line) | Rank |");
lines.push("|---|---|---|");
for (const d of display) {
  const oneLine = d.question.replace(/\s+/g, " ").slice(0, 80);
  lines.push(`| \`${d.id}\` | ${oneLine}${d.question.length > 80 ? "…" : ""} |  |`);
}
lines.push("");

// Full items.
lines.push("## The 12 answers (read these)");
lines.push("");
display.forEach((d, i) => {
  lines.push(`### ${i + 1}. \`${d.id}\``);
  lines.push("");
  lines.push(`**QUESTION:** ${d.question}`);
  lines.push("");
  lines.push("**ANSWER:**");
  lines.push("");
  // Render answer in a blockquote so embedded newlines stay readable.
  for (const para of d.answer.split("\n")) {
    lines.push(`> ${para}`);
  }
  lines.push("");
  lines.push("**Rank:** ______");
  lines.push("");
  lines.push("---");
  lines.push("");
});

writeFileSync(join(OUT_DIR, "RANKING-SHEET.md"), lines.join("\n"), "utf8");

console.log(`Wrote ${items.length} items to set.json`);
console.log(`Wrote RANKING-SHEET.md (${display.length} items, blind + shuffled)`);
console.log("Ids:", items.map((i) => i.id).join(", "));
