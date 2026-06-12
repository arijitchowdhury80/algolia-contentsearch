# Test Question Set — LOCKED v2 (frozen 2026-06-12)

**27 questions.** Frozen for the experiment; do not edit without bumping the version (v3, …) — scores are only comparable within a version.
**Corpus:** `ALGOLIA_WWW_PROD_V2` (www mirror; includes docs, support, blog, academy, resources). Coverage verified in `test-questions-draft.md`.
**Curation rules (Arijit, 2026-06-12):** 3 per category; category 4 carries BOTH high-fashion-luxury (stress test vs the live Ask AI answer) AND fashion-ecommerce (fair, well-grounded).

**v2 change (2026-06-12) — two-way discovery expansion.** Cat 8 grew from 3 → 6 multi-turn questions (intentional deviation from "3 per category": 3 was too thin to trust an engagement score, and Cat 8 is the only category that tests two-way behavior). The 3 new cases (8.3, 8.4, 8.6) open with a **genuinely ambiguous** prompt where a strong assistant should ask ONE clarifying question (peel the onion) rather than guess; the follow-up turn supplies the disambiguation. The existing 8.1/8.2/8.5 stay as "clear opener → answer + narrow follow-up" cases, which double as the control for *not over-clarifying*. ⚠️ **Measurement note:** judging clarification + non-repetition requires the harness to include the turn-1 answer in the judged artifact (today it judges only the follow-up answer) — pending harness enhancement.

## Held-out split (for the Autocorrect loop)
- **Dev set (18)** — optimize against these: 1.2, 1.3, 2.1, 2.2, 3.1, 3.2, 4.1, 4b, 5.1, 5.2, 6.1, 6.3, 7.1, 7.2, 8.1, 8.2, 8.3, 8.4
- **Held-out (9)** — validate only; never optimized against: 1.5, 2.4, 3.3, 4a, 5.4, 6.4, 7.4, 8.5, 8.6
- Rule: a mutation is kept only if it improves dev WITHOUT regressing held-out (overfit guard).

---

## Cat 1 — Factual lookup
- **1.2** What are Algolia's ranking criteria and how does tie-breaking work?
- **1.3** How does the `distinct` setting deduplicate results?
- **1.5** How does personalization re-ranking affect result order?

## Cat 2 — How-to / implementation
- **2.1** How do I configure searchable attributes the right way?
- **2.2** How do I implement backend search with React InstantSearch?
- **2.4** How do I send click and conversion events to Algolia Insights?

## Cat 3 — Conceptual explainer
- **3.1** What is NeuralSearch and how does it rank results?
- **3.2** What is vector search?
- **3.3** What is Dynamic Re-Ranking and how does it work?

## Cat 4 — Broad / exploratory
- **4.1** How does Algolia support ecommerce and retail search?
- **4a** How does Algolia handle high-fashion luxury retail? *(stress test — thin corpus; mirrors the live Ask AI answer Arijit tested)*
- **4b** How does Algolia support fashion ecommerce search? *(fair test — well-grounded)*

## Cat 5 — Troubleshooting
- **5.1** I suddenly exceeded my record usage — what do I do?
- **5.2** Why are some of my records not showing up in search results?
- **5.4** Is there a rate limit for indexing, and what triggers rate limiting?

## Cat 6 — Comparison
- **6.1** What's the difference between Query Suggestions and Algolia Recommend?
- **6.3** When should I use `filters` vs `facetFilters` vs `optionalFilters`?
- **6.4** What's the difference between custom ranking and Dynamic Re-Ranking?

## Cat 7 — Out-of-scope (grounded-refusal tests; correct answer = refuse + route)
- **7.1** What is the capital of France? *(pure training-data control)*
- **7.2** How do I use Elasticsearch percolator queries? *(competitor bait)*
- **7.4** How do I configure Kubernetes pod autoscaling? *(adjacent-tech bait)*

## Cat 8 — Multi-turn follow-up (two-way conversation)
_Clear openers (answer directly, then one narrow follow-up — control for **not** over-clarifying):_
- **8.1** How does Algolia handle typo tolerance? → *Can I turn it off for a specific attribute or words?*
- **8.2** What is Algolia Recommend? → *What is the "Frequently Bought Together" model exactly?*
- **8.5** How do synonyms work in Algolia? → *What about one-way synonyms specifically?*

_Ambiguous openers (a strong assistant should ask ONE clarifying question, then answer; the follow-up supplies the disambiguation):_
- **8.3** How do I set up search? → *For a React storefront — the customer-facing frontend UI.* *(ambiguous: backend indexing vs frontend UI vs platform — should clarify)*
- **8.4** My search results aren't good — how do I improve relevance? → *Exact product-name matches are ranking below loosely-related items.* *(ambiguous: no symptom given — should ask what "not good" means before prescribing)*
- **8.6** Can Algolia handle my catalog? → *About 5 million product records, updated roughly hourly.* *(ambiguous: no size/shape/update cadence — should ask before answering on scale)*
