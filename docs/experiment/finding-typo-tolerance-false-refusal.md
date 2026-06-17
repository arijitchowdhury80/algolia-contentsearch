# Finding: ③ false-refused "How does Algolia handle typo tolerance?"

_Date: 2026-06-14. Surfaced by the new live-judge UI (③ refused; judges scored it 2.0,
② 8.8). Investigated via systematic-debugging — root cause proven, not guessed._

## Symptom
In the lab UI, ③ Our System refused a clearly-answerable question with off-topic
SOURCES (Google Ad Manager, Handling natural languages, Structured results in
React InstantSearch…). ② Ask AI answered it richly. Live judges scored ③ 2.0/10.

## NOT the cause (ruled out by evidence)
- **Index content / health.** Direct REST search of `visibility_www_tuned`:
  - `"typo tolerance"` → #1 `typoTolerance`, #2 *Typo tolerance*, #3 *Configure typo tolerance* (56 hits). ✅
  - full question `"How does Algolia handle typo tolerance?"` → #1 *typing mistakes*, #2 *Typo tolerance*. ✅
  The canonical docs are present and rank top. The index is healthy.
- **Agent grounding rule.** The refusal was CORRECT given the hits it received —
  "a grounded 'I don't have that' beats a guess." Grounding worked as designed.

## Root cause (reproduced)
A **precision/recall backfire between a long agent reformulation and the tuned
index's relaxed matching.**

1. The agent reformulated to a long, filler-padded keyword query (~6 words) instead
   of the tight core. Its prompt said "3–8 keywords… if thin, try ONE *broader*
   reformulation" — "broader" is exactly the wrong direction here.
2. The tuned index runs `removeWordsIfNoResults: "allOptional"` (+ `removeStopWords:["en"]`,
   synonyms). On a long query with no full match, **all words become optional** →
   match any single word → thousands of loose hits.
3. Ranking then floats tangential docs (sharing more scattered words) ABOVE the
   canonical typo docs, which get buried out of the top-N.
4. Agent sees off-topic top-N → correctly refuses.

**Reproduction (tuned index, direct REST):**
```
q="typo tolerance handling user queries intent normalization"  → nbHits=1193
  1. Can I use Google Ad Manager … with Algolia?
  2. How do I handle relevancy for dimensions/measurement data
  3. Why is Typo Tolerance not applying on a Standard Replica?
  4. How do you get the "did you mean?" style message…
  5. Handling natural languages | Algolia      ← matches the UI's junk set exactly
q="typo tolerance"                              → #1 typoTolerance, #2 Typo tolerance ✅
q="Algolia handle spelling mistakes user intent"→ #1 Typo tolerance, #2 typing mistakes ✅ (short = fine)
```
The mirror index (`removeWordsIfNoResults:"none"`, strict) doesn't over-broaden, so
② never hit this.

## Caveat (test conditions)
The screenshot was captured WHILE the autocorrect optimization run was live-swapping
③'s system prompt (a machine-rewritten 5,220-char candidate was deployed vs the
7,359-char baseline). The reformulation instruction survived the rewrite, so the
issue is systemic (verbose reformulation × allOptional), not specific to the candidate.

## Fixes (either resolves; agent-side preferred)
- **Agent (preferred, low-risk):** reformulate to the 2–4 most salient nouns; drop
  filler ("handle/user/intent/help"); on off-topic/scattered hits, RE-SEARCH with
  FEWER/tighter keywords (narrow, not broaden) before refusing.
  Staged: `scripts/setup/instructions_case3_reformulation_fix_v1.md` (NOT deployed —
  waiting for the optimization run to finish so it doesn't fight the loop).
- **Index (bigger hammer):** `removeWordsIfNoResults: allOptional → lastWords` on
  `visibility_www_tuned` (drops trailing words progressively instead of making all
  optional). Keeps recall for short NL queries, kills the long-query explosion.
  Verify by re-running the reproduction queries after the change.

## Status
Diagnosed + reproduced + staged. NOT applied (optimization run in flight). Apply
the agent fix first post-run, re-test in the UI, then decide if the index knob is needed.
