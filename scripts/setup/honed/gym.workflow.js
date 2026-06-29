export const meta = {
  name: 'specialist-honing-gym',
  description: 'Autonomously hone one Algolia specialist prompt on its SHADOW agent (evaluator-optimizer), keep-if-better vs the live floor, never touching live. Promote is a separate gated step.',
  whenToUse: 'After P2b judge calibration passes. Pass args={unit, mode}. Runs one unit (support|tech|academy|marketer).',
  phases: [
    { title: 'Baseline', detail: 'Measure shadow (ours) + live (floor) over the bank split' },
    { title: 'Hone', detail: 'diagnose → propose → deploy-to-shadow → re-eval → keep/rollback, per round' },
    { title: 'Synthesize', detail: 'E2E warm-baton multi-turn, judged' },
  ],
};

// ── Contract ────────────────────────────────────────────────────────────────
// args = { unit: 'support', mode: 'smoke'|'spotcheck'|'trust', maxRounds?: number }
//   smoke    — stub proposer (prompt unchanged); proves mechanics, spends ~no propose tokens
//   spotcheck— ONE real round then return for human review (judge is INDICATIVE pre-P2b)
//   trust    — full loop to bar/patience (ONLY after P2b calibration passes)
// The workflow JS sandbox has no fs/shell — every real action runs inside an agent()
// that uses Bash over the PROVEN primitives (clone_shadow / baton_eval | judge:cli /
// agent_admin update / push_honed). state.json is read+written by those Bash agents.
const HONED = 'scripts/setup/honed';
const unit = (args && args.unit) || 'support';
const mode = (args && args.mode) || 'spotcheck';
const cfg = { targetMargin: 1.0, minImprovement: 0.3, judgeRounds: 3, maxRounds: (args && args.maxRounds) || 4 };

// SAFETY: deploy may only ever target an *-shadow agent. Stated in every apply prompt.
const SHADOW_GUARD = "HARD SAFETY RULE: you may ONLY `agent_admin.mjs update <id>` an agent whose name ends in '-shadow'. If the resolved id is the live ac2-*-neural, ABORT and report — never PATCH live.";

const SCORES_SCHEMA = {
  type: 'object',
  required: ['oursMean', 'oursGroundingMean', 'oursGated', 'floorMean', 'weakest', 'rationales'],
  properties: {
    oursMean: { type: 'number' }, oursGroundingMean: { type: 'number' }, oursGated: { type: 'boolean' },
    oursDimMeans: { type: 'object' },
    floorMean: { type: 'number' }, floorGroundingMean: { type: 'number' },
    devMean: { type: 'number' }, heldOutMean: { type: 'number' },
    weakest: { type: 'array', items: { type: 'object', properties: { dimensionId: { type: 'string' }, meanScore: { type: 'number' } } } },
    rationales: { type: 'array', items: { type: 'string' } },
  },
};

// ── pure keep-if-better (mirrors @lab/autocorrect decideKeep; the only real logic here)
function keepIfBetter(prev, next, c) {
  if (next.oursGroundingMean < prev.oursGroundingMean - 1e-9) return { keep: false, reason: 'grounding regressed' };
  if (next.oursGated && !prev.oursGated) return { keep: false, reason: 'grounding gate newly tripped' };
  if ((next.devMean ?? next.oursMean) - (prev.devMean ?? prev.oursMean) < c.minImprovement) return { keep: false, reason: 'dev gain within noise' };
  if ((next.heldOutMean ?? next.oursMean) < (prev.heldOutMean ?? prev.oursMean) - 1e-9) return { keep: false, reason: 'held-out regressed (overfit)' };
  return { keep: true, reason: 'beats prior best, floor held' };
}

