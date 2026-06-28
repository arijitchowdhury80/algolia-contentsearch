/**
 * buildCalibrationSet — turn the REAL captured (question, answer, sources-with-text)
 * triples into a FAIR 12-item judge calibration set (spec §7, D10).
 *
 * Three variants per question, by construction quality:
 *   strong = the real answer + its real sources (verbatim) — tier 1 (best).
 *   thin   = the real answer truncated to ~1-2 sentences + same sources — tier 2.
 *   weak   = the real answer + ONE injected fabricated, source-unsupported stat
 *            (a specific fake number) + same sources — tier 3 (worst; the
 *            fabrication SHOULD be caught by the grounding gate).
 *
 * humanRank is the CONSTRUCT order (the gate correlates against this): all strong
 * items rank above all thin items above all weak items, deterministic within a
 * tier by question order. We also (re)write RANKING-SHEET.md + key.json for any
 * later optional blind human pass.
 *
 * Run: npx tsx src/buildCalibrationSet.ts /tmp/captured-real.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "../config.js";

interface CapturedSource {
  id: string;
  text: string;
  label?: string;
}
interface Captured {
  question: string;
  answer: string;
  sources: CapturedSource[];
}
interface CalibrationItem {
  id: string;
  question: string;
  answer: string;
  sources: CapturedSource[];
  humanRank: number | null;
}

// A distinct, specific, source-unsupported fabricated statistic per question.
// Each is a hard fake: a precise number NOT in any captured source, phrased as a
// guarantee, so the grounding gate has a clear claim to flag.
const FABRICATIONS: Record<string, string> = {
  "cpg-q1":
    " Independent benchmarks confirm Algolia's multi-brand setup guarantees a 42% conversion lift within the first 90 days across all connected catalogs.",
  "finserv-q1":
    " In regulated finserv deployments, Algolia's business-signal ranking is certified to improve advisor suitability-match accuracy by exactly 58.3%, a figure audited annually by FINRA.",
  "healthcare-q1":
    " Algolia's medical-synonym engine is FDA-cleared and proven to reduce clinician mis-retrieval of drug terms by 73% in peer-reviewed trials.",
  "retail-q1":
    " Across every fashion client, Algolia delivers a guaranteed 5.1x return on ad spend and a documented 91% reduction in cart abandonment within one quarter.",
};

/** Truncate an answer to its first 1-2 sentences (the "thin" variant). */
function truncateToSentences(answer: string, maxSentences = 2): string {
  // Normalise whitespace then take the first maxSentences sentence-ending runs.
  const flat = answer.replace(/\s+/g, " ").trim();
  const parts = flat.match(/[^.!?]+[.!?]+/g) ?? [flat];
  const out = parts.slice(0, maxSentences).join(" ").trim();
  return out.length > 0 ? out : flat.slice(0, 200);
}

function main(): void {
  const capPath = process.argv[2] ?? "/tmp/captured-real.json";
  const cap = JSON.parse(readFileSync(capPath, "utf8")) as Record<string, Captured>;

  // Fixed question order → deterministic ranks within each tier.
  const order = ["cpg-q1", "finserv-q1", "healthcare-q1", "retail-q1"].filter((id) => cap[id]);

  const items: CalibrationItem[] = [];
  // strong tier: ranks 1..N
  order.forEach((id, i) => {
    const c = cap[id];
    items.push({
      id: `${id}__strong`,
      question: c.question,
      answer: c.answer,
      sources: c.sources,
      humanRank: 1 + i,
    });
  });
  // thin tier: ranks N+1..2N
  order.forEach((id, i) => {
    const c = cap[id];
    items.push({
      id: `${id}__thin`,
      question: c.question,
      answer: truncateToSentences(c.answer),
      sources: c.sources,
      humanRank: order.length + 1 + i,
    });
  });
  // weak tier: ranks 2N+1..3N
  order.forEach((id, i) => {
    const c = cap[id];
    items.push({
      id: `${id}__weak`,
      question: c.question,
      answer: c.answer + FABRICATIONS[id],
      sources: c.sources,
      humanRank: 2 * order.length + 1 + i,
    });
  });

  const setPath = join(REPO_ROOT, "lab", "server", "calibration", "set.json");
  writeFileSync(setPath, JSON.stringify(items, null, 2));

  // Blind ranking sheet + key (shuffled display order, deterministic seed).
  const display = [...items];
  // Deterministic shuffle (fixed permutation) so the sheet is reproducible.
  const perm = [6, 1, 9, 3, 10, 7, 11, 4, 0, 8, 2, 5];
  const shuffled = perm.map((p) => display[p % display.length]);
  const key: Record<string, string> = {};
  const sheetRows: string[] = [];
  const sheetBodies: string[] = [];
  shuffled.forEach((it, idx) => {
    const n = idx + 1;
    key[String(n)] = it.id;
    sheetRows.push(`| ${n} | ${it.question} |  |`);
    sheetBodies.push(
      `### Item ${n}\n\n**Question:** ${it.question}\n\n**Answer:**\n\n${it.answer}\n`,
    );
  });

  const keyPath = join(REPO_ROOT, "lab", "server", "calibration", "key.json");
  writeFileSync(keyPath, JSON.stringify(key, null, 2));

  const sheet = [
    "# Judge Calibration — Human Ranking Sheet (BLIND)",
    "",
    "Rank ALL 12 answers from **1 = best** to **12 = worst** by overall answer quality — your gut.",
    "NOTE: the gate now uses the CONSTRUCT humanRank baked into set.json (strong > thin > weak);",
    "this sheet exists only for an optional later human cross-check.",
    "",
    "## Quick rank table",
    "",
    "| Item | Question | Your rank |",
    "|---|---|---|",
    ...sheetRows,
    "",
    "---",
    "",
    "## The 12 answers (read these — no labels, rank blind)",
    "",
    ...sheetBodies,
  ].join("\n");
  const sheetPath = join(REPO_ROOT, "lab", "server", "calibration", "RANKING-SHEET.md");
  writeFileSync(sheetPath, sheet);

  console.log(`Wrote ${items.length} items → ${setPath}`);
  console.log(`Wrote key → ${keyPath}`);
  console.log(`Wrote sheet → ${sheetPath}`);
  console.log("\nConstruct ranks:");
  for (const it of items) {
    console.log(
      `  ${it.humanRank}\t${it.id}\tans=${it.answer.length}ch\tsrc=${it.sources.length}`,
    );
  }
}

main();
