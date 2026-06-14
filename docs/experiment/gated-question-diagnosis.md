# Failure-Class Diagnosis — ③ "Our System" Gated Questions

_Source: verdict `20260612T140037Z` (v1 16-Q dev set, judge = gemini-2.5-pro, N=3). Diagnosis read transcript answers + retrieved sources + judge rationales. No new LLM calls._

## The question this answers
Our core promise is "110% grounded," yet ③ still tripped the grounding hard-gate on **5/16** questions (2.2, 3.2, 4b, 6.3, 8.1). Are these (a) genuine leakage, (b) retrieval gaps, or (c) judge over-gating? The answer decides whether we fix the prompt, the index, or the judge.

## Gate table (final scores; GATE = grounding hard-gate tripped)
| Q | ① web | ② Ask AI | ③ Ours | ③ pre-gate | ③ gate vote |
|---|---|---|---|---|---|
| 2.2 backend search w/ React InstantSearch | 3.40 | GATE | **GATE** | 7.02 | 3/3 |
| 3.2 what is vector search | 4.63 | GATE | **GATE** | 5.74 | 3/3 |
| 4b fashion ecommerce search | 3.74 | GATE | **GATE** | 7.68 | 3/3 |
| 6.3 filters vs facetFilters vs optionalFilters | 2.32 | GATE | **GATE** | 6.15 | 2/3 |
| 8.1 typo tolerance | 1.86 | GATE | **GATE** | 8.73 | 3/3 |

Note: ② Ask AI gated on **all 5** of these too. These are the hardest questions in the set.

## Verdict: the gate is RIGHT. These are real, narrow grounding holes — not judge noise.

Reading the full answers confirms it. The dominant pattern, present in 4 of the 5:

### Failure class #1 — "the confident topic sentence" (2.2, 3.2, 8.1, lead-in of 6.3)
The agent writes a fluent **opening definition/summary sentence from general knowledge**, then grounds the *body* in retrieved sources — and often even hedges correctly on what it lacks. The gate catches that the opening claim itself isn't traceable to a hit.

- **8.1 (typo tolerance):** pre-gate **8.73** — high quality. The body is meticulously cited (3 URLs) and the answer even includes a "## What I don't have in the retrieved content" section. But it opens with *"Algolia applies typo tolerance during matching so that results can still be returned even when the query contains typos"* — the general definition, which is **not in the 3 retrieved sources** (all about *disabling*/strict-match). The agent grounded everything except its own opening sentence.
- **6.3 (filters):** the body explicitly admits *"I don't have a documentation hit … that precisely defines how `filters` differs … so I can't go deeper."* Yet the **opening summary asserts** *"use `filters` for general 'filter-by-attributes' constraints."* The gate (2/3) caught the self-contradiction: a confident lead-in definition the agent itself later says it has no source for.
- **3.2 (vector search):** un-sourced definitional claim in the core definition.
- **2.2 (backend search):** un-sourced claim about what a "typical" backend architecture is.

### Failure class #2 — context over-generalization (4b)
7 generic-ecommerce sources retrieved, none fashion-specific; the agent **invented a "fashion" framing absent from the sources**. Part prompt-fixable (don't assert domain specifics not in hits), part genuine **content gap** (no fashion-specific doc in the index → correct behavior is a partial answer + explicit "no fashion-specific content").

### What it is NOT
- **NOT judge over-gating.** The flagged claims are specific and real — in 8.1 and 6.3 the agent itself later admits it lacks the source. The gate firing is correct.
- **NOT empty/lazy answers.** Pre-gate quality is 5.7–8.7; structure and citations are strong.
- **NOT (mostly) retrieval gaps.** Sources were retrieved every time (2–7). The miss is the *un-sourced lead sentence*, not absent retrieval — except 4b (content gap) and the `filters` sub-entity in 6.3 (partial retrieval).

## Implication for the autocorrect loop (task #4)
The dominant lever is a **Case-3 prompt mutation**, not index or judge changes:

1. **Forbid the un-sourced topic sentence.** Every sentence — *including the opening definition/summary* — must trace to a retrieved hit, or be explicitly framed as "based on the retrieved content…" / hedged. The bodies are already well-grounded; this targets the lead-in specifically.
2. **Partial-refusal discipline.** When sub-entities aren't in the hits (`filters` in 6.3; "fashion" in 4b), answer the covered parts and explicitly decline the uncovered part — don't let a confident summary paper over the gap. (The agent already does this in the body of 8.1/6.3 — make it the rule, and make it apply to the lead.)
3. **Retrieval follow-ups (secondary):** 4b suggests a possible fashion-vertical content gap; 6.3 a missing `filters` doc. Flag for index/synonym work only if the prompt fix alone doesn't clear them.

**Expected effect:** this should drive ③'s gate rate from 5/16 toward ~0 with little quality cost, because the un-sourced material is a thin lead-in over already-grounded bodies. That is precisely the kind of high-leverage, low-risk mutation the keep-if-better loop is built to validate.

## ROOT CAUSE found in the live prompt (2026-06-12, this session)

The live deployed Case-3 (verified via `agent_admin.mjs get b5c4de23` — 5897 chars, **no STOP-GATE**; the other lane's `grounded_v1`/STOP-GATE was authored but **never actually deployed**) contains two rules in direct tension:

- **`GROUNDING` rule 1:** "Every factual claim must be directly supported by a retrieved hit. No prior knowledge."
- **`ANSWER SHAPE` rule 1:** "**Direct answer first (1–2 sentences):** answer the literal question up front. **No preamble.**"

For "what is X / how does X work / when do I use X" questions, ANSWER-SHAPE rule 1 *wins*: the agent leads with a fluent definitional sentence — which, when the hits cover specifics but not the textbook definition, comes **from priors**. Then it grounds the body and even hedges the gaps. The gate correctly catches the un-sourced lead. **The prompt is literally instructing the behavior that gates it.**

### The mutation to test (task #4), high confidence
Reconcile the two rules — the "direct answer first" sentence must itself be source-traceable:
> *Direct answer first — **but built from the hits, not from prior knowledge.** A general definition or "what X is / how X works" summary sentence is itself a factual claim and must trace to a retrieved hit. If the hits don't contain the definition, lead with the specific, sourced facts you DO have (or state plainly that the content doesn't define X) — never open with a textbook definition from memory.*

This is a surgical, low-risk edit (the bodies are already grounded) and is the first keep-if-better candidate. Note: the **live v0 prompt ≈ what the 1pm `140037Z` verdict measured**, so this diagnosis applies to the current system — but the official baseline (task #3) must still be a **fresh run-tests** on the current Gemini agents (the `161131Z` transcript predates nothing relevant here, but ② was fixed *after* it).
