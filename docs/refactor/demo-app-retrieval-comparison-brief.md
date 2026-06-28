# Refactor Brief — Demo-App Retrieval Comparison (2×2)

> **Status:** DRAFT / INTAKE IN PROGRESS — not locked, not yet executed.
> **Capture started:** 2026-06-18.
> **Final home:** The Vault (commit once locked). This repo copy is the working draft / crash-insurance.
> **Mode:** Multi-step "huge refactoring." UltraCode orchestration to follow ONCE the goal is locked.

---

## 1. Why this exists (the shift)

The lab today compares **incumbent vs us** (① algolia.com · ② Ask AI floor · ③ our single agent on `VVKSSPDMJX`).

We tear that down. The new lab is a **2×2 experiment over OUR OWN system**: two independent variables —
**retrieval** (keyword vs neural) × **architecture** (single agent vs multi-agent) — all on the same seed data.

Question shifts from *"do we beat Ask AI"* → **"does neural beat keyword, does multi-agent beat single, and do they compound?"**

---

## 2. Target architecture — 2×2, four panels, four indices

App home: **`FLAGSHIP_Accelerator_Program_APP`** (the Demo app). Abandon `VVKSSPDMJX`.

Matrix orientation: rows = retrieval, cols = architecture. Numbering is **row-major**.
|  | **Single agent** | **Multi-agent** |
|---|---|---|
| **Keyword** | **P1** · `ALGOLIA_WWW_PROD_V2_SINGLE_KEYWORD` | **P2** · `ALGOLIA_WWW_PROD_V2_MULTI_KEYWORD` |
| **Neural** | **P3** · `ALGOLIA_WWW_PROD_V2_SINGLE_NEURAL` | **P4** · `ALGOLIA_WWW_PROD_V2_MULTI_NEURAL` |

- **Pair 1** (SINGLE_KEYWORD + SINGLE_NEURAL) → driven by the single-agent flow.
- **Pair 2** (MULTI_KEYWORD + MULTI_NEURAL) → driven by the multi-agent flow.

---

## 3. The steps

### Step 1 — Strip the old panels
- Remove algolia.com panel + Ask AI panel completely (code/wiring too — TBD confirm delete vs dormant).

### Step 2 — Stand up the Demo app + four indices
- Move to `FLAGSHIP_Accelerator_Program_APP` (Arijit provides API + creds).
- Confirm NeuralSearch is provisioned/enabled on the app.
- Seed: **fresh copy** of `ALGOLIA_WWW_PROD_V2` from Visibility app (`1QDAWL72TQ`, READ-ONLY source).
- Apply the **Case-3 config fixes** (done under ARIJIT-TEST) on top of the fresh copy.
- Materialize the four indices per the table above (keyword vs neural = retrieval config on identical records).

### Step 3 — Wire the four panels
- Panels 1 & 2 = single-agent (Case-3) flow, repointed at the SINGLE keyword / neural indices.
- Panels 3 & 4 = multi-agent flow (ported from RC2/3) on the MULTI keyword / neural indices.

---

## 4. Open questions / parking lot

### Index structure — RESOLVED
- A-IX.1 **All 4 indices start from the EXACT same baseline** — fresh copy of `ALGOLIA_WWW_PROD_V2` from Visibility (`1QDAWL72TQ`). Settings are NOT pre-decided per pair; each setup's config will be **proven by what that setup needs** (data-driven). Common baseline → tune per panel only where justified.
- A-IX.3 **NeuralSearch is turned ON** in `FLAGSHIP_Accelerator_Program_APP`. (Confirm neural index = same records as keyword sibling, neural mode on — not a separate corpus.)
- Q-IX.2 **What exactly are the "Case-3 config fixes"?** → INVENTORY IN PROGRESS (see §6). Must catalog before porting — read-receipt discipline.

### Pair 2 — multi-agent (the hard part) — RC2/RC3 READ COMPLETE (see §7)
- Findings: both rc2 & rc3 are **sales-discovery orchestrators** (Maverick AE + 8-signal discovery + Elena/Bruno sales specialists), built on a **two-index Atlas+Ledger schema + Golden Map**, assuming **NeuralSearch**. None of that maps to our single-www-index, answer-quality 2×2.
- Q-MA.0 **DECISIVE FORK — what must "multi-agent" DO in this experiment?**
  - **(b) Multi-agent ANSWERER** [recommended] — orchestrator decomposes the SAME question, dispatches retrieval/answer sub-agents, synthesizes ONE answer. Judge compares like-for-like vs single agent. Borrow rc2's *pattern* (orchestrator→specialist A2A + mechanical grounding discipline), build purpose-built & native. Clean isolation of the multi-agent variable.
  - **(a) Port the rc2/rc3 sales orchestrator** — reproduce Maverick discovery + handoff. Heavy adaptation (rebuild Atlas for www content, strip sales-discovery to fit Q&A, add keyword path). Contaminates the answer-quality comparison. Only makes sense if the DEMO's point is to show the sales-discovery product itself.
