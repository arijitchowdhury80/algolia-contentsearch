# Content-Source Multi-Agent Routing — Spike Verdict: KILL

**Date:** 2026-06-28
**Question:** Does routing a question to a content-source-honed specialist (support→support agent, academy→academy agent, …) beat ONE all-source neural agent on answer quality — or is multi-agent just overhead?
**Verdict:** **KILL** as a quality play. Source routing gives no reliable lift over a single all-source neural agent. The single agent over the full corpus is the right architecture.

---

## The experiment (A/B/C)

Per question, three answers, judged blind by the 4-dim Confidence judge (same model across all panels + judge = fairness invariant):

| Panel | What | Hops |
|---|---|---|
| **A** | all-source neural agent (`ac2-allsource-neural`: `AC2_WWW_MULTI_NEURAL`, NO source filter = all 9 sources) | 1 |
| **B** | ORACLE-routed specialist (hand-labeled source → that specialist directly, no router) | 1 |
| **C** | REAL router (Maverick answers → LLM source-classifier → specialist) | 2 + classifier |

B isolates "does source-honing help" from "can the router classify". C adds router-error cost on top of B.
Set: 32 locked v3 questions + 6 span/ambiguous stress questions (S1–S6). 3 judge rounds.

Harness: `lab/server/src/experiments/sourceRoutingAb.ts` (+ pure `sourceRouting/{labels,classifier,routingAgg}.ts`, 18 unit tests). Run: `cd lab/server && npm run expt:sourcerouting -- --extras --rounds 3`.

---

## Result (airtight, confound-free)

| panel | n | mean | Δ vs A | grounding | coverage | depth | relevance | W/T/L vs A |
|---|---|---|---|---|---|---|---|---|
| A baseline (all-source) | 33 | 8.38 | — | 8.46 | 8.68 | 7.86 | 9.16 | — |
| B oracle (honed) | 33 | 8.63 | **+0.25** | 8.88 | 9.12 | 8.09 | 9.55 | 15/10/8 |
| C real router | 33 | 8.80 | +0.42 | 8.84 | 9.43 | 8.52 | 9.87 | 15/11/7 |

ΔBA = **+0.25, within the ±0.3 noise band → KILL.** Even perfect (oracle) routing to a honed specialist cannot beat the all-source agent by more than judge noise.

**Clean-vs-span split (the death knell):**
| subset | n | Δ B−A | Δ C−A |
|---|---|---|---|
| single-domain | 16 | +0.43 | +0.51 |
| span (2+ sources) | 17 | **+0.09** | +0.34 |

Span — cross-source synthesis, *the entire thesis of multi-agent* — shows **zero** lift (+0.09). The faint single-domain signal (+0.43) is retrieval focus, not orchestration.

**Cost it would buy:** Panel C ≈ 2× token cost (4337 vs 2218 proxy) + a classifier hop + a 27% misroute rate, for +0.25 quality (noise). (Latency unreliable — live API jitter.)

---

## Why the first run said the opposite (the methodology lesson)

The FIRST run used the incumbent **6-source Maverick** as the baseline and reported **+0.76, "multi-agent wins."** Maverick's charter excludes Academy/Support/Developers — it was *blind* to that content, so specialists won by default on those questions. Replacing the baseline with an **all-source agent on the same index, source filter removed** (the only variable vs a specialist = scope itself) collapsed the lift from +0.76 → +0.25. **The entire ~0.5 advantage was a baseline-blindness artifact, not honing.**

→ **NeuralSearch over the full corpus already retrieves the right chunks. Scoping retrieval down to a source slice does not beat it.**

Lesson (Fix-and-Learn): an A/B where the baseline can't access content the treatment can is not measuring the treatment — it's measuring access. Always give baseline and treatment the same information set; vary only the thing under test.

---

## Decision

- **Content-source multi-agent routing: KILLED** as a quality lever. It's overhead (cost + router failure mode), not lift.
- **Keep:** the single neural agent over the full corpus (simpler, cheaper, no misroute mode).
- **The faint single-domain +0.43:** if ever pursued, the lever is single-agent *retrieval quality* (ranking/dedup/focus), NOT a router.
- The existing intent-persona coordinator (Maverick→elena/bruno) is a separate question (sales-persona voice/depth), not addressed here and not validated by this spike.

## Caveats (kept honest)
- **Indicative judge:** agent stream gives only {title,url}; grounding is directional, not authoritative (symmetric across panels, so the composite Δ is the trustworthy signal). No authoritative full-source batch was run.
- **Flash-judge noise:** 5 rows dropped to malformed JSON (excluded from stats). One outlier (`1.1`: A=9.7, B=3.0) — the honed agent bombed a core technical Q the generalist nailed; legit data, cuts against honing.
- **Single-turn, opener-only.** Multi-turn cross-source synthesis not exercised beyond span openers.

## Artifacts
- `docs/experiment/source-routing-ab-results.json` / `source-routing-ab-summary.md` (this run = airtight).
- Baseline agent created by `scripts/setup/create_allsource_agent.mjs` (`ac2-allsource-neural`, idempotent).
