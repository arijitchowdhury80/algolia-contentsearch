# AI Judge — Methodology

A reusable method for scoring the quality of a generated artifact (an answer, an idea, a story, an email, a prompt) using a **blind panel of differently-tempered judges** reconciled by a **Chief Synthesizer**, with **hard gates** that override prose quality.

This doc is the design record for the `lab/judge` TypeScript module **and** the blueprint for a future reusable "AI Judge" Claude skill. The skill is the same method, parameterized.

---

## 1. Why this exists (the philosophy)

A single LLM grading a single answer is fragile. It anchors on fluency, rewards confident prose, and quietly forgives fabrication. Three failure modes recur:

1. **Fluency bias** — a well-written wrong answer beats a plain right one.
2. **Single-perspective collapse** — one judge's idiosyncrasy becomes the verdict.
3. **Grounding blindness** — the judge does not separate "sounds true" from "is supported by the provided sources."

The method counters each:

- **Blind multi-perspective.** The same artifact is scored independently by judges who do not see each other and do not know which system or author produced it. Identity is hidden so style and brand cannot leak into the score.
- **Deliberately different temperaments.** A Skeptic, a Referee, and an Advocate. The disagreement between them is signal — a wide spread flags a contentious artifact.
- **Synthesis, not voting.** A Chief Synthesizer reconciles the panel into one number + written rationale, so the output is explainable, not just an average.
- **Hard gates over prose.** Some failures are disqualifying regardless of how good the writing is. A verified grounding violation (a factual claim no source supports) caps the score, full stop. Beautiful hallucination still fails.

The north star for the Algolia experiment: **110% grounded**. The judge must make ungrounded claims impossible to win on, no matter how fluent.

---

## 2. The rubric

Each dimension is scored on an integer 1–10 scale. Groundedness carries **double weight** and is the gated dimension.

| Dimension | Weight | What it measures |
|---|---|---|
| **Groundedness** ⚠️ | **×2** | Is every factual claim traceable to a provided source? Unsupported claims are penalised hard. CRITICAL. |
| Completeness | ×1 | Does it fully address the question / brief? |
| Depth / rigor | ×1 | Mechanism, trade-offs, nuance — beyond surface level. |
| Clarity & logical layering | ×1 | Well-structured, ideas in a logical order. |
| Conciseness | ×1 | No filler, no repetition. |
| Citation quality | ×1 | Citations present where claimed, and the cited source actually backs the claim. |
| Engagement / two-way | ×1 *(optional)* | For conversational artifacts: does it advance a two-way exchange? Skipped for one-shot answers. |

**Aggregation** (per judge): weighted mean of the *applicable* dimensions, on the rubric's native scale. A missing dimension score counts as the rubric minimum (a gap is not free). Optional dimensions marked not-applicable are dropped from both scoring and the weight total.

**Final scale:** the aggregate is rescaled to **0–10** so a custom rubric (say 0–5) still yields a comparable number. The gate cap also lives on 0–10.

Implemented in `lab/judge/src/aggregate.ts` (`weightedAggregate`, `toFinalScale`) and `lab/judge/src/rubric.ts` (`ALGOLIA_ANSWER_RUBRIC`).

---

## 3. The temperaments

Three personas, one shared rubric. Each is a *lens*, not a different scoring scale.

- **Skeptic (contrarian).** Assumes the artifact is wrong until the sources prove it right. Hunts hallucination, unsupported claims, fluff, broken logic, and citations that don't back their claim. Scores conservatively; when in doubt, scores lower. **It is the Skeptic's flagged violations that trip the grounding hard-gate.** Low temperature (0.2).
- **Referee (balanced).** Neutral, rubric-literal. No credit for ambition, no penalty for it. Scores exactly what the rubric describes. Temperature 0.
- **Advocate (believer).** Generous; assumes the artifact is trying to help. Rewards genuine depth, helpfulness, layered teaching, completeness, engagement. Still may not excuse fabricated facts — grounding is non-negotiable for everyone — but everywhere else, finds the value. Slightly higher temperature (0.3).

