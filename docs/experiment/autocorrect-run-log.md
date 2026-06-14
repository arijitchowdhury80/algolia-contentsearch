# Autocorrect Run Log — ③ Our System vs ② Ask AI

_Provider: Gemini 2.5 Pro (OpenAI quota exhausted — fallback per provider policy). Judge: gemini-2.5-pro, N=5, supermajority grounding gate. Split: dev (18 Qs). ① website stubbed (not the ②vs③ comparison)._

## Judge trust (gate to everything below)
Re-validated on Gemini before trusting any number (`/tmp/judge_stability.log`, 2026-06-12):
- **Gate decisions 100% reproducible** across two N=5 runs of the same fixed answers.
- Final scores on decisive panels Δ ≤ 0.05; clean-panel pre-gate mean Δ = 0.05 (beats the gpt-5.2 bar of 0.15).
- Verdict: the metric is trustworthy on Gemini at N=5. The grounding gate (which drives the verdict) does not flicker.

## Baseline — Round 0 (live v0 prompt, ② fixed)
`runId=20260613T004122Z` · judge N=5 · dev split.

| Panel | Mean | Gated | Clean |
|---|---|---|---|
| ① website *(stub)* | 3.82 | 0/18 | — |
| ② Ask AI (mirror) | **4.42** | **14/18** | 4 |
| ③ Our System (tuned) | **5.15** | **12/18** | 6 |

**Honest read:** ③ beats ② by only **+0.73**, and *both* trip grounding on ~70% of questions. This is far harsher than the stale 1pm v1/N=3 number (③ 7.44 vs ② 4.59) — that number does not survive a fair, fresh, ②-fixed, N=5 measurement on the v2 set. **The "③ crushes ②" story was an artifact of the old setup.** The real picture: two systems that both leak grounding constantly, ③ marginally ahead.

