/**
 * buildSheet — assemble the BLIND head-to-head ranking sheet for Arijit.
 * Per question: shows two unlabeled answers (A / B), system hidden. The A/B
 * assignment is deterministic per question index (alternating, so it's not a
 * fixed pattern) and recorded in key-h2h.json (the reveal key — NOT shown).
 *
 * Run: node scripts/setup/h2h/buildSheet.mjs
 * Outputs (this dir): RANKING-SHEET-H2H.md (give to Arijit), picks.json
 * (template he fills), key-h2h.json (reveal key — do not show him).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DIR = dirname(fileURLToPath(import.meta.url));
const rc2 = JSON.parse(readFileSync(join(DIR, "rc2_answers.json"), "utf8"));
const ac2 = JSON.parse(readFileSync(join(DIR, "ac2_answers.json"), "utf8"));

const byId = (arr) => Object.fromEntries(arr.map((o) => [o.qi, o]));
const R = byId(rc2), A = byId(ac2);

const key = {};
const picks = {};
let md = `# Head-to-Head BLIND Ranking Sheet — RC2 vs AC2 (you don't know which is which)\n\n`;
md += `For each question, read **Answer A** and **Answer B**, then fill the 3 blanks: which answer is better (A or B), and a 1-5 quality score for each. Rank on overall quality + groundedness — your gut. The two systems are hidden and the A/B order alternates per question.\n\n`;

for (let qi = 0; qi < 12; qi++) {
  const r = R[qi], a = A[qi];
  // alternate which system is "A" so there's no fixed pattern
  const aIsRc2 = qi % 2 === 0;
  const answerA = aIsRc2 ? r : a;
  const answerB = aIsRc2 ? a : r;
  key[qi] = { A: answerA.system, B: answerB.system, question: r.question };
  picks[qi] = { pick: null, aScore: null, bScore: null };

  md += `\n${"=".repeat(80)}\n## Q${qi + 1}: ${r.question}\n\n`;
  md += `### Answer A\n\n${answerA.answer.trim() || "(empty)"}\n\n`;
  md += `### Answer B\n\n${answerB.answer.trim() || "(empty)"}\n\n`;
  md += `**Better answer (A or B):** ____   **A quality (1-5):** ____   **B quality (1-5):** ____\n`;
}

writeFileSync(join(DIR, "RANKING-SHEET-H2H.md"), md);
writeFileSync(join(DIR, "key-h2h.json"), JSON.stringify(key, null, 2));
writeFileSync(join(DIR, "picks.json"), JSON.stringify(picks, null, 2));
console.log(`wrote RANKING-SHEET-H2H.md (12 Qs, blind), picks.json (template), key-h2h.json (reveal key)`);
