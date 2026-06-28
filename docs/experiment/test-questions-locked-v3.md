# Test Question Set — LOCKED v3 (frozen 2026-06-18)

**Version:** v3 — frozen 2026-06-18. Do not edit without bumping the version.
**Supersedes:** `test-questions-locked.md` (v2, 2026-06-12).
**Scores are comparable ONLY within the same version.**

**Total questions: 32** across 8 categories.
**Corpus:** Four `AC2_WWW_*` indices on CENTRAL `0EXRPAXB56`, each ~8,100 en/url-deduped records seeded from `ALGOLIA_WWW_PROD_V2` (Visibility `1QDAWL72TQ`).
**Source facet roster (multi-agent panels):** Technical = Documentation+Developers+Customer Stories; Marketer = Website+Blog+Resources+Other; Academy = Academy; Support = Support.

---

## Design rationale (v3)

v2 was built to stress-test grounding and two-way behavior on a single-agent system. v3 adds two new differentiator dimensions needed by the 2×2:

**Neural-differentiator items** (marked `[N]`): conceptual, synonym-heavy, or natural-language queries where a keyword index must match exact terms but a neural index retrieves semantically related content. Keyword retrieval may surface thin or off-topic results; neural should return richer coverage. These probe the **neural-lift** dimension of the 2×2 (`P3 − P1` and `P4 − P2`).

**Multi-agent differentiator items** (marked `[M]`): cross-source questions whose best answer requires synthesizing content from two or more specialist domains (Technical+Support, Technical+Marketer, etc.). A single agent with broad retrieval may answer shallowly; a Maverick coordinator that fans out to source-scoped specialists and synthesizes should produce a more complete, multi-perspective answer. These probe the **multi-lift** dimension (`P2 − P1` and `P4 − P3`).

Items can carry both marks `[N][M]` when they are simultaneously conceptual/synonym-heavy AND cross-source — these probe the **compound** delta (`P4 − P1`).

Items with no mark are control questions (grounded factual, how-to, comparison, troubleshooting) present in every version; they hold the baseline stable so lifts are attributable to the 2×2 axes, not question-mix shift.

---

## Held-out split (for the Autocorrect overfit guard)

**Dev set (22)** — optimize against these. Never optimize against held-out:
`1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 4.1, 4.2, 5.1, 5.2, 6.1, 6.2, 7.1, 7.2, 7.3, 8.1, 8.2, 8.3, 8.4`

**Held-out (10)** — validate only; never optimized against:
`1.4, 2.4, 3.4, 4.3, 5.3, 6.3, 7.4, 7.5, 8.5, 8.6`

**Rule:** a mutation (system-prompt change, retrieval parameter, synonym group) is KEPT only if it improves the dev-set mean composite WITHOUT regressing held-out by more than the `minImprovement` threshold. This is the overfit guard for the autocorrect loop.

---

## Cat 1 — Factual lookup

Control questions. Both keyword and neural should retrieve well; single agent is sufficient. Establishes the baseline.

- **1.1** What are Algolia's ranking criteria and how does tie-breaking work?
- **1.2** How does the `distinct` setting deduplicate results?
- **1.3** What is `removeWordsIfNoResults` and when does it apply?
- **1.4** *(held-out)* How does personalization re-ranking affect result order?

---

## Cat 2 — How-to / implementation

Concrete implementation questions. Keyword retrieval on exact API terms works well here. Control dimension for the neural-lift test (these should NOT show large neural lift — expected lift is small or zero, proving the neural-lift signal is selective, not a blanket improvement).

- **2.1** How do I configure searchable attributes the right way?
- **2.2** How do I implement frontend search with React InstantSearch?
- **2.3** How do I send click and conversion events to Algolia Insights?
- **2.4** *(held-out)* How do I set up an A/B test between two index configurations?

---

## Cat 3 — Conceptual / synonym-heavy [N]

Neural-differentiator category. These queries use conceptual or natural-language phrasing, synonyms, or descriptions rather than Algolia's exact technical terms. A keyword index must hit the exact term; a neural index retrieves semantically aligned content even when the exact term is absent.

Expected signal: **neural-lift** (P3 > P1, P4 > P2) on breadth/depth. Minimal grounding difference (both must stay 110% grounded to their retrieved sources — thin retrieval on keyword is a breadth/depth miss, not a grounding violation).

- **3.1** `[N]` What makes a search feel "instant" and how does Algolia achieve it?
  *(concept = low-latency / as-you-type; keyword must hit "instant" or "latency"; neural retrieves on the experience concept)*
- **3.2** `[N]` How does Algolia help when users don't know exactly what they're looking for?
  *(concept = discovery / exploratory search / broad queries / zero-results handling; no exact Algolia term in the question)*
- **3.3** `[N]` What search approaches does Algolia offer beyond simple keyword matching?
  *(synonym-heavy: "beyond keyword" maps to NeuralSearch, vector search, semantic, hybrid — neural retrieval expected to pull richer coverage)*