The personas are injected into each judge's prompt verbatim. They never reveal the artifact's origin.

Defined in `lab/judge/src/rubric.ts` (`DEFAULT_JUDGES`).

---

## 4. Blinding

Every judge prompt opens with a fixed **blinding instruction** (`BLINDING_INSTRUCTION` in `lab/judge/src/prompt.ts`): the judge is told it is one of several independent judges, does not know who produced the artifact, must not speculate about identity, and must judge only the text against the rubric. This is a tested invariant — the prompt builder is a pure function and a unit test asserts the blinding string and the persona are both present.

Judges also run **in parallel and independently** — no judge sees another's output. Synthesis is the only stage that sees the whole panel.

---

## 5. The grounding hard-gate

The core anti-hallucination mechanism.

A judge may report **grounding violations**: factual claims in the artifact not supported by any provided source, each with a `confidence` (0–1). The gate then asks:

1. Is the grounding gate enabled?
2. Did a **gating temperament** (default: the Skeptic) flag a violation?
3. Is that violation **verified** — confidence ≥ the threshold (default 0.7)?

If yes to all three, the gate **trips**: the final score is capped at `cap` (default **3/10**), regardless of how high the consensus prose score was. A 9.5/10-written answer with one verified fabrication scores 3.

Design choices encoded:
- Only the Skeptic (the designated hunter) trips the gate by default. An Advocate's nervous flag does not. (Configurable via `gatingTemperaments`.)
- A low-confidence flag (< threshold) does **not** trip — guards against trigger-happy capping.
- `applyGate` takes the *lower* of the score and the cap, so an already-low score is unaffected.

Implemented in `lab/judge/src/gate.ts` (`verifiedGatingViolations`, `evaluateHardGate`, `applyGate`). Tested in `test/gate.test.ts` and end-to-end in `test/judge.test.ts`.

---

## 6. The consensus / synthesis algorithm

The panel's per-judge weighted scores (rescaled to 0–10) are reconciled into one **pre-gate consensus score** by a configurable rule (`lab/judge/src/synthesis.ts`, `consensusScore`):

- **`mean`** — simple average. Baseline.
- **`median`** — robust to a single outlier judge.
- **`trimmed-skeptic-weighted`** (default) — the Skeptic's score is multiplied by `skepticWeight` (default 1.5) because false confidence is costlier than excess caution; then, for panels of 3+, the single most generous *non-Skeptic* score is trimmed. This leans the consensus toward conservatism without letting one Skeptic dominate entirely.