**Caching caveat (logged, not hidden):** 14/18 baseline ③ answers were byte-identical to the prior run (`161131Z`) — served from the harness answer cache. They are valid v0-prompt answers (③'s config was unchanged), so they fairly represent v0. ② regenerated fresh because its config changed (the ② keyword-reformulation fix busted its cache). The mutation round below regenerates ③ fresh (config change busts cache), so v0-vs-v1 is a clean prompt comparison — modulo single-answer-sample-per-question variance, which we control for by reading **aggregate gate movement** across 18 Qs, not per-question flips, and by a held-out check.

### ③ gated questions, split by failure shape (from Round-0 pre-gate scores)
- **High pre-gate, still gated (the "confident topic sentence" class — mutation #1 targets these):** 5.1 (8.68), 8.2 (7.17), 8.3 (7.14), 8.1 (6.38). Good answers capped on an un-sourced claim.
- **Low pre-gate AND gated (quality/retrieval problem — mutation #1 may NOT fix):** 4.1 (2.57), 4b (3.45), 3.2 (3.80), 6.1 (3.71), 5.2 (5.30), 6.3 (5.12), 1.2 (7.14).
- **Clean ③ (don't regress these):** 1.3 (9.80), 3.1 (9.59), 2.1 (8.90), 2.2 (8.91), 7.1 (10.0 refusal), 7.2 (10.0 refusal).

## Mutation #1 — "grounded-lead v1" (RUNNING)
File: `scripts/setup/instructions_case3_grounded_lead_v1.md`. Deployed live to tuned agent `b5c4de23` (verified published, 7254 chars). Rollback: `scripts/setup/rollback_case3_v0_live.md`.

**Single lever:** the opening "direct answer" sentence must itself be source-traceable (GROUNDING #2 + ANSWER-SHAPE #1 reconciled). Diagnosis: `docs/experiment/gated-question-diagnosis.md` — v0's "direct answer first, no preamble" rule was literally instructing the un-sourced definition that gates.

**Hypothesis:** drops ③'s gate count (especially the 4 high-pre-gate gated Qs) with little quality cost. **Keep-if-better criterion (from `lab/autocorrect` decision core):** keep iff ③ gate count drops AND ③ pre-gate mean does not regress on the clean Qs; roll back otherwise. Held-out (9 Qs) confirms no overfit before any win is declared.

### Mutation #1 result (`runId=20260613T025541Z`, N=5, dev)
| Panel | Mean | Gated |
|---|---|---|
| ② Ask AI | 4.64 | 13/18 |
| ③ Our System (v1) | 5.00 | 11/18 |

- **③ targeted fixes landed (4/4 predicted):** 3.2, 4.1, 8.1, 8.4 went gated→clean — the un-sourced-lead lever works on its class.
- **③ apparent regressions:** 2.1, 2.2, 3.1 went clean→gated. **Net gate 12→11, mean 5.15→5.00.** Within noise.

## ⛔ HARD FINDING — the fitness signal is too noisy to drive the loop (2026-06-13)

The keep/rollback decision is **unreliable**, for two compounding reasons:

1. **Judge-gate flicker on borderline answers.** On **identical cached ② answers** judged in two separate runs, the grounding gate fraction moved on every borderline question, swinging final scores by up to 5–6 points:
   | Q (same ② answer) | run-A gate% → final | run-B gate% → final |
   |---|---|---|
   | 3.2 | 100% → 3.00 | 60% → 8.81 |
   | 8.3 | 40% → 9.35 | 100% → 3.00 |
   | 2.1 | 80% → 3.00 | 60% → 6.76 |
   | 2.2 | 40% → 8.17 | 20% → 8.97 |
   The supermajority (≥2/3) vote *reduced* gate-flicker but did not eliminate it near the threshold — and a large share of these questions sit near the threshold.

2. **Answer-sampling variance.** ③ regenerates a different answer each run (17/18 differed), so per-question gate flips mix prompt effect with answer noise.

**Correction to the record:** the N=5 judge re-validation earlier this session reported "PASS — gate 100% reproducible." That was under-sampled — it used only Q1.2 (always gated) and Q1.3 (always clean), both far from the threshold. It did **not** exercise borderline questions, where the gate is in fact unstable. The judge's *pre-gate quality score* is stable (σ small); the *binary gate*, which drives the verdict, is not — on borderline answers.

**Consequence:** the system gap (+0.73), the mutation effect (−0.15), and most per-question gate flips are all **inside the measurement noise**. No keep-if-better verdict can be trusted at this precision. The loop cannot proceed as-is.

**Honest top-line for any report:** on a strict grounded Gemini judge, **both ② and ③ trip grounding on ~70% of the dev set**; ③'s edge over ② is within noise; the un-sourced-lead fix demonstrably clears a real failure class (4/4 targets) but a system-level "③ beats ②" claim is **not yet measurable** without hardening the harness (stabilize the gate and/or average over multiple answer samples).

Mutation #1 left deployed (rollback ready at `scripts/setup/rollback_case3_v0_live.md`) pending a methodology decision.

## Decision: multi-sample averaging (Arijit, 2026-06-13) + cache discovery

Chosen path: average over samples with confidence intervals. Probing the agent endpoint to enable fair answer-resampling surfaced a **hard constraint**:

- **Agent Studio caches responses keyed on (agent, config-version, exact message).** Verified: 6 rapid identical calls all returned a byte-identical answer at cache-hit latency (~220ms). Neither a `Cache-Control: no-store` header nor a unique top-level `id` / `messages[].id` busts it. Only a **message change** or a **config change** forces fresh generation.
- **Phrasing variants are NOT fair resamples** — they change the keyword retrieval. Probe: *"What is vector search?"* → refusal (0 usable hits); *"Tell me about vector search in Algolia."* → a 1969-char grounded answer. The keyword index sits right at a retrieval cliff, so tiny query changes flip refuse↔answer.
- **Implication:** for a fixed config, each question's answer is effectively **frozen** (what production serves). The earlier cross-run "answer variance" was *config* variance (v0→v1), not sampling. Cheap fair answer-resampling is impossible; true answer-distribution sampling would require config-version-bumping hacks (a heavier follow-up).
- **Variance stack, ranked:** (1) **judge-gate flicker** — the dominant *controllable* noise, confirmed on identical answers; (2) retrieval-cliff sensitivity — real but a property of the keyword index, not run noise; (3) answer sampling — masked by the cache in practice.

**Therefore the rigorous-and-feasible measurement:** multi-sample the **judge** (N=11) over the **deployed, cache-frozen answers** (transcript `20260613T025541Z` = current ② + ③v1), and report each question's grounding-failure **rate** (gate fraction) with a Wilson CI, plus the stable quality mean. The cached answers ARE what production serves, so they are the correct unit for a deployed ②-vs-③ comparison. This controls the confirmed dominant noise.

## ✅ PHASE 0 — judge flicker FIXED + PROVEN (2026-06-13)

**Fix (committed `35efbf3`, TDD, 63 judge tests):** two prongs —
1. **Claim-recurrence gate** (`lab/judge/src/claimGate.ts`): the multi-round gate now trips only when the SAME claim recurs across a supermajority of rounds (stemmed token-Jaccard clustering), instead of counting heterogeneous per-round trips. Kills both failure modes — a different imagined claim each round, and a real claim escaping when its confidence dipped under a sharp cutoff.
2. **Temperature 0** on all judges (`rubric.ts`): determinism at the source; perspective diversity now comes from the personas, not random sampling.

**Empirical proof — same deployed answers judged TWICE, end-to-end (N=7, 7 questions × 3 panels = 21 decisions):**
- **Gate decision flips: 0 / 21.** Every pass/fail verdict identical across the two runs. The catastrophic 5–6 pt swings (e.g. Q3.2 ② 3.0↔8.8 pre-fix) are GONE.
- Gated panels: final = exactly 3.00 both passes (Δ 0.00).
- Clean decisive panels (③ tuned): final Δ 0.05–0.27.
- The only larger delta (0.69) was on the ① **website STUB** panel — a placeholder string, irrelevant to ②vs③.

**Honest residual:** the continuous *quality* score still varies ≤ ~0.3 run-to-run on clean panels, because Gemini is not bit-deterministic even at temperature 0 (provider-side nondeterminism). This is NOT zero — but it (a) never flips a gate decision, and (b) is far below the +1.0 win target. **Decision rule for Phase 1:** the autocorrect loop must only "keep" a mutation that beats the incumbent by MORE than this measured noise floor (~0.3) — a difference within the noise is treated as "no change / keep incumbent," never a false keep. That is how "no correction on wrong data" is guaranteed: the loop refuses to act on differences it cannot distinguish from noise. The noise floor will be re-measured per provider and the keep-margin set above it.

## RIGOROUS VERDICT — N=11 judge resample, deployed answers, Wilson 95% CI (2026-06-13)
`runId=20260613T025541Z`, curated 8-Q set (controls + targeted + persistent-fail). Gate% = fraction of 11 judge rounds that tripped the grounding gate; lower is better. q = stable pre-gate quality mean.

| Q | mut#1 target | ② gate% (95% CI) · q | ③v1 gate% (95% CI) · q | winner |
|---|---|---|---|---|
| 1.3 | | 100% [74–100] · 7.6 | **0% [0–26]** · 9.3 | ③ (clean, non-overlapping) |
| 3.2 | ★ | 64% [35–85] · 8.8 | **0% [0–26]** · 5.9 | ③ (clean, non-overlapping) |
| 4.1 | ★ | 100% [74–100] · 3.2 | 64% [35–85] · 5.8 | ③ (CIs touch) |
| 4b | | 100% [74–100] · 5.1 | 100% [74–100] · 2.9 | ② (both fail; ② higher q) |
| 7.1 | | 0% · 10.0 | 0% · 10.0 | ≈ (both refuse correctly) |
| 8.1 | ★ | 91% [62–98] · 7.3 | 64% [35–85] · 9.2 | ③ (CIs overlap) |
| 8.3 | | _judge error (invalid)_ | 100% [74–100] · 4.9 | — (③ fails) |
| 8.4 | ★ | 100% [74–100] · 5.5 | 73% [43–90] · 8.0 | ③ (CIs touch) |

### What this rigorously establishes
1. **③ beats ② directionally on 5 of 7 valid questions** (incl. all 4 mutation-targeted), ② wins 1 (4b), 1 tie (7.1).
2. **Two wins are statistically clean** (non-overlapping 95% CIs): 1.3 and 3.2 — ③ ~0% gate vs ② 64–100%.
3. **Mutation #1 is a KEEP.** On its 4 targeted questions ③'s gate rate dropped vs ② (and vs ③v0's gated baseline on 3.2/4.1/8.1/8.4), with no regression on the clean control (1.3 stayed 0%). Decision-core `decideKeep`: gate count down, clean-Q quality not regressed → keep. Mutation #1 stays deployed.
4. **BUT the absolute grounding promise is NOT met.** ③ still gates 64–100% on 4 of 8 questions. "110% grounded" is far off. And **even at N=11 the CIs are wide** (e.g. 64% [35–85]) — the gate flicker is so large that 11 samples don't cleanly separate the borderline cases. The two clean wins are real; the rest are directional.

### Honest conclusion for the report
On a strict grounded Gemini judge with flicker controlled: **③ (our optimized system) directionally beats ② (Ask-AI floor), with two statistically-clean per-question wins, and mutation #1 (grounded-lead) is a validated improvement.** However ③ does not yet hit a *sustained, tight-CI* system-level win, and neither system is close to "always grounded." The two remaining levers, in priority order, are **(1) stabilize the judge gate at the root** (claim-level agreement, not a confidence-vote — wide CIs are the current ceiling on provable wins) and **(2) fix the retrieval-gap failure class** (4b, 8.3 — keyword index returns no usable hits on known entities; a Rules/synonyms/Atlas question, not a prompt question). Further blind prompt mutations are low-value until (1) lands.