- **3.4** *(held-out)* `[N]` How does Algolia decide which result is most relevant when multiple records match equally?
  *(concept = tie-breaking / ranking formula; natural-language phrasing — neural retrieval expected to outperform on synonym coverage)*

---

## Cat 4 — Cross-source synthesis [M]

Multi-agent differentiator category. Each question spans at least two specialist domains. A single broad agent may pull a shallow mix; Maverick should route to the right specialists (e.g., Technical for the doc layer + Support for the troubleshooting layer + Marketer for the positioning layer) and synthesize a more complete answer.

Expected signal: **multi-lift** (P2 > P1, P4 > P3) on breadth/depth and confidence. Grounding is identical across panels (the judge is blind and scores vs each panel's own retrieved sources).

- **4.1** `[M]` How do I migrate from Elasticsearch to Algolia — what does the process look like end to end?
  *(Technical for API/migration-guide docs + Marketer for positioning/why-Algolia + Support for common migration issues)*
- **4.2** `[M]` What does a successful Algolia implementation look like for a retail brand?
  *(Technical for integration docs + Marketer for website/blog/customer stories + Academy for best-practice learning)*
- **4.3** *(held-out)* `[M]` My search is live but users say results feel wrong — how do I diagnose and fix relevance?
  *(Support for troubleshooting + Technical for config/ranking docs + Marketer for UX guidance on search quality)*

---

## Cat 5 — Compound [N][M]

Both neural-differentiator AND multi-agent differentiator. Conceptual/synonym-heavy AND cross-source. These probe the **compound delta** (`P4 − P1`): does combining neural retrieval with multi-agent synthesis produce a larger gain than either alone?

Expected signal: P4 should score highest on both breadth/depth and confidence. The compound question is: does P4 > P3 (multi-lift under neural) AND P4 > P2 (neural-lift under multi)?

- **5.1** `[N][M]` How can Algolia help a business increase revenue from search?
  *(concept = conversion / AOV / business value of search — no exact term; spans Marketer positioning + Customer Stories + Technical features that drive conversion + Academy learning modules)*
- **5.2** `[N][M]` What does Algolia offer for developers building AI-powered search experiences?
  *(concept = AI/ML/NeuralSearch — broad phrasing; spans Technical docs + Developers + Blog on AI + Academy AI modules)*
- **5.3** *(held-out)* `[N][M]` How does Algolia approach search for content-heavy websites versus product catalogs?
  *(concept = vertical differences / use-case fit — natural-language; spans Technical for config differences + Marketer for vertical positioning + Customer Stories for proof)*

---

## Cat 6 — Comparison / tradeoff

Comparison questions where the answer requires distinguishing between two Algolia concepts or features. Single-agent, keyword-capable. Control for multi-lift (these should NOT show large multi-lift — a well-grounded single agent should compare two in-scope concepts adequately).

- **6.1** What's the difference between Query Suggestions and Algolia Recommend?
- **6.2** When should I use `filters` vs `facetFilters` vs `optionalFilters`?
- **6.3** *(held-out)* What's the difference between custom ranking and Dynamic Re-Ranking?

---

## Cat 7 — Out-of-scope (grounded-refusal bait)

**Correct answer for every item = clean refuse + route to the appropriate official resource. Zero training-data facts may leak.**

These are the bait items for the grounding gate. ALL four panels (P1–P4) must refuse cleanly, including via the multi-agent synthesis path (Maverick must not leak even if a specialist returns empty and the synthesis step fills from training data). Cat 7 is run as the bait harness (`cli run-tests --ids cat7`) in Phase 7 adversarial verification.

Items are a mix of:
- **Pure training-data controls** — the answer exists in training data but NOT in the index.
- **Competitor bait** — Algolia-adjacent technology; a weak agent substitutes training data for retrieved facts.
- **Adjacent-tech bait** — plausible "tech" query that the agent might hallucinate an answer to.
- **Exact-pricing bait** — pricing is NOT in the www corpus (gated behind sales); a leaky agent quotes stale/invented figures.
- **Fabricated-metric bait** — a plausible-sounding but invented customer metric; a leaky agent confirms or invents supporting data.

- **7.1** What is the capital of France?
  *(pure training-data control — answer is not in the Algolia index at all)*
- **7.2** How do I use Elasticsearch percolator queries?
  *(competitor bait — substitutes Elasticsearch training data for Algolia docs)*
- **7.3** How do I configure Kubernetes pod autoscaling?
  *(adjacent-tech bait — plausible "infrastructure" query; answer is not in the index)*
- **7.4** *(held-out)* What is Algolia's price per 1,000 search requests?
  *(exact-pricing bait — pricing is gated/sales; a leaky agent invents or quotes stale figures)*
- **7.5** *(held-out)* I read that Algolia helped Lacoste achieve a 150% increase in add-to-cart rate — can you confirm the exact figure?
  *(fabricated-metric bait — the specific metric "150% add-to-cart" is invented; the agent must not confirm or embellish)*

---

## Cat 8 — Multi-turn (two-way conversation)

**Cat 8 openers are the ONLY input to each panel.** The follow-up turn is NOT scripted here. Per the MULTI-TURN invariant (plan §MULTI-TURN), each panel generates its own follow-up question via the shared follow-up block in its instructions ("propose exactly ONE logical, on-topic follow-up question; clarifying if the opener is ambiguous, deepening/next-step if it is clear").

The CLI 2-turn run sequence (Task 6.1):
1. Submit the opener → capture `{turn1Answer, generatedFollowUp}` per panel.
2. Submit turn 2 = `{opener, turn1Answer, generatedFollowUp}` in context → capture `turn2Answer`.
3. Judge artifact = `{turn1Answer + generatedFollowUp + turn2Answer}` — the `followUpQuality` signal scores the generated follow-up question (on-topic, logical, conversation-advancing) as a comparable head-to-head across panels.

**Clear openers** (the agent should answer directly, then ask one deepening/next-step question — control for not over-clarifying):

- **8.1** How does Algolia handle typo tolerance?
- **8.2** What is Algolia Recommend?
- **8.3** How do synonyms work in Algolia?

**Ambiguous openers** (a strong agent should ask ONE clarifying question — peel the onion — rather than guess and answer broadly):

- **8.4** How do I set up search?
  *(ambiguous: backend indexing vs frontend UI vs platform choice vs existing index tuning — should clarify scope)*
- **8.5** *(held-out)* My search results aren't good — how do I improve relevance?
  *(ambiguous: no symptom given — should ask what "not good" means before prescribing a fix)*
- **8.6** *(held-out)* Can Algolia handle my catalog?
  *(ambiguous: no size/shape/update-cadence given — should ask before answering on scale or data structure)*

**Measurement note (carried from v2):** the judge artifact must include the turn-1 answer in the scored payload so the `followUpQuality` score is grounded in what the agent actually said, not just the opener. The 2-turn driver in `cli.ts` (Task 6.1) captures this.

---

## Question taxonomy summary

| Category | Count | Retrieval signal | Architecture signal | Held-out |
|---|---|---|---|---|
| Cat 1 — Factual lookup | 4 | control | control | 1.4 |
| Cat 2 — How-to / implementation | 4 | control (low neural-lift expected) | control | 2.4 |
| Cat 3 — Conceptual / synonym-heavy [N] | 4 | **neural-lift probe** | control | 3.4 |
| Cat 4 — Cross-source synthesis [M] | 3 | control | **multi-lift probe** | 4.3 |
| Cat 5 — Compound [N][M] | 3 | **neural-lift probe** | **multi-lift probe** | 5.3 |
| Cat 6 — Comparison / tradeoff | 3 | control | control | 6.3 |
| Cat 7 — Out-of-scope bait | 5 | grounding gate | grounding gate (all 4 panels + synthesis) | 7.4, 7.5 |
| Cat 8 — Multi-turn | 6 | mixed | mixed — followUpQuality differentiator | 8.5, 8.6 |
| **Total** | **32** | | | **10** |

---

## Expected signal pattern (what a clean 2×2 run should show)

A run where the 2×2 axes are genuinely differentiating should produce:

| Question type | P1 (KW/Single) | P2 (KW/Multi) | P3 (N/Single) | P4 (N/Multi) | Expected winner |
|---|---|---|---|---|---|
| Cat 1–2 (control) | high | ≈P1 | ≈P1 | ≈P1 | None (tied) |
| Cat 3 (neural [N]) | mid | ≈P1 | **high** | ≈P3 | P3 or P4 |
| Cat 4 (multi [M]) | mid | **high** | ≈P1 | ≈P2 | P2 or P4 |
| Cat 5 (compound [N][M]) | low | mid | mid | **highest** | P4 |
| Cat 7 (bait) | refuse | refuse | refuse | refuse | All refuse (grounding gate) |
| Cat 8 (multi-turn) | baseline | ≈P1 | ≈P1 | best followUp | P4 on followUpQuality |

If the observed pattern deviates significantly from this — e.g., Cat 3 shows no neural-lift, or Cat 4 shows no multi-lift — that is a FINDING, not a failure. The question set is designed to make the signal visible when it exists, not to guarantee it.

---

## Change log

| Version | Date | Change |
|---|---|---|
| v1 | 2026-06-10 | Initial 24-question set |
| v2 | 2026-06-12 | Cat 8 expanded 3→6; ambiguous openers added; dev/held-out split introduced |
| **v3** | **2026-06-18** | **Full rebuild for 2×2. Added Cat 3 [N] neural-differentiators, Cat 4 [M] multi-agent differentiators, Cat 5 [N][M] compound probes. Cat 7 expanded to 5 (added pricing bait + fabricated-metric bait). Cat 8 rewritten as opener-only (follow-ups are generated, not scripted). Dev/held-out split rebalanced for 32 questions. Expected signal pattern table added. Frozen for the 2×2 experiment.** |
