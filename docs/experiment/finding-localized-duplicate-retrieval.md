# Finding — localized-duplicate retrieval is corpus-wide, not tuned-index-specific

**Date:** 2026-06-17 · **Status:** verified (direct index queries, N=3 queries × 2 indices)
**Trigger:** Arijit noticed ② Ask AI and ③ Our System cited different sources in the lab
("Academy 4 · Other 3" vs "Other 7") on *What is NeuralSearch?* and asked whether they
look at different sources.

## Method
MCP token was revoked → queried both indices directly with the admin key
(`/tmp/verify_retrieval.mjs`, algoliasearch v5, app `VVKSSPDMJX`), `hitsPerPage:10`,
retrieving `url`/`doc_url`. Queries: *What is NeuralSearch?*, *What is vector search?*,
*How does personalization work?*. Localized-dupe = same canonical path after stripping a
leading `/{locale}/` prefix.

## Evidence (top-10 URLs per index)

| Query | `visibility_www_tuned` (③) | `ALGOLIA_WWW_PROD_V2` (② mirror) |
|---|---|---|
| NeuralSearch | 4× Academy training **first**, then /products/features, ebook, blog. Dupe collisions **3/10** | support FAQs incl. *Privacy manifest* / *build time* (off-topic), blog, webinar. Dupe collisions **3/10** |
| vector search | ebook + Academy training + product/blog. Dupe collisions **2/10** | `/blog/ai/what-is-vector-search` (on-topic) but fr/de/en triplets. Dupe collisions **6/10** |
| personalization | doc guides + support (clean). Dupe collisions **0/10** | 1 doc + support + **6 Greenhouse job postings**. Dupe collisions **0/10** |

## Conclusions (corrects an earlier hypothesis)
1. **Localized duplicates (`/fr/…`, `/de/…`, plain) of the same page appear in BOTH
   indices** — a corpus/ingestion issue (locale variants ingested as separate records),
   NOT specific to the tuned index. On *vector search* the mirror was worse (6 vs 2).
2. **The tuned index is not systematically worse on source quality.** On raw queries it
   often ranks on-topic content (Academy training, docs) at the top; the mirror has its
   own noise (job postings, irrelevant support FAQs).
3. The earlier live-lab observation that "③ grounds on marketing/news junk" was an
   **artifact of the agent's query reformulation** in that single run, not a property of
   the tuned index. The raw index query retrieves better. The lever is the agent's
   reformulation + corpus dedup — consistent with [the typo-tolerance finding](finding-typo-tolerance-false-refusal.md).

## Recommended follow-ups (not done — index-tuning track)
- **Dedup localized variants** in both indices: set `attributeForDistinct` to a canonical
  URL (locale-stripped) + `distinct:1`, or ingest only the canonical/`en` locale. Frees
  retrieval slots in ② and ③ alike.
- **Demote low-value containers** for definitional queries (e.g. down-rank
  `/about/news`, `/resources/asset`, job-board URLs) via custom ranking or rules.
- Re-run the lab on a few definitional queries after dedup and re-measure the gate rate
  (both ② and ③ gated 3.0/10 on *NeuralSearch* in the live run — grounding failures tied
  to retrieval quality, not prompt wording).

## Note on a UI bug fixed alongside
Many records store **root-relative** URLs (`/products/features/neuralsearch`,
`/fr/blog/…`). The lab's source pills rendered these as dead `localhost:5173/…` links;
fixed by prefixing `https://www.algolia.com` in `web/src/lib/sources.ts` `sourceUrl()`
(commit `74e8c6c`).
