# Test Question Set — DRAFT (for human curation, then freeze)

**Status:** DRAFT. Co-review with Arijit, then lock. Do not run the experiment until this set is frozen.
**Corpus tested:** index `ALGOLIA_WWW_PROD_V2` on app `VVKSSPDMJX` — our faithful mirror of algolia.com's www search index (~15k records: docs, support, blog, academy, website, resources, careers).
**Date verified:** 2026-06-12.

## Methodology

Every candidate below was probed against the live mirror index using the **search-only** key, READ-ONLY (no writes, no admin keys, no agent calls). For each question I extracted 3–5 **keyword** terms (the index is strict AND-match — full natural-language sentences return 0 hits) and recorded `nbHits` plus the top-ranked hit's title + category + URL as coverage evidence.

Coverage grades:
- **strong** = direct, on-topic doc/support/blog content as the top hit; multiple relevant hits.
- **weak** = topic is present but thin, indirect, or the top hits are tangential (e.g. a job posting or a single asset rather than explanatory content).
- **none** = 0 hits or only irrelevant matches. For the out-of-scope category this is the *intended, desirable* result (it tests grounded refusal).

**What this verification proves:** the supporting content physically exists in the corpus and is retrievable by keyword — so a correct answer is *possible* and a refusal would be *wrong* (except category 7).
**What it does NOT prove:** that the agent will actually retrieve it, synthesize it correctly, or ground its answer. That is exactly what the experiment measures. Coverage here is a *floor*, not a guarantee of answer quality.

---

## Category 1 — Factual lookup

| # | Question | What it tests | Coverage | Evidence (nbHits, top hit) |
|---|----------|---------------|----------|----------------------------|
| 1.1 | How does Algolia handle typo tolerance? | Single-concept factual recall | strong | 37 — "Typo tolerance" (Doc) `/doc/guides/managing-results/optimize-search-results/typo-tolerance` |
| 1.2 | What are Algolia's ranking criteria and how does tie-breaking work? | Precise factual detail | strong | 4 — "The eight ranking criteria" (Doc) `/doc/guides/managing-results/relevance-overview/in-depth/ranking-criteria` |
| 1.3 | How does the `distinct` setting deduplicate results? | Specific parameter behavior | strong | 12 — "Results deduplication with distinct" (Doc) `/doc/guides/managing-results/refine-results/grouping` |
| 1.4 | What does `aroundRadius` do in geo search? | API-parameter fact | strong | 7 — "aroundRadius" (Doc) `/doc/api-reference/api-parameters/aroundRadius` |
| 1.5 | How does personalization re-ranking affect result order? | Factual recall on a feature | strong | 39 — "Set personalization re-ranking" (Doc) `/doc/guides/personalization/advanced-personalization/configure/setup/personalization-reranking` |

## Category 2 — How-to / implementation

| # | Question | What it tests | Coverage | Evidence (nbHits, top hit) |
|---|----------|---------------|----------|----------------------------|
| 2.1 | How do I configure searchable attributes the right way? | Step-by-step implementation | strong | 18 — "Configure searchable attributes the right way" (Doc) `/doc/guides/managing-results/must-do/searchable-attributes/how-to/configuring-searchable-attributes-the-right-way` |
| 2.2 | How do I implement backend search with React InstantSearch? | Framework-specific how-to | strong | 13 — "Implement backend search with React InstantSearch" (Doc) `/doc/guides/building-search-ui/going-further/backend-search/in-depth/backend-instantsearch/react` |
| 2.3 | How do I build a Query Suggestions UI with React InstantSearch? | Tutorial-style how-to | weak | 1 — "Build a Query Suggestions UI with React InstantSearch" (Doc) `/doc/guides/building-search-ui/ui-and-ux-patterns/query-suggestions/tutorials/building-query-suggestions-ui/react` (broaden to "Query Suggestions" → 194 hits if a wider question is wanted) |
| 2.4 | How do I send click and conversion events to Algolia Insights? | Implementation across SDK/connectors | strong | 25 — "createAlgoliaInsightsPlugin" (Doc) `/doc/ui-libraries/autocomplete/api-reference/autocomplete-plugin-algolia-insights/createAlgoliaInsightsPlugin` (also "Send events" guide) |
| 2.5 | How do I export and import indices and their settings? | Operational how-to | strong | 29 — "Export and import indices and settings" (Doc) `/doc/guides/sending-and-managing-data/manage-indices-and-apps/manage-indices/how-to/export-import-indices` |