Then: **consensus → hard gate → final score.** `synthesize()` runs the consensus, evaluates the gate, applies the cap, and reports:
- `finalScore` (0–10, post-gate),
- `preGateScore` (for transparency — you can see what the gate cost),
- `gate` (whether it tripped + which violations + an explanation),
- `panelSpread` (max − min of judges' scores — a per-round variance signal),
- `rationale` — authored by the **Chief Synthesizer** LLM call.

The numeric score is computed *in code* (deterministic, testable). The synthesizer LLM only **authors the written rationale** around that number — it cannot move the score. This keeps the math reproducible and the narrative explainable. The synthesizer prompt (`buildSynthesisPrompt`) shows each judge's score, violation count, and verdict, and notes when the gate tripped.

---

## 7. Robustness: multi-round + the voted gate (stability hardening, 2026-06-12)

A smoke run exposed the judge swinging ±3–5 on identical answers across runs. **Root cause (proven by a 5-round probe, not assumed):**

1. The per-judge prose scores and the **pre-gate consensus are already stable** at the configured low temperatures — across 5 rounds the pre-gate score moved by σ ≈ 0.03–0.2. (A separate finding: gpt-5.2 *does* honor `temperature` and `seed` — HTTP 200 — so the earlier "reasoning models reject temperature" assumption was wrong; lowering temperature was never the lever.)
2. **100 % of the cross-run noise was the binary hard gate flickering.** The gate caps the score at 3.0 when the Skeptic reports a verified violation (confidence ≥ 0.7). For *borderline* answers the Skeptic's confidence sits right at 0.7, so the cap fired in some rounds and not others — the final score jumped between 3.0 and ~6.7. Naïve averaging of the *final* score is therefore wrong (it returns a meaningless blend, e.g. 3.75).

**The fix — `aggregateRounds` (`synthesis.ts`), wired through `judgeArtifactMultiRound`:** run N rounds, then reconcile into one **stable** verdict by separating the two signals:

- **`meanPreGateScore` ± `stdDevPreGateScore`** — the quality metric, averaged over rounds. This is what the Autocorrect loop optimizes. Now reproducible (cross-run Δ ≤ 0.15 on the smoke set).
- **A voted gate** — a violation must reproduce in a **supermajority (≥ 2/3)** of rounds to cap the score. Evidence between the clean (≤ 1/3) and trip (≥ 2/3) thresholds is **`borderline`**: flagged for review but **never auto-capped** (we do not cap on a coin flip). Per Arijit's "supermajority + flag" policy (2026-06-12).

This is faithful to 110 %-grounding: a *real* violation reproduces every round (a training-data leak gated 100 % stably), so it is still capped; only *non-reproducible* skeptic flags are spared the cap and surfaced instead. The default panel runs **N = 5** rounds (enough resolution for the 2/3 vote); `JUDGE_ROUNDS=3` is available for cheap iteration where only the quality score matters (the gate vote is coarse at 3).

`MultiRoundStats` (mean/σ/range of *per-round* final scores) is retained as a raw variance diagnostic; the `RoundAggregate` is the verdict the harness consumes.

For adversarial robustness, the method anticipates periodically inserting a known-bad "honeypot" artifact into a batch; if the panel scores it high, the panel is mis-calibrated. (The honeypot item itself is supplied by the caller / harness, not the module.)

---

## 8. Architecture — provider-agnostic & testable without LLMs

The module never imports an LLM SDK. The only seam to the outside world is an injected function:

```ts
type LlmComplete = (prompt: string, opts?: LlmCompleteOptions) => Promise<string>;
```

The backend wires a real provider (OpenAI, Anthropic, local, …) into this signature later. Tests inject a **scripted mock** that returns canned judge JSON — no network, fully deterministic.

Everything that decides a score is a **pure function**: prompt construction, output parsing/clamping, weighted aggregation, the hard-gate, and the consensus math. Only `judgeArtifact` / `judgeArtifactMultiRound` touch the injected LLM, and they delegate all scoring to the pure modules. That is why 31 unit tests cover the full decision logic with zero live calls.

```
buildJudgePrompt ─▶ llm(injected) ─▶ parseJudgeOutput ─▶ weightedAggregate
                                                              │
        ┌─────────────────────────────────────────────────── ▼
        │  per-judge Judgment (×3, parallel, blind)
        ▼
   consensusScore ─▶ evaluateHardGate ─▶ applyGate ─▶ SynthesisResult
        │                                                  ▲
        └───────────── buildSynthesisPrompt ─▶ llm ───────┘ (rationale only)
```

Files: `types.ts`, `rubric.ts`, `prompt.ts`, `parse.ts`, `aggregate.ts`, `gate.ts`, `synthesis.ts`, `judge.ts`, `index.ts` (all in `lab/judge/src/`).

---

## 9. Parameterization (how this becomes a reusable skill)

Everything domain-specific is a parameter. To judge a different artifact, supply a new `JudgeConfig` — no code change:

```
JudgeConfig = {
  rubric:    { name, min, max, dimensions: [{ id, label, description, weight, optional }] },
  judges:    [{ id, temperament, persona, temperature }],   // the panel
  gate:      { groundingGateEnabled, cap, verifiedConfidence, gatingTemperaments },
  synthesis: { rule, skepticWeight },                        // consensus rule
}
```

The five reuse knobs the skill exposes:

1. **Artifact type** — what is being judged (sets framing + which dimensions apply).
2. **Rubric dimensions + weights** — what "good" means here, and what matters most.
3. **Judge temperaments** — the lenses; usually Skeptic/Referee/Advocate, but you can add a domain expert persona.
4. **Consensus rule** — how to reconcile the panel (`mean` / `median` / `trimmed-skeptic-weighted`).
5. **Hard gates** — the disqualifiers that override prose, and who can trip them.

### Worked examples for non-Algolia uses

**A) Judging a LinkedIn post**
- *Artifact type:* `linkedin-post`. *Sources:* usually empty (no grounding corpus) → omit groundedness + disable the grounding gate.
- *Rubric:* Hook strength ×2, Insight/originality ×1, Clarity ×1, Concision ×1, Call-to-action ×1, Authenticity (anti-cringe) ×1.
- *Temperaments:* Skeptic = "this reads like AI slop / humble-brag"; Advocate = "this will resonate and drive engagement"; Referee = literal.
- *Hard gate:* enable a **"fabricated stat" gate** instead — if the Skeptic flags an unsourced statistic with confidence ≥ 0.7, cap the score. Don't let a punchy post win on a made-up "90% of leaders…".

