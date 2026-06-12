# Atlas diagnosis — baseline `20260612T161131Z` (2026-06-12)

**Source:** 27-question v2 baseline, Case 2 (mirror) + Case 3 (tuned) on **Gemini 2.5 Pro**, website stubbed. Diagnosis is read directly from answers + retrieved hits (no judge). Purpose: answer "is Atlas needed here?" with data.

## Failure-class table

| Class | Severity | Where | Atlas the right fix? |
|---|---|---|---|
| **Index/corpus hygiene noise** — `job-boards.greenhouse.io` job postings + locale-duplicate blog variants (`/fr`,`/de`,`/en` of the same page) crowd out real content | **High / recurring** | 4.1, 4a (tuned: 3 job posts), 5.1, 5.2, 8.4 (mirror), 3.2 | **No** — fix by index filtering / a Query Rule excluding job pages + de-duping locales |
| **Canonical doc missed on entity comparisons** — authoritative product/doc page not retrieved; answer leans on a tangential support article | **Medium / recurring** | 6.1 (QuerySuggestions vs Recommend → "did-you-mean typos" article), 6.4 (custom-ranking vs DRR → only a "Visual Editor" article), 1.2 (canonical ranking-criteria doc buried at #2 under support tickets) | **Partially** — this is the ONLY class Atlas/Rules addresses. Try **Query Rules first** (pin canonical doc per known entity); separate Atlas index only if Rules is insufficient |
| **Under-retrieval / zero hits on an answerable query** | Low-Med | 8.6 (mirror refused a 5M-record scaling Q; tuned answered w/ 7 hits), 8.4 (tuned 0 hits) | No — query reformulation + index tuning |
| **Grounding leak (Gemini)** — answers from memory / fabricates URLs+metrics when retrieval is thin/empty | **High** | 8.4 tuned (2860ch + fabricated doc URLs on 0 hits); bait: 8 customers w/ exact % on 7 hits | No — agent-instruction hardening + bait re-verify (task #7). NOT an Atlas issue |

Refusals hold: 7.1 (capital of France), 7.2 (Elasticsearch), 7.4 (Kubernetes), absent-feature + exact-price baits all correctly refuse/stay grounded.

## Atlas verdict

**Atlas (a separate companion index) is NOT justified by this data.** Single-index retrieval mostly works. The two recurring *retrieval* failures both have lighter, native fixes:
1. **Index/corpus hygiene** (the dominant noise) — filter out job-board pages and de-dupe locale variants. Pure index/Rules work; Atlas would not touch it.
2. **Canonical-doc-missed on entity questions** (6.1, 6.4, 1.2) — the only class that even motivates Atlas. Per the approved plan, try **Arm R = native Query Rules** (pin/boost the canonical doc for known entities like Query Suggestions, Recommend, custom ranking, Dynamic Re-Ranking) BEFORE building a separate Atlas index. Build Atlas (Arm X) only if Rules proves insufficient.

→ **Recommendation: do not build Atlas now.** Do (a) index hygiene cleanup, (b) a small set of Query Rules for canonical entities, then re-measure 6.x/1.2. Revisit Atlas only if those native fixes don't close the gap.

## More urgent than Atlas: Gemini grounding regression
The gpt-5.2→Gemini switch reopened a grounding hole (gpt was previously bait-hardened). Gemini over-synthesizes when hits are thin/empty (8.4; customer-metrics bait). **Harden + re-verify grounding on the Gemini agents (task #7) before trusting any "110% grounded" claim or the quality numbers.**