- Q-MA.1 **IF porting: RC2, not RC3.** rc2 = quality bar; rc3 = fragile hybrid (~2,355 lines backend still, P0 defects, two-layer-prompt race). rc3's only unique asset (eval harness) is already exceeded by our judge/autocorrect.
- Q-MA.2 **Multi-agent on KEYWORD (Panel 3)** — needs a keyword query-construction path regardless; rc2/3 assume neural. Panel 3 vs 4 is precisely the "does neural lift multi-agent" cell.

### Step 1
- Q1.1 Delete removed-panel code entirely, or keep dormant?

### Screen design (Phase 3 — parked, Arijit driving)
- Q-UI.1 **Multi-layered screen redesign** for the 4-panel lab. Arijit has specific thoughts to share. To work through AFTER architecture (Steps 1–3) is locked. Likely routes through `frontend-builder` design-thinking.

### Cross-cutting
- A-X.1 **Judge STAYS and is the core mechanism.** It rates each of the 4 panels' answers and gives a score/confidence per panel. UI goes 3 lanes → **4 lanes**, each independently judged; the deliverable is the **2×2 leaderboard** ranking the four architectures. Autocorrect loop carries over.
  - A-X.1a **RESOLVED → (A)** keep the **3-dimension composite** (grounding hard-floor+scored / confidence / breadth-depth, mean of 3 judges) per panel + a cross-panel ranking. Dimensional breakdown is what makes "neural beats keyword / multi beats single" defensible.
  - Q-X.1b Headline output = per-query live 4-lane comparison **+** a **batch aggregate leaderboard** over the locked question set? (batch = authoritative, full sources)
- QX.2 24-question locked test set — keep, or new set matched to the seed content?

---

## 5. Decisions locked
- App home → `FLAGSHIP_Accelerator_Program_APP`; abandon `VVKSSPDMJX`.
- Structure → 2×2: {single, multi} × {keyword, neural} = 4 panels, 4 indices.
- Seed → fresh copy of `ALGOLIA_WWW_PROD_V2` from Visibility (`1QDAWL72TQ`), + Case-3 fixes applied.
- Index names → `ALGOLIA_WWW_PROD_V2_{SINGLE|MULTI}_{KEYWORD|NEURAL}`.

---

## 8. Multi-agent design — content-source specialists (DATA-VALIDATED 2026-06-18)

**Decision (Arijit):** multi-agent = **purpose-built specialists per knowledge source**, coordinated by **Maverick** (orchestrator/interface — answers first to best ability, peels the onion with follow-ups, extracts entities, then routes; can fan out to MULTIPLE specialists in parallel and synthesize). Same ideology as rc2 (Maverick→Elena/Bruno) but specialists are **content-domain**, not sales-role. Phase 2 = how to enrich the dataset so specialists get richer charters.

**Validated against live `ALGOLIA_WWW_PROD_V2` (`1QDAWL72TQ`):** 12,064 records; langs en 11,063 / fr 2,083 / de 2,033. The screenshot facet = **`source`** (clean single-value, 9 values, covers all records). en-only sources (Documentation 4177 / Support 1691 / Academy 139) match the screenshot exactly; multilingual ones are ~3×.

**`source` values (all-lang):** Documentation 4177 · Blog 2749 · Support 1691 · Website 1236 · Developers 867 · Resources 810 · Customer Stories 229 · Other 165 · Academy 139.

**Specialist = shared index scoped by a `source` facetFilter** (NATIVE, ~zero custom code — no separate index/corpus per agent). **LOCKED roster (Arijit, 2026-06-18):**
| Agent (names FINAL) | `source` filter | en records |
|---|---|---|
| **Maverick** (orchestrator: discovery, entity extraction, routing, parallel synthesis) | broad / all | — |
| **Technical** | `Documentation` + `Developers` + `Customer Stories` | ~4,538 |
| **Marketer** | `Website` + `Blog` + `Resources` + `Other` | ~1,651 |
| **Academy** | `Academy` | 139 |
| **Support** | `Support` | 1,691 |

> **Principle (Arijit, 2026-06-18):** decisions are **data-driven, not legacy-driven**. rc2/rc3 are the POC that proved the idea; Algolia-Central2 is the **v2** evolution. Treat rc2/3 as legacy — do not carry over their SE/SA persona structure.

- **Technical agent charter:** technical documentation + API guides + integration guides + **customer stories/case studies** (proof of a feature/integration in practice). Rationale: docs, API, integrations and the case studies that exemplify them are one technical knowledge body. Name FINAL: **Technical**.
- **Maverick:** orchestrator + interface; keeps a **broad/unscoped** index view to answer first & route; fans out to specialists (parallel-capable) and synthesizes. Specialists are `source`-scoped.
- en-counts sum to ~8,019 = exactly the screenshot total. ✓

Record fields: `title, abstract, description, content, url, source, category, tags, keywords, authors, facets.facet0–5, hierarchicalCategories, language_code, transform_source`. `facets.facet4` tags integrations (Adobe, Contentstack, Shopify, commercetools) → POC hook.

### Resolved
- A-MA.3 Merge Developers + Documentation + Customer Stories → one **Technical agent**.
- A-MA.4 **English only** for now (other languages future).
- A-MA.5 Snapshot = **latest available today**.
- A-MA.6 Maverick = broad/unscoped + orchestrator; specialists `source`-scoped. ✓