const evalPrompt = (agentName, role, splitNote) => [
  `cd ${HONED}. Measure agent "${agentName}" over the ${role} bank (${role}_question_bank.json), ${splitNote}.`,
  `For EACH question id: run \`node baton_eval.mjs ${role}_question_bank.json ${agentName} <id>\`, pipe its stdout into \`( cd ../../../lab/server && npx tsx src/judge/judgeCli.ts )\`, parse the verdict JSON.`,
  `Aggregate across questions: mean composite, mean grounding dim, whether ANY gateTripped, per-dim means. Collect up to 6 judge rationales (gated/borderline first).`,
  `Return the structured scores. judgeRounds=${cfg.judgeRounds} is already set in the request.`,
].join('\n');

log(`gym: unit=${unit} mode=${mode} (judge INDICATIVE pre-P2b — see gym_state.json blockers)`);

// ── Phase 1: Baseline ────────────────────────────────────────────────────────
phase('Baseline');
const baseline = await agent(
  `${evalPrompt(`ac2-${unit}-shadow`, unit, 'split: first ceil(n/2) ids = dev, rest = held-out — report devMean and heldOutMean separately')}\n\nALSO measure the LIVE floor "ac2-${unit}-neural" the same way (read-only; never edit it) and return its mean as floorMean/floorGroundingMean.`,
  { label: `baseline:${unit}`, phase: 'Baseline', model: 'haiku', effort: 'low', schema: SCORES_SCHEMA },
);
if (!baseline) { log('baseline failed — aborting'); return { unit, error: 'baseline eval failed' }; }
log(`baseline: ours=${baseline.oursMean?.toFixed?.(2)} floor=${baseline.floorMean?.toFixed?.(2)} grounding=${baseline.oursGroundingMean?.toFixed?.(2)} gated=${baseline.oursGated}`);

// ── Phase 2: Hone (evaluator-optimizer rounds) ───────────────────────────────
phase('Hone');
let best = baseline;
const history = [{ round: 0, scores: baseline, kept: true }];
const maxRounds = mode === 'smoke' ? 1 : (mode === 'spotcheck' ? 1 : cfg.maxRounds);