## Category 3 — Conceptual explainer

| # | Question | What it tests | Coverage | Evidence (nbHits, top hit) |
|---|----------|---------------|----------|----------------------------|
| 3.1 | What is NeuralSearch and how does it rank results? | Concept synthesis | strong | 74 — "NeuralSearch: Fundamentals" (Academy) `https://academy.algolia.com/training/01995974-63ae-715c-b8cc-b91ded19ae3d` (also "NeuralSearch Explainability") |
| 3.2 | What is vector search? | Foundational concept | strong | 16 — "What is vector search?" (Blog/AI) `/blog/ai/what-is-vector-search` |
| 3.3 | What is Dynamic Re-Ranking and how does it work? | Feature concept | strong | 97 — "Dynamic Re-Ranking" (Doc) `/doc/guides/algolia-ai/re-ranking` |
| 3.4 | What is AI-powered search architecture and why does it matter? | Higher-level concept synthesis | strong | 102 — "AI-powered search architecture: why search is now a product experience" (Blog/AI) `/blog/ai/ai-powered-search-architecture` |
| 3.5 | What are Rules and how are they used for merchandising? | Concept + application | strong | 16 — "Add search parameters with JSON" (Doc, Rules/merchandising) `/doc/guides/managing-results/rules/merchandising-and-promoting/how-to/rules-query-parameters` |

## Category 4 — Broad / exploratory (tests synthesis breadth)

| # | Question | What it tests | Coverage | Evidence (nbHits, top hit) |
|---|----------|---------------|----------|----------------------------|
| 4.1 | How does Algolia support ecommerce and retail search? | Wide synthesis across many assets | strong | 143 — "Search engine query processing 101" (Blog/Ecommerce) `/blog/ecommerce/how-ecommerce-search-engines-handle-different-types-of-queries` |
| 4.2 | How does Algolia help with search merchandising and conversion? | Synthesis across blog/ebooks | strong | 37 — "7 Ways to Get More Out of Algolia Search" (Ebooks) `/resources/asset/ebook-7waysmorefromalgoliasearch` |
| 4.3 | How does Algolia support B2B ecommerce search? | Vertical synthesis | strong | 110 — "AI trends in B2B ecommerce search 2026" (Ebooks) `/resources/asset/ebook-ai-trends-in-b2b-ecommerce-search-2026` |
| 4.4 | How does Algolia support fashion and luxury retail brands? | Vertical synthesis — **THINNER** | weak | 35 for "fashion ecommerce search" — top hit "The Searchlight Series: Nate Barad on the impact of AI on fashion" (Blog) `/blog/ecommerce/searchlight-series-ai-fashion-impact`. NOTE: "luxury brand search" → only 3 hits (one relevant: TAG Heuer webinar). "fashion luxury retail" → only careers pages. The luxury/fashion angle is *answerable but shallow*; recommend phrasing around "fashion ecommerce" rather than "high-fashion luxury" so the agent has real content to ground on. |

## Category 5 — Troubleshooting

> **Coverage note (honest flag):** The www mirror **does include support.algolia.com articles**, so troubleshooting questions ARE answerable from this corpus — better than expected. The original concern (that support content lives only on the SUPPORT site) does not hold here; these articles are indexed in the mirror. Coverage is genuine but support-heavy (most top hits are `support.algolia.com` Q&A articles, not doc guides).

