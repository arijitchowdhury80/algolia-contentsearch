/**
 * questions — parse the LOCKED v3 test-question set from markdown.
 *
 * Source of truth: docs/experiment/test-questions-locked-v3.md. We parse rather
 * than re-encode so the markdown stays the single editable artifact (and the
 * version bump rule there governs comparability of scores).
 *
 * v3 (2026-06-18) is the 2×2 set: 8 categories incl. Cat 3 [N] neural- and Cat 4
 * [M] multi-differentiators, Cat 5 [N][M] compound, Cat 7 grounded-refusal baits,
 * and Cat 8 multi-turn OPENERS (no scripted follow-up — each panel generates its
 * own via the shared block, so `followUp` is intentionally undefined here).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { REPO_ROOT } from "./config.js";

export const QUESTIONS_PATH = resolve(
  REPO_ROOT,
  "docs",
  "experiment",
  "test-questions-locked-v3.md",
);

export type Split = "dev" | "held-out";

export interface TestQuestion {
  /** The locked id, e.g. "1.2", "4a", "8.1". */
  readonly id: string;
  /** Category number 1-8. */
  readonly category: number;
  /** The question text. For multi-turn (Cat 8) this is the FIRST turn. */
  readonly prompt: string;
  /** For Cat 8: the follow-up turn (after `→`). Undefined otherwise. */
  readonly followUp?: string;
  /** dev (optimise against) or held-out (validate only). */
  readonly split: Split;
  /** Cat 7 questions expect a grounded refusal as the correct answer. */
  readonly isRefusalTest: boolean;
}

// Mirror of the "Dev set (22)" list in test-questions-locked-v3.md. Held-out is
// the complement. Keep these in sync when the locked set's version is bumped.
const DEV_IDS = new Set([
  "1.1", "1.2", "1.3", "2.1", "2.2", "2.3", "3.1", "3.2", "3.3",
  "4.1", "4.2", "5.1", "5.2", "6.1", "6.2", "7.1", "7.2", "7.3",
  "8.1", "8.2", "8.3", "8.4",
]);

/** Strip markdown emphasis / trailing parenthetical notes from a question line. */
function cleanText(s: string): string {
  return s
    .replace(/\*\(.*?\)\*/g, "") // *(italic note)*
    .replace(/\*+/g, "") // stray bold/italic markers
    .replace(/`([^`]*)`/g, "$1") // inline code → plain
    .trim();
}

/**
 * Parse the locked markdown. Lines under "## Cat N — ..." headers of the form
 *   - **<id>** <question text>
 * become questions. A `→` in the text splits a multi-turn follow-up.
 */
export function parseQuestions(markdown?: string): TestQuestion[] {
  const text =
    markdown ?? readFileSync(QUESTIONS_PATH, "utf8");
  const lines = text.split("\n");

  const questions: TestQuestion[] = [];
  let category = 0;
  let inHeldOutSplitSection = false;

  for (const raw of lines) {
    const line = raw.trim();

    // The "## Held-out split" section also contains the literal ids — skip it.
    if (/^##\s+Held-out split/i.test(line)) {
      inHeldOutSplitSection = true;
      continue;
    }

    const catMatch = line.match(/^##\s+Cat\s+(\d+)/i);
    if (catMatch) {
      inHeldOutSplitSection = false;
      category = Number(catMatch[1]);
      continue;
    }
    if (inHeldOutSplitSection) continue;
    if (category === 0) continue;

    // - **1.2** What are Algolia's ranking criteria ...
    const qMatch = line.match(/^-\s+\*\*([^*]+)\*\*\s+(.*)$/);
    if (!qMatch) continue;

    const id = qMatch[1].trim();
    // Only real question ids: N, N.M, or N<letter> (e.g. "1.2", "7.4", "4a").
    // This rejects the bold sub-header bullets inside Cat 7 (e.g.
    // "- **Competitor bait** — …"), which describe bait classes, not questions.
    if (!/^\d+(\.\d+|[a-z])?$/i.test(id)) continue;

    const body = qMatch[2];

    // Multi-turn split on the first arrow.
    let prompt = body;
    let followUp: string | undefined;
    const arrowIdx = body.indexOf("→");
    if (arrowIdx !== -1) {
      prompt = body.slice(0, arrowIdx);
      followUp = cleanText(body.slice(arrowIdx + 1));
    }

    questions.push({
      id,
      category,
      prompt: cleanText(prompt),
      ...(followUp ? { followUp } : {}),
      split: DEV_IDS.has(id) ? "dev" : "held-out",
      isRefusalTest: category === 7,
    });
  }

  return questions;
}