for (let r = 1; r <= maxRounds; r++) {
  // DIAGNOSE + PROPOSE (Opus — the hard judgment, where quality is won)
  const candidate = await agent(
    mode === 'smoke'
      ? `Read ${HONED}/instructions_${unit}.md and return it VERBATIM as newPrompt (smoke mode — no change). Set mechanism to "smoke: unchanged".`
      : [
          `You improve the SYSTEM PROMPT of a strictly-grounded Algolia ${unit} specialist. Read ${HONED}/instructions_${unit}.md (current prompt).`,
          `Weakest dimensions (lowest first): ${JSON.stringify(best.weakest)}.`,
          `Judge rationales (what went wrong): ${JSON.stringify(best.rationales)}.`,
          `Name the failure MECHANISM (not the symptom), then rewrite the prompt with a FOCUSED change targeting the weakest dimension. NEVER weaken grounding rules (the [[SHARED_GROUNDING]] block and SEARCH-FIRST contract are inviolate). Output the full new prompt.`,
        ].join('\n'),
    { label: `propose:${unit}#${r}`, phase: 'Hone', model: mode === 'smoke' ? 'haiku' : 'opus', effort: mode === 'smoke' ? 'low' : 'high',
      schema: { type: 'object', required: ['mechanism', 'newPrompt'], properties: { mechanism: { type: 'string' }, newPrompt: { type: 'string' } } } },
  );
  if (!candidate || !candidate.newPrompt) { log(`round ${r}: propose failed — stop`); break; }

  // APPLY to SHADOW + RE-EVAL (Haiku — mechanical; carries the safety guard)
  const next = await agent(
    [
      SHADOW_GUARD,
      `cd ${HONED}. Write this candidate prompt to /tmp/gym_${unit}_r${r}.md (substitute [[SHARED_GROUNDING]] with _shared_grounding.md contents if present):`,
      `<<<PROMPT\n${candidate.newPrompt}\nPROMPT>>>`,
      `Resolve ac2-${unit}-shadow's id; CONFIRM the name ends in '-shadow'; then \`node agent_admin.mjs update <shadowId> /tmp/gym_${unit}_r${r}.md\` (PATCH+publish).`,
      `Then re-measure: ${evalPrompt(`ac2-${unit}-shadow`, unit, 'split dev/held-out as before; report devMean + heldOutMean')}`,
      `Re-use the cached floor (do NOT re-measure live). Return the new scores.`,
    ].join('\n\n'),
    { label: `apply:${unit}#${r}`, phase: 'Hone', model: 'haiku', effort: 'low', schema: SCORES_SCHEMA },
  );
  if (!next) { log(`round ${r}: apply/re-eval failed — stop`); break; }

  const decision = keepIfBetter(best, next, cfg);
  log(`round ${r}: ${candidate.mechanism?.slice(0, 80)} → ours ${next.oursMean?.toFixed?.(2)} | ${decision.keep ? 'KEEP' : 'ROLLBACK'} (${decision.reason})`);
  history.push({ round: r, mechanism: candidate.mechanism, scores: next, kept: decision.keep, reason: decision.reason });

  if (decision.keep) {
    best = next;
    // persist the kept prompt as the shadow's new incumbent file
    await agent(`cd ${HONED}. Save the round-${r} kept prompt: copy /tmp/gym_${unit}_r${r}.md → instructions_${unit}.shadow.md. Append this round's {round, mechanism, scores, kept:true} to the "${unit}" unit's rounds[] in gym_state.json and update its status. Return "ok".`,
      { label: `persist:${unit}#${r}`, phase: 'Hone', model: 'haiku', effort: 'low' });
  } else {
    // rollback: restore the prior incumbent onto the shadow
    await agent(`${SHADOW_GUARD}\ncd ${HONED}. ROLLBACK: redeploy the prior incumbent prompt (instructions_${unit}.shadow.md if it exists, else instructions_${unit}.md) onto ac2-${unit}-shadow via agent_admin update. Append {round:${r}, kept:false, reason:${JSON.stringify(decision.reason)}} to gym_state.json triedRejected[]. Return "ok".`,
      { label: `rollback:${unit}#${r}`, phase: 'Hone', model: 'haiku', effort: 'low' });
  }

  if (mode === 'spotcheck') { log('spotcheck mode: stopping after 1 round for human review (judge is indicative pre-P2b)'); break; }
}

// ── Phase 3: Synthesize (E2E warm-baton, judged) ─────────────────────────────
phase('Synthesize');
const e2e = await agent(
  `cd ${HONED}. Run the FULL multi-turn warm-baton on ac2-${unit}-shadow: \`node run_baton.mjs ${unit}_question_bank.json ac2-${unit}-shadow\`. Then judge the multi-turn answers (baton_eval per question | judgeCli). Report whether the end-to-end flow holds grounding and did not regress vs baseline (${baseline.oursMean?.toFixed?.(2)}). Return {e2eMean, groundingHeld:boolean, regressed:boolean, notes}.`,
  { label: `e2e:${unit}`, phase: 'Synthesize', model: 'haiku', effort: 'low',
    schema: { type: 'object', properties: { e2eMean: { type: 'number' }, groundingHeld: { type: 'boolean' }, regressed: { type: 'boolean' }, notes: { type: 'string' } } } },
);

return {
  unit, mode,
  baseline: { ours: baseline.oursMean, floor: baseline.floorMean },
  best: { ours: best.oursMean, beatsFloorBy: (best.oursMean ?? 0) - (baseline.floorMean ?? 0) },
  rounds: history.length - 1,
  e2e,
  promote: 'GATED — review history + diffs, then `node push_honed.mjs push ac2-' + unit + '-neural instructions_' + unit + '.shadow.md` to promote the winner to live.',
  note: 'Judge was INDICATIVE (P2b not done). Treat scores as directional; a human must confirm kept patches until calibration passes.',
};
