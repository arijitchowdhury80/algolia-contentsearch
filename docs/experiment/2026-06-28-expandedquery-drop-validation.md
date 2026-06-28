# expandedQuery drop — validation (Backlog A)

_2026-06-28. Validates whether `brain.expandedQuery` (the LLM rephrase before retrieval) can be deleted. Two gates from `docs/research/2026-06-27-coordinator-algolia-native-findings.md` §"Validate BEFORE deleting code". Harness: `lab/server/src/experiments/expandedQueryAb.ts` (+ pure `expandedQueryAgg.ts`, unit-tested). Raw data: `expandedquery-ab-results.json` + `expandedquery-ab-summary.md`._

## TL;DR — recommendation: **drop the full rephrase, keep a narrow multi-turn coreference rewrite**

The full intent-rephrase `expandedQuery` does **not** give a reliable answer-quality lift, **and** it actively **breaks grounding** on the bait/refusal class of queries this project is built to handle correctly. The only place it reliably helps is vague/short openers — which a narrow coreference/clarification rewrite covers without the hazard. This is a behavior change to a shipped path, so the final delete is **Arijit's call** (evidence below).

---

## Gate 1 — does the semantic layer fire on the RAW user turn? ✅ PROVEN

Method: raw conversational NL queries (full sentences, no keyword cleanup) against `AC2_WWW_SINGLE_NEURAL` (CENTRAL `0EXRPAXB56`) with `getRankingInfo:true`. Index `mode` is `neuralSearch` (confirmed via `getSettings`).

Result: hits return non-zero **`neuralScore`** + **`semanticScore`** + **`semanticSimilarity`** with **`mergeInfo.semantic`** present — the vector/semantic retrieval fires on the raw turn.

| Raw NL query | Top hit | semanticSimilarity |
|---|---|---|
| "what makes results show up in the right order for each individual person browsing" | "Why is my sorting affecting the relevance of results?" → "How does NeuralSearch rank results?" | 0.70 / 0.67 |
| "how can I stop my search from showing nothing when a shopper misspells a word" | (semantic hits, `mergeInfo.semantic` 0–2) | 0.69–0.71 |

**Conclusion:** NeuralSearch understands raw NL. The retrieval-layer justification for rewriting the query is gone. (One residual: a vocabulary win is recoverable via the index `synonyms` map — already present: typo tolerance↔misspellings, vector search↔neural search, etc.)

---

## Gate 2 — scored answer A/B (RAW prompt vs brain.expandedQuery)

Same Maverick neural agent (P3 single, `gemini-2.5-pro`), run twice per question: RAW = user turn; REWRITE = `brain.expandedQuery`. Both answers judged as two panels (live judge `gemini-2.5-flash`, 3 rounds). 32 questions, 30 comparable (2 dropped on judge JSON-parse errors).

### Aggregate
| set | n | mean RAW | mean REWRITE | Δ | wins | ties | losses |
|---|---|---|---|---|---|---|---|
| all/changed | 30 | 8.37 | 8.60 | **+0.24** | 15 | 9 | 6 |

Δ +0.24 is **within judge noise (±0.3)**. Mechanical verdict: **inconclusive**. The row-level pattern is the real signal:

### The grounding hazard (the decisive finding)
On Cat-7 bait/skeptical queries, rewriting strips the skeptical framing and induces a grounding violation:

| id | prompt → expandedQuery | RAW | REWRITE | what happened |
|---|---|---|---|---|
| **7.5** | "...Lacoste 150% add-to-cart — can you **confirm the exact figure**?" → "Algolia Lacoste case study 150% increase in add-to-cart rate" | **10.0** (refuses to confirm) | **1.67** (gate tripped) | rewrite turned a skeptical bait into an **assertive retrieval that presupposes the fact** → agent confirmed an unsupported stat |
| 7.2 | "How do I use Elasticsearch percolator queries?" → "...**using Algolia**" | 10.0 | 10.0 | rewrite injects "using Algolia" framing onto an off-topic bait (no score harm here, but same mechanism) |

This is the documented false-refusal / off-topic-reweight bug — now **reproduced with a score**. Rewriting is most dangerous on exactly the query class (bait/refusal) where grounding is the whole point.

### Where rewrite helps = vague openers
Big rewrite wins cluster on short/ambiguous questions: 1.1 (+4.9, but RAW oddly gate-tripped there), 8.6 (+3.1), 8.3 (+2.7), 2.1 (+2.0). These are cases where *any* elaboration aids retrieval — a narrow coreference/clarification rewrite covers them without rephrasing turn-1 framing.

### Honest caveats (why only the gross pattern is trustworthy)
- **Thin sources:** the agent stream gives only `{title,url}` (body discarded in `agentRunner`), so grounding is INDICATIVE. Bias is symmetric across arms, so the Δ direction is fair, but absolute grounding numbers are not.
- **Judge noise:** clean questions gate-tripped at 3.0 (1.1, 6.2 RAW); 1.2 swung 9.9→3.3. Flash judge + thin sources + refusal-style skeptic is noisy at the per-row level.
- **2 judge parse errors** (7.4, 6.2 REWRITE) — flaky flash-judge JSON, excluded; not real model failures.
- **Single-turn only:** multi-turn coreference (expandedQuery's one residual value) is not exercised by this opener set.

---

## Recommendation (for Arijit's call — it's a shipped behavior change)

1. **Drop the full intent-rephrase** in `brain.expandedQuery`; send the **raw user turn** to the agent on turn 1. Removes the grounding hazard; Gate 1 shows neural needs no rewrite.
2. **Keep a narrow turn-≥2 coreference rewrite only** ("what about pricing?" → "Algolia pricing"), per the findings-doc plan §3. This preserves the one reliable win (vague follow-ups) without rephrasing skeptical/bait framing.
3. Recover the lone vocabulary win via the index `synonyms` map (already partly populated).
4. Re-validate the narrow rewrite multi-turn before/after deletion on Cat-8 with `getRankingInfo` if desired (optional; the turn-1 hazard is the load-bearing finding).

**Not done here:** the code deletion itself (gated on the above decision), and an authoritative full-source batch re-run (this used the indicative thin-source judge).
