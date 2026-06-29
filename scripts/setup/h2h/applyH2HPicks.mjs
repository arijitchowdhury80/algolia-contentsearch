/**
 * applyH2HPicks — after Arijit fills picks.json, REVEAL the systems and compute:
 *   (1) judge↔human agreement on the per-question winner (the calibration headline),
 *   (2) RC2-vs-AC2 win rate by Arijit AND by the judge (the benchmark),
 *   (3) Spearman of Arijit's per-answer 1-5 scores vs the judge composite (n=24).
 *
 * Run (after filling picks.json): node scripts/setup/h2h/applyH2HPicks.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DIR = dirname(fileURLToPath(import.meta.url));
const picks = JSON.parse(readFileSync(join(DIR, "picks.json"), "utf8"));
const key = JSON.parse(readFileSync(join(DIR, "key-h2h.json"), "utf8"));
const scores = JSON.parse(readFileSync(join(DIR, "judge_scores.json"), "utf8"));
const comp = (qi, sys) => scores.find((s) => s.qi === qi && s.system === sys)?.composite ?? null;

function spearman(a, b) {
  const rank = (xs) => {
    const idx = xs.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]);
    const r = new Array(xs.length);
    for (let i = 0; i < idx.length;) {
      let j = i; while (j < idx.length && idx[j][0] === idx[i][0]) j++;
      const avg = (i + j - 1) / 2 + 1;
      for (let k = i; k < j; k++) r[idx[k][1]] = avg;
      i = j;
    }
    return r;
  };
  const ra = rank(a), rb = rank(b), n = a.length;
  const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const ma = mean(ra), mb = mean(rb);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { num += (ra[i] - ma) * (rb[i] - mb); da += (ra[i] - ma) ** 2; db += (rb[i] - mb) ** 2; }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

let agree = 0, decided = 0, arijitRc2 = 0, arijitAc2 = 0, judgeRc2 = 0, judgeAc2 = 0;
const humanScores = [], judgeScores = [];
const rows = [];
for (let qi = 0; qi < 12; qi++) {
  const k = key[qi], p = picks[qi];
  const rc = comp(qi, "rc2"), ac = comp(qi, "ac2");
  // human winner (map A/B pick to system)
  let humanWin = null;
  if (p.pick === "A" || p.pick === "a") humanWin = k.A;
  else if (p.pick === "B" || p.pick === "b") humanWin = k.B;
  // judge winner
  let judgeWin = null;
  if (rc != null && ac != null) judgeWin = Math.abs(rc - ac) < 0.3 ? "tie" : rc > ac ? "rc2" : "ac2";
  if (humanWin === "rc2") arijitRc2++; else if (humanWin === "ac2") arijitAc2++;
  if (judgeWin === "rc2") judgeRc2++; else if (judgeWin === "ac2") judgeAc2++;
  if (humanWin && judgeWin && judgeWin !== "tie") { decided++; if (humanWin === judgeWin) agree++; }
  // per-answer 1-5 vs judge composite (map A/B scores to systems)
  if (p.aScore != null && p.bScore != null) {
    const aSys = k.A, bSys = k.B;
    humanScores.push(p.aScore); judgeScores.push(comp(qi, aSys));
    humanScores.push(p.bScore); judgeScores.push(comp(qi, bSys));
  }
  rows.push({ qi, q: k.question.slice(0, 50), rc2: rc?.toFixed(2), ac2: ac?.toFixed(2), judgeWin, humanWin, match: humanWin && judgeWin ? (humanWin === judgeWin ? "✓" : "✗") : "?" });
}

console.log("\n=== REVEAL ===");
console.log("Q   RC2   AC2   judge  Arijit  match");
for (const r of rows) console.log(`Q${(r.qi + 1 + "").padEnd(2)} ${(r.rc2 ?? "—").padEnd(5)} ${(r.ac2 ?? "—").padEnd(5)} ${(r.judgeWin ?? "—").padEnd(6)} ${(r.humanWin ?? "—").padEnd(7)} ${r.match}`);
console.log(`\nJudge↔Arijit winner agreement: ${decided ? ((agree / decided) * 100).toFixed(0) : "—"}% (${agree}/${decided} decided Qs)  ← calibration headline`);
console.log(`Benchmark — Arijit: RC2 ${arijitRc2} / AC2 ${arijitAc2}   |   Judge: RC2 ${judgeRc2} / AC2 ${judgeAc2}`);
const valid = humanScores.filter((v, i) => v != null && judgeScores[i] != null);
if (valid.length >= 2) {
  const h = [], j = [];
  for (let i = 0; i < humanScores.length; i++) if (humanScores[i] != null && judgeScores[i] != null) { h.push(humanScores[i]); j.push(judgeScores[i]); }
  console.log(`Spearman (Arijit 1-5 vs judge composite, n=${h.length}): ${spearman(h, j).toFixed(3)}`);
} else {
  console.log("(fill aScore/bScore in picks.json for the Spearman correlation)");
}
