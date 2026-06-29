// Assemble the 4-way comparison: per-Q scores + timing + winner, and answer snippets.
// Run AFTER variantJudge writes variant_scores.json.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RUNS = dirname(fileURLToPath(import.meta.url));
const H2H = dirname(RUNS);
const load = (p) => JSON.parse(readFileSync(p, 'utf8'));

const sets = {
  flash: load(join(RUNS, 'flash_answers.json')),
  'flash-lite': load(join(RUNS, 'flash-lite_answers.json')),
  inference: load(join(RUNS, 'inference_answers.json')),
  baseline: load(join(H2H, 'rc2_answers.json')),
};
const scores = load(join(RUNS, 'variant_scores.json'));
const labels = ['flash', 'flash-lite', 'inference', 'baseline'];
const q = (set, qi) => set.find((x) => x.qi === qi);
const sc = (l, qi) => scores.find((s) => s.system === l && s.qi === qi);

const QUESTIONS = sets.flash.map((x) => x.question);

let md = '# RC2 4-way comparison — flash vs flash-lite vs inference vs baseline\n\n';

// Summary
md += '## Summary (per config)\n\n';
md += '| config | mean composite | mean time/Q | wins | gates tripped |\n|---|---|---|---|---|\n';
const winsByQ = [];
for (let qi = 0; qi < 12; qi++) {
  const valid = labels.map((l) => ({ l, c: sc(l, qi)?.composite })).filter((x) => x.c != null);
  valid.sort((a, b) => b.c - a.c);
  let w = '—';
  if (valid.length) { w = (valid[1] && valid[0].c - valid[1].c < 0.3) ? 'tie' : valid[0].l; }
  winsByQ.push(w);
}
for (const l of labels) {
  const ss = scores.filter((s) => s.system === l && s.composite != null);
  const mc = ss.length ? (ss.reduce((a, b) => a + b.composite, 0) / ss.length).toFixed(2) : 'n/a';
  const wt = sets[l].filter((x) => x.ms && !x.error);
  const mt = wt.length ? (wt.reduce((a, b) => a + b.ms, 0) / wt.length / 1000).toFixed(1) + 's' : 'n/a';
  const gates = scores.filter((s) => s.system === l && s.gateTripped).length;
  const wins = winsByQ.filter((x) => x === l).length;
  md += `| ${l} | ${mc} | ${mt} | ${wins} | ${gates} |\n`;
}
md += `| _ties_ | | | ${winsByQ.filter((x) => x === 'tie').length} | |\n\n`;

// Per-Q score + time table
md += '## Per-question composite (time)\n\n';
md += '| Q | flash | flash-lite | inference | baseline | winner |\n|---|---|---|---|---|---|\n';
for (let qi = 0; qi < 12; qi++) {
  const cell = (l) => {
    const s = sc(l, qi); const a = q(sets[l], qi);
    if (!s) return '—';
    const c = s.composite != null ? s.composite.toFixed(2) : (s.gateTripped ? 'GATE' : 'ERR');
    const t = a?.ms ? ` (${(a.ms / 1000).toFixed(0)}s)` : '';
    return `${c}${t}`;
  };
  md += `| Q${qi + 1} | ${cell('flash')} | ${cell('flash-lite')} | ${cell('inference')} | ${cell('baseline')} | **${winsByQ[qi]}** |\n`;
}

// Answer snippets
md += '\n## Answer snippets (first 280 chars)\n';
for (let qi = 0; qi < 12; qi++) {
  md += `\n### Q${qi + 1}. ${QUESTIONS[qi]}\n`;
  for (const l of labels) {
    const a = q(sets[l], qi);
    const snip = (a?.answer || '').replace(/\s+/g, ' ').slice(0, 280);
    const s = sc(l, qi);
    const cs = s?.composite != null ? s.composite.toFixed(2) : (s?.gateTripped ? 'GATE' : '—');
    md += `- **${l}** [${cs}]: ${snip}…\n`;
  }
}

console.log(md);