### NEW REQUIREMENT — daily delta-sync pipeline
- Build an **incremental sync**: periodically (≈ end of day) push **deltas** (new/changed records) from the live Visibility `ALGOLIA_WWW_PROD_V2` → our 4 indices on FLAGSHIP.
- **DATA ONLY** — never touch index config (each of the 4 indices keeps its own settings/mode). Sync upserts records, preserves per-index configuration.
- Visibility is the upstream source of truth (new blogs/releases/website updates flow in there first).
- Open: change-detection mechanism (objectID + `lastUpdated`/hash diff), dedup by `url`, scheduling (cron), and how to apply en-only filter on each sync.

---

## 9. Seed spec — from dedup profiling (2026-06-18, `scripts/setup/profile_source_dups.py`)
Live Visibility index has `distinct:url`: **15,179 physical records → 12,064 distinct urls** (all langs); **English = 11,063 physical → 8,103 distinct urls** (≈ the 8,019 screenshot ✓). Duplication is heavy in docs (some urls 14–20×). `environment` is NOT a prod filter — real content is `nonprod20260220` (10,795 en); `prod03042026` only 136.
- **LOCKED seed rule:** copy `language_code:en`, **dedup by `url` (keep latest `lastUpdated`)**, ≈ 8,100 records. Do NOT filter by `environment`. Same rule on every delta-sync.

## 10. Build process / roadmap (data-driven → plan → UltraCode)
1. **Brief** (this doc) — architecture & decisions. ✅
2. **Experience/UX design** — multi-layered presentation: what data shows where, judge display, drawers, analytics placement, the story flow across 4 panels. ← ACTIVE NEXT. (Build later routes via `frontend-builder`.)
3. **Mechanics** — seed/dedup ✅; agent definitions + `source` facet scoping; Maverick routing/synthesis; 4-lane judge wiring; delta-sync design.
4. **THE PLAN** — single locked GOAL (headline) + ordered build steps fusing architecture + design + mechanics + acceptance criteria. Must be self-contained (a zero-context agent can execute it).
5. **UltraCode** — FRESH session reads Brief + Design + Plan from disk, orchestrates the build. This session = architect; next = builder.

### Resolved (2026-06-18)
- Question set → **RECREATE** (new set; must include items where neural/multi-agent differentiate).
- Old panel code → **DELETE** (salvage only what's genuinely reusable; clean, lean folder, no fat).
- Delta-sync → built later (designed in the plan).
- Seed dedup → locked (§9).

---

## 6. Inventory — the "Case-3 config fixes" (evidence-backed)

**Index-level deltas all lived on `visibility_www_tuned` only** (mirror = untouched A/B baseline). Source: `scripts/setup/optimize_index.mjs:49–63`. Seed mechanism: `scripts/setup/migrate_corpus.py` (reads live Visibility settings + ~8,015 records).

| Setting | Value | Note |
|---|---|---|
| `removeStopWords` | `['en']` | keyword lever |
| `ignorePlurals` | `['en']` | keyword lever |
| `queryLanguages` | `['en']` | keyword lever |
| `removeWordsIfNoResults` | `'allOptional'` | keyword lever — **flagged liability, see below** |
| 7 synonym groups (`v0-syn-0..6`) | typo tolerance / neural-search / docs / recommendations / query-suggestions / personalization / ranking | vocabulary — retrieval-agnostic |

NOT modified (inherited from source): `searchableAttributes`, `attributesForFaceting`, `customRanking`, `ranking`, typo settings, `exactOnSingleWordQuery`, `advancedSyntax`, `distinct`, `optionalWords`, attributes-to-retrieve/snippet/highlight. No query rules, no dictionaries.

**Agent-instruction layer (separate, NOT index config):** `instructions_v2.md` (hardened grounding, used at agent creation) → `instructions_case3_grounded_lead_v1.md` (Jun 13) → `instructions_case3_reformulation_fix_v2.md` (Jun 18, live false-refusal fix).

### Two catches
- **C1 — `allOptional` is a flagged liability.** `docs/experiment/finding-typo-tolerance-false-refusal.md` found it over-broadens padded queries → off-topic ranking; the false-refusal cure was agent-side (reformulation v2), not index-side. DECISION NEEDED: keep on Panel 1 or revert to `lastWords`.
- **C2 — keyword tunings don't port to neural.** `removeStopWords` / `removeWordsIfNoResults` / `ignorePlurals` / `queryLanguages` are keyword levers; NeuralSearch reinterprets/ignores them. Do NOT blanket-copy onto `*_NEURAL`.

### Reconciliation (proposed)
- Panel 1 `SINGLE_KEYWORD` ← Case-3 tuned config as STARTING point (modulo C1).
- Other 3 indices ← identical seed data, config PROVEN per setup (synonyms likely everywhere; keyword levers keyword-only).

### Open decision
- Q-IX.4 `allOptional` — **DEFAULT: keep** (Panel 1 = faithful Case-3 reproduction; loop revisits with data). Revertible to `lastWords` on Arijit's call.