**B) Judging a short story**
- *Artifact type:* `short-story`. No external sources → no grounding gate.
- *Rubric:* Voice/prose ×2, Character ×1, Plot coherence ×1, Emotional payoff ×1, Originality ×1, Pacing ×1. (Conciseness often dropped or down-weighted.)
- *Temperaments:* Skeptic = "clichéd, plot holes, telling-not-showing"; Advocate = "moved me, ambitious"; Referee = craft-literal.
- *Hard gate:* a **"plot-hole" gate** — if the Skeptic verifies a contradiction that breaks the story's internal logic, cap it. Internal consistency replaces external grounding.

**C) Judging a prompt (for prompt optimization / the Autocorrect loop)**
- *Artifact type:* `llm-prompt`. *Sources:* the task spec the prompt must satisfy.
- *Rubric:* Goal coverage ×2, Constraint specificity ×1, Robustness to edge cases ×1, Clarity ×1, Token economy ×1, Output-format precision ×1.
- *Temperaments:* Skeptic = "ambiguous, will produce drift / refusals"; Advocate = "thorough, well-scaffolded"; Referee = spec-literal.
- *Hard gate:* a **"spec-violation" gate** — if the Skeptic verifies the prompt instructs something the task spec forbids, cap it. The spec is the "source."

The pattern generalises: **grounding** becomes *whatever the artifact must be faithful to* (sources / facts / internal consistency / a spec), and the **hard gate** becomes *the disqualifier no prose can buy back*.

---

## 10. Relationship to the Autocorrect loop

The AI Judge produces the **single comparable metric** (the Chief Synthesizer's 0–10 final score, subject to zero grounding violations) that the Autocorrect loop optimizes. Judge scores → Autocorrect diagnoses the weakest dimensions from the judges' rationales → proposes a bounded mutation → re-judges → keep-if-better-else-rollback. The judge is the fitness function; it must be stable (low multi-round variance) and ungameable (hard gate) for the loop to converge honestly. See the Autocorrect methodology for the loop, overfit guards, and stopping criteria.

---

## 11. Verification status

- `npx vitest run` → **49 tests, all passing**, covering weighted aggregation (incl. the ×2 groundedness weight biting), the grounding hard-gate (verified violation caps the score; low-confidence and non-gating flags do not trip; gate can be disabled), consensus reconciliation across all three rules, the **multi-round voted gate** (`aggregateRounds`: minority/supermajority/borderline/clean), prompt construction (blinding instruction + persona + rubric + N/A handling + the scoped grounding note), output parsing/clamping, and end-to-end orchestration with a mocked `LlmComplete`.
- **Stability proven empirically (2026-06-12):** two independent 5-round passes over the smoke set gave a worst cross-run final-score Δ of **0.15** (down from ±3–5 pre-fix).
- `npx tsc --noEmit` → **clean** (strict mode).
- **No real LLM call or network access** anywhere in the module or tests.