| # | Question | What it tests | Coverage | Evidence (nbHits, top hit) |
|---|----------|---------------|----------|----------------------------|
| 5.1 | I suddenly exceeded my record usage — what do I do? | Troubleshoot from support content | strong | 4 — "Why am I getting 'Record quota exceeded. Change plan or delete records'…" (Support/DocSearch) `https://support.algolia.com/hc/en-us/articles/10108821083281-...` (also "How does Algolia count records and operations") |
| 5.2 | Why are some of my records not showing up in search results? | Diagnostic reasoning | strong | 4 — "Why isn't Algolia searching all my records' attributes?" (Support) `https://support.algolia.com/hc/en-us/articles/37905596422545-...` |
| 5.3 | Why am I getting a 403 "Invalid Application-ID or API key" error? | Error-message troubleshooting | strong | 4 — "Why am I getting 403 error … with DocSearch?" (Support) `https://support.algolia.com/hc/en-us/articles/11217017604497-...` |
| 5.4 | Is there a rate limit for indexing, and what triggers rate limiting? | Operational troubleshooting | strong | 9 — "Is there a rate limit for indexing on Algolia?" (Support) `https://support.algolia.com/hc/en-us/articles/4406975251089-...` |

## Category 6 — Comparison

| # | Question | What it tests | Coverage | Evidence (nbHits, top hit) |
|---|----------|---------------|----------|----------------------------|
| 6.1 | What's the difference between Query Suggestions and Algolia Recommend? | Two-feature compare | strong | Both well-covered: "Query Suggestions" → 194 ("Query Suggestions API" Doc); "Algolia Recommend" → 724 ("Algolia Recommend" overview Doc `/doc/guides/algolia-recommend/overview`) |
| 6.2 | What's the difference between Searchable, Not Searchable, and Filter-Only facets? | Fine-grained config compare | strong | 11 — "What's the difference between Not Searchable, Searchable and Filter-Only facets?" (Support) `https://support.algolia.com/hc/en-us/articles/29564891657361-...` |
| 6.3 | When should I use `filters` vs `facetFilters` vs `optionalFilters`? | API-parameter compare | strong | 5 — "optionalFilters" (Doc) `/doc/api-reference/api-parameters/optionalFilters` (plus support article on conjunctive/disjunctive facets) |
| 6.4 | What's the difference between custom ranking and Dynamic Re-Ranking? | Ranking-mechanism compare | strong | custom ranking → 18 hits; Dynamic Re-Ranking → 97 hits ("Dynamic Re-Ranking" Doc `/doc/guides/algolia-ai/re-ranking`). Both sides present for a genuine comparison. |

## Category 7 — Out-of-scope (deliberately NOT in corpus — tests grounded refusal)

> These SHOULD return zero coverage. A correct agent **refuses + routes**, citing no source. Any substantive answer here is a grounding failure.

| # | Question | What it tests | Coverage | Evidence (nbHits, top hit) |
|---|----------|---------------|----------|----------------------------|
| 7.1 | What is the capital of France? | Pure training-data bait (general knowledge) | none ✓ | 0 hits |
| 7.2 | How do I use Elasticsearch percolator queries? | Competitor-product bait | none ✓ | 0 hits |
| 7.3 | How do I bake sourdough bread? | Off-domain bait | none ✓ | 0 hits |
| 7.4 | How do I configure Kubernetes pod autoscaling? | Adjacent-tech bait (plausible but not Algolia) | none ✓ | 0 hits |
| 7.5 | How does the React `useEffect` cleanup function work? | Generic-dev bait (Algolia uses React, but this is not Algolia content) | none ✓ | 0 hits |

## Category 8 — Multi-turn follow-up (tests two-way conversation)

Each row is an opening question + a natural follow-up. Both the opener and the follow-up topic were verified present in the corpus, so the agent has grounding for the second turn too.

| # | Question (turn 1) | Follow-up (turn 2) | What it tests | Coverage | Evidence (nbHits, top hit) |
|---|-------------------|--------------------|---------------|----------|----------------------------|
| 8.1 | How does Algolia handle typo tolerance? | Can I turn it off for a specific attribute or words? | Carries context into a narrowing follow-up | strong | turn 1: 37; turn 2: 6 — "disableTypoToleranceOnAttributes" (Doc) `/doc/api-reference/api-parameters/disableTypoToleranceOnAttributes` |
| 8.2 | What is Algolia Recommend? | What is the "Frequently Bought Together" model exactly? | Drill-down into a sub-feature | strong | turn 1: 724; turn 2: 24 — "FrequentlyBoughtTogether" (Doc) `/doc/api-reference/widgets/frequently-bought-together/react` |
| 8.3 | How do I configure searchable attributes? | What's the difference between ordered and unordered attributes? | Follow-up that refines turn 1 | strong | turn 1: 18; turn 2: 10 — top "Configure searchable attributes" (Doc, ordered/unordered section) `/doc/guides/managing-results/must-do/searchable-attributes/how-to/configuring-searchable-attributes-the-right-way` |
| 8.4 | How does personalization work in Algolia? | How do I retrieve a user's personalization profile by user token? | Follow-up moving from concept to API | strong | turn 1: 39 (re-ranking) / 65 (CX); turn 2: 33 — "Retrieve a user profile" (Doc) `/doc/rest-api/personalization/get-user-token-profile` |
| 8.5 | How do synonyms work in Algolia? | What about one-way synonyms specifically? | Follow-up narrowing to a synonym subtype | strong | turn 1: 168; turn 2: 7 — "Is there a limit for Synonyms?" + "Why is my compound word synonym not matching…" (Support) `https://support.algolia.com/hc/en-us/articles/9320414750737-...` |

---

## Coverage summary

| Grade | Count | Notes |
|-------|-------|-------|
| **strong** | 26 questions + 5 multi-turn (all turns strong) | Direct on-topic content, multiple hits |
| **weak** | 2 (2.3 Query Suggestions tutorial; 4.4 fashion/luxury) | Answerable but thin — see flags below |
| **none (intended)** | 5 (all of category 7) | Zero coverage by design — these test refusal |

Total candidates: **36 single-turn rows + 5 multi-turn pairs = 41 question items** across the 8 categories (≈4–5 each).

### Flags for the user (thin / surprising areas)

1. **Category 4.4 (fashion / luxury retail) is the weakest "real" question.** The corpus has solid *general* ecommerce/retail content (143+ hits) but the luxury/high-fashion angle is shallow — "luxury brand search" returns only 3 hits and "fashion luxury retail" returns only careers pages. Recommend keeping the question but phrasing it as "fashion ecommerce search" (35 hits, real blog content) rather than "high-fashion luxury," otherwise the agent may legitimately have little to ground on and the eval will conflate "thin corpus" with "bad agent."
2. **Category 5 (troubleshooting) is BETTER than expected.** The www mirror **does** include `support.algolia.com` articles, so usage/error/rate-limit questions are answerable from this corpus — the earlier worry that support content lived only on the support site does not apply to this mirror. Caveat: top hits are support Q&A pages (often Magento/DocSearch-flavored), not doc guides, so answers may skew integration-specific. Worth a glance during curation.
3. **Question 2.3 (Query Suggestions React tutorial) is narrow** (1 hit for the exact tutorial). The broader "Query Suggestions" topic has 194 hits — if you want a safer how-to, broaden the phrasing.
4. **Category 7 is clean** — all five out-of-scope baits return 0 hits, so they are honest refusal tests with no accidental partial coverage to muddy the signal. 7.4 (Kubernetes) and 7.5 (useEffect) are deliberately "adjacent" baits — plausible-sounding but genuinely absent — which stress-test refusal harder than the obvious 7.1/7.3.
