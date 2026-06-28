# Answer-Quality Lab — 2×2 Four-Panel Refactor — Implementation Plan

> **For agentic workers:** This plan is written for a FRESH, zero-context **UltraCode** orchestration session. It is self-contained: every path is absolute, every novel/critical piece has real code, and every phase ends in acceptance criteria you can verify. Steps use checkbox (`- [ ]`) syntax for tracking. Where a phase is testable pure logic (seed dedup, judge weights, delta diff), follow `superpowers:test-driven-development` — failing test first.
>
> **Per-phase model tags** are in each phase header (`MODEL:`). The UltraCode orchestrator sets `opts.model` per agent accordingly. Principle (Arijit): spend **Opus** where it changes the outcome (grounding contract, Maverick orchestration, judge logic, adversarial review); **Sonnet** for the bulk (scripts, UI, wiring, tests); **Haiku** only for trivial mechanical sweeps.

**Goal:** Rebuild the lab as a **2×2 four-panel experiment over our own system** — {single-agent, multi-agent} × {keyword, neural} retrieval — on the Algolia **CENTRAL app `0EXRPAXB56`** (NeuralSearch + Agent Studio both confirmed live), each panel independently judged on a 3-dimension composite, so the lab proves whether **neural beats keyword**, **multi-agent beats single**, and **whether they compound**.

**Architecture:** Four Algolia indices seeded from one identical en-only, url-deduped (~8,100-record) copy of Visibility `ALGOLIA_WWW_PROD_V2` (read-only source on app `1QDAWL72TQ`); keyword-vs-neural differ only by retrieval config/mode on identical records. Single-agent panels (P1, P3) reuse the ported Case-3 Agent Studio agent repointed per index; multi-agent panels (P2, P4) run a **Maverick** orchestrator that extracts entities, routes to **content-source specialists** (Technical / Marketer / Academy / Support, each a shared MULTI index scoped natively by a `source` facetFilter), fans out in parallel, and synthesizes one grounded answer. A provider-agnostic judge (`@lab/judge`) scores each panel blind against its own retrieved sources — 3 diverse judges in batch (authoritative), 1 in live (indicative) — on a 3-dimension composite (Grounding ×1 hard-gated, Confidence ×1, Breadth/Depth ×1). A Vite+React UI renders the 2×2 grid as the scoreboard with a score-triggered judge drawer and a separate batch Leaderboard.

**Tech Stack:** Vite + React 19 + TypeScript (web/); Node + tsx HTTP server (lab/server/, port 8787, Render); pure-TS `@lab/judge` workspace package (Vitest); Algolia `algoliasearch` 5.x + Agent Studio REST (`agent_admin.mjs`, Node-only); Gemini 2.5 (pro batch / flash live) via the existing provider resolver; Vercel (frontend) + Render (backend) deploy.

---

## ✅ WRITE KEY IN PLACE — `ALGOLIA_ADMIN_API_KEY` (verified 2026-06-18)
`.env.local` now has **`ALGOLIA_ADMIN_API_KEY`** for `0EXRPAXB56`. Verified ACL: `addObject, editSettings, deleteIndex, deleteObject, browse, settings, search, listIndexes, inference, nluReadAnswers, recommendation, ...` — **write-capable for the whole build** (seed records, set neural mode, create/publish agents). The old read-only `ALGOLIA_API_KEY` (`search,listIndexes,settings`) stays as a fallback browser search key.

**One gap:** the admin key lacks `addApiKey`, so Phase 0 cannot *programmatically* mint a scoped browser search-only key. Fallback (pick one at build time): (a) ask Arijit to add `addApiKey` to the admin key, OR (b) mint a search-only key scoped to the 4 indices by hand in the Algolia dashboard, OR (c) ship the existing read-only `ALGOLIA_API_KEY` as the browser key for now (search-capable; scoped to all indices, not just our 4 — acceptable for a demo, tighten later). NEVER ship the admin key to the browser.

## 🔖 NAMING CONVENTION (LOCKED 2026-06-18) — `AC2_WWW_<ARCH>_<RETRIEVAL>`
Indices: **`AC2_WWW_SINGLE_KEYWORD`** (P1) · **`AC2_WWW_MULTI_KEYWORD`** (P2) · **`AC2_WWW_SINGLE_NEURAL`** (P3) · **`AC2_WWW_MULTI_NEURAL`** (P4). `AC2`=project/owner tag (groups our indices + signals experimental on the shared tenant); `WWW`=the algolia.com www corpus; then the two axes. Agents mirror it: **2 single** (`ac2-single-keyword`, `ac2-single-neural`) + **8 specialists** (`ac2-{tech,marketer,academy,support}-{keyword,neural}`). **Maverick is NOT an agent** — it's the coded coordinator in `lab/server/src/multiAgent.ts`. (Specialists collapse to 4 only if Agent Studio supports per-call index targeting — Task 3.2.) Dropped the old `ALGOLIA_WWW_PROD_V2_*` names ("PROD" misleads; collides with the stale source-named index). The brief/ADRs still say the old names + "FLAGSHIP" — this plan's names win.

## ⚠️ SHARED-TENANT DISCIPLINE — `0EXRPAXB56` is a shared demo app (150 indices)
It hosts other teams' work (WKND_*, SW_*, rh_*, movies, magento2_*) and the rc2 `algolia-central_atlas` / `algolia-central_enterprise_ledger`, plus a stale `ALGOLIA_WWW_PROD_V2` (1000 records). **Touch ONLY our four `AC2_WWW_{SINGLE|MULTI}_{KEYWORD|NEURAL}` indices and our `ac2-*` agents. Never edit/delete anything else.** Our suffixed index names don't collide with the existing `ALGOLIA_WWW_PROD_V2`, but verify before every create. (Optional, Arijit's call: a clearer prefix like `AC2_WWW_*` would reduce tenant confusion — kept the locked names for now.)

---

## Canonical facts (single source of truth — do not re-derive)

**Panels (row-major, FINAL):**

| | **Single agent** | **Multi-agent** |
|---|---|---|
| **Keyword** | **P1** · `AC2_WWW_SINGLE_KEYWORD` | **P2** · `AC2_WWW_MULTI_KEYWORD` |
| **Neural** | **P3** · `AC2_WWW_SINGLE_NEURAL` | **P4** · `AC2_WWW_MULTI_NEURAL` |

The three deltas that ARE the argument: **multi-lift** (across a row), **neural-lift** (down a column), **compound** (P1 → P4).

**Apps / credentials (read from `.env.local` — NEVER hardcode):**
- **Build home:** CENTRAL app `0EXRPAXB56` — keys `ALGOLIA_APP_ID` + `ALGOLIA_API_KEY` (read/search, present) + **`ALGOLIA_ADMIN_API_KEY` (write — REQUIRED, see prerequisite above)**. NeuralSearch + Agent Studio confirmed live (Agent Studio already hosts other teams' agents; provider models incl. gpt-5.5).
- **Seed source (READ-ONLY):** Visibility `ALGOLIA_WWW_PROD_V2` on app `1QDAWL72TQ` — keys `VISIBILITY_APP_ID` + `VISIBILITY_API_KEY`. Index name in `VISIBILITY_INDEX_NAME`. Never write it (a `VISIBILITY_WRITE_API_KEY` exists but it is the incumbent's — do NOT use it to write).
- **Browser key:** mint a **search-only** key scoped to the 4 indices via `addApiKey` (Phase 0 Task 0.1) → store as `ALGOLIA_SEARCH_ONLY_KEY` / `VITE_ALGOLIA_SEARCH_API_KEY`. Never ship the admin or full read key to the browser.
- **Abandoned:** `VVKSSPDMJX` (`ARIJIT-TEST_*`) — the old build home. Do not create new objects there; it remains only as the source of the Case-3 config/instructions we port.

**Seed rule (LOCKED, §9 of the brief):** copy `language_code:en`, **dedup by `url` keeping latest `lastUpdated`**, ≈ 8,100 records. Do **NOT** filter by `environment`. Same rule on every delta-sync.

**`source` facet roster (LOCKED, en record counts):**

| Agent | `source` facetFilter | en records |
|---|---|---|
| **Maverick** (orchestrator: discovery, entity extraction, routing, parallel synthesis) | broad / none | — |
| **Technical** | `Documentation` + `Developers` + `Customer Stories` | ~4,538 |
| **Marketer** | `Website` + `Blog` + `Resources` + `Other` | ~1,651 |
| **Academy** | `Academy` | 139 |
| **Support** | `Support` | 1,691 |

**Case-3 config (port to SINGLE_KEYWORD only — §6 of the brief):** `removeStopWords:['en']`, `ignorePlurals:['en']`, `queryLanguages:['en']`, `removeWordsIfNoResults:'allOptional'` (Q-IX.4 = **keep** `allOptional` for faithful reproduction), + 7 synonym groups. Keyword levers are keyword-only (C2: NeuralSearch ignores/reinterprets them — do NOT blanket-copy onto `*_NEURAL`); synonyms may carry everywhere.

**Judge composite (target spec):** `composite = gate × mean(grounding, confidence, breadthDepth)` — grounding at **×1 (equal weight)**, NOT ×2. Grounding remains the **hard floor**: a supermajority (≥2/3 judges/rounds) unsupported claim caps grounding ≤3 and composite ≤ `cap` (3). This is the ONLY change to the judge math; the gate, claim-recurrence, and synthesis machinery stay.

**FAIRNESS INVARIANT (LOCKED — Arijit 2026-06-18):** all four panels use the **identical model + provider + grounding instructions**. The ONLY variables are architecture (single vs multi) and retrieval (keyword vs neural). Pin the same model on every agent (P1–P4) and on the Maverick coordinator's LLM calls. A build that lets the model differ across panels is a FAIL — it contaminates the comparison.

**PROVIDER (LOCKED — Arijit 2026-06-18):** support **both OpenAI and Gemini**. Keep the existing `provider.ts` policy (prefer OpenAI, fall back to Gemini on limits). Both providers must be registered in Agent Studio on `0EXRPAXB56` (per-app provider registry — the old `provider.ts` IDs are for VVKSSPDMJX and do NOT carry over; Phase 0 Task 0.3 discovers/registers them and rewrites the IDs). Whatever provider+model the resolver picks at build time, it is applied uniformly to all 4 agents + the coordinator (see FAIRNESS INVARIANT). Judge runs on the same provider family (live = flash, batch = pro).

**MULTI-TURN / two-way (LOCKED — Arijit 2026-06-18):** the follow-up turn is **generated, not scripted**. After its first answer, each panel — via the SAME shared instruction (fair across panels) — produces ONE logical, on-topic follow-up question (a clarifying question when the opener is ambiguous; a deepening/next-step question when it's clear). The harness captures `{turn1Answer, generatedFollowUp, turn2Answer}` per panel, and the judge scores the **quality of the generated follow-up question** (on-topic, logical, advances the conversation) as a comparable head-to-head signal — i.e. *which architecture asks the better next question*. The generation logic is identical across panels; the differentiator is the agent+retrieval. (The "engagement" judge dimension stays deferred; follow-up-question quality is a discrete scored output, not a 4th composite dimension unless promoted later.)

**Reference docs (read before building the matching phase):**
- `docs/refactor/demo-app-retrieval-comparison-brief.md` — architecture, decisions, seed spec, multi-agent roster, Case-3 inventory.
- `docs/refactor/ux-design-v1.md` — full UX: 2×2 grid, judge drawer (8-block / lean-default / judge-selector), Leaderboard, mockups (v1.0–v1.4).
- Vault `Projects/algolia-central2/` — index.md + 6 ADRs (esp. `2026-06-18-content-source-multi-agent`, `2026-06-18-ux-and-judge-design`).
- `docs/algolia-api/` — local Algolia API reference; `99-mcp-tool-map.md` for MCP↔REST.
- `docs/experiment/finding-typo-tolerance-false-refusal.md` — why `allOptional` is a flagged liability and why the false-refusal cure was agent-side.

---

## File structure — what gets created / modified / deleted

**Created:**
- `scripts/setup/seed_central.mjs` — seed pipeline (read Visibility → en-filter → url-dedup → push to 4 CENTRAL indices → set per-index config).
- `scripts/setup/seed_dedup.mjs` + `scripts/setup/seed_dedup.test.mjs` — pure dedup/filter logic + tests (TDD).
- `scripts/setup/delta_sync.mjs` + `scripts/setup/delta_sync.test.mjs` — incremental data-only sync + diff logic + tests.
- `scripts/setup/check_central.mjs` — Phase 0 capability probe (admin ACL, NeuralSearch, Agent Studio, mint search-only key).
- `scripts/setup/instructions_single.md` — single-agent grounding instructions (Case-3 reformulation-fix v2) + the shared follow-up-question generation block.
- `scripts/setup/instructions_specialist.md` — shared specialist template (parameterized by source scope + charter).
- `scripts/setup/maverick_prompts.md` — the CODED coordinator's LLM prompt templates (entity-extract · route · synthesize · follow-up). Maverick is NOT an Agent Studio agent — it is `lab/server/src/multiAgent.ts`.
- `scripts/setup/setup_providers.mjs` — discover/register OpenAI + Gemini providers in Agent Studio on `0EXRPAXB56`; emit their per-app provider IDs; rewrite `lab/server/src/provider.ts` IDs.
- `scripts/setup/create_central_agents.mjs` — create+publish the Agent Studio agents on CENTRAL: **2 single** (`ac2-single-keyword|neural`) + **8 specialists** (`ac2-{tech,marketer,academy,support}-{keyword,neural}`, source-scoped). NO Maverick agent (coordinator is code). Bait-test each. Same model+provider on all (fairness invariant).
- `lab/server/src/multiAgent.ts` + `lab/server/src/multiAgent.test.ts` — the **coded Maverick coordinator**: entity extract (LLM) → route → parallel fan-out to specialist agents → synthesize (LLM) → generate follow-up (LLM); keyword vs neural query path.
- `lab/server/src/answer.ts` + `lab/server/src/answer.test.ts` — unified per-panel answer producer + `/api/answer` SSE endpoint (P1/P3 = proxy a single Agent Studio agent; P2/P4 = run the coordinator). The browser's single answer path for all 4 panels.
- `web/src/components/Matrix.tsx` — the 2×2 grid scoreboard.
- `web/src/components/PanelCell.tsx` — one panel cell/lane (identity, streamed answer, source pills, status chips, orchestration mini-trace).
- `web/src/components/JudgeDrawer.tsx` — score-triggered judge drawer (8-block lean-default + judge selector).
- `web/src/components/Leaderboard.tsx` — batch aggregate view.
- `web/src/components/OrchestrationTrace.tsx` — Maverick → specialists fan-out viz (inline mini + drawer).
- `docs/experiment/test-questions-locked-v3.md` — recreated question set (must include neural/multi differentiators).

**Modified:**
- `lab/judge/src/rubric.ts` — grounding `weight: 2` → `weight: 1` (the reconciliation).
- `lab/judge/test/*.test.ts` — update expected composites for ×1.
- `lab/server/src/webserver.ts` + `liveJudge.ts` + `judgeStep.ts` — add `/api/answer` route; judge 4 panels (was 3).
- `lab/server/src/provider.ts` — replace VVKSSPDMJX provider IDs with the `0EXRPAXB56` ones (from `setup_providers.mjs`); keep OpenAI→Gemini policy; expose the single resolved {provider, model} pinned across all agents + coordinator + judge.
- `lab/server/src/panels.ts` — replace 3 panels (website / mirror / tuned) with P1–P4 (each `{panelId, arch, retrieval, indexName, agentId|coordinator}`).
- `lab/server/src/questions.ts` — load v3 question set.
- `web/src/config/columns.ts` — 4 panel configs from CENTRAL env.
- `web/src/App.tsx` — host Matrix + drawer + Leaderboard toggle (was 3-lane + rail).
- `web/src/types/chat.ts` — add `PanelId = 'P1'|'P2'|'P3'|'P4'`, panel/trace/judge contracts.
- `vercel.json` / `render.yaml` / `.env.local` — CENTRAL env wiring.

**Deleted (salvage nothing dead; keep the codebase lean):**
- `web/src/components/WebsiteColumn.tsx`, `AgentColumn.tsx`, `LaneRail.tsx`, `ComparisonKey.tsx`, `FollowUpCallout.tsx` (if unused by the 2×2).
- `web/src/hooks/useWebsiteColumn.ts`, `useAgentColumn.ts` (replace with panel-driven hooks).
- `lab/server/src/website.ts` + `lab/capture/` (algolia.com Playwright capture — Case ① is gone).
- Old 3-panel wiring in `App.tsx` / `panels.ts`.

**Salvage (reuse, do not rewrite):** `@lab/judge` engine (all gate/synthesis/claim-recurrence logic — only the weight changes); `@lab/autocorrect` loop; the `AnalysisRail.tsx` pinnable/foldable/resizable PATTERN (re-skin into `JudgeDrawer.tsx`); SSE streaming client (`judgeClient.ts`); the provider resolver (`provider.ts`); the eval CLI (`cli.ts`).

---

## Phase 0 — Prerequisites, env, and strip the old lab
**MODEL: Sonnet** (mechanical) · **Opus** for the delete-vs-dormant call only.
**Blocking dependency:** the `ALGOLIA_ADMIN_API_KEY` write key (see prerequisite). This phase validates capabilities and fails loud if absent/under-scoped.

### Task 0.1 — Validate CENTRAL write capabilities + NeuralSearch + mint browser key
**Files:** Create `scripts/setup/check_central.mjs`; Modify `.env.local`.

- [ ] **Step 1:** Confirm `.env.local` has `ALGOLIA_ADMIN_API_KEY` (DONE — verified write-capable 2026-06-18). If missing → STOP.
- [ ] **Step 2:** Write `scripts/setup/check_central.mjs` that loads `.env.local` and, using `ALGOLIA_ADMIN_API_KEY`: (a) GET `/1/keys/<adminKey>` and assert ACL ⊇ `{addObject, editSettings, deleteIndex}` (these are the build-critical ones; `addApiKey` is NOT present — handle per Step 3); (b) create a throwaway index `AC2_PROBE_DELETEME`, `setSettings({mode:'neuralSearch'})`, read it back, assert it persists (proves NeuralSearch entitlement + write), then `deleteIndex`; (c) GET `/agent-studio/1/agents` with a `User-Agent` header, assert 200.
- [ ] **Step 3 (browser key — addApiKey is missing on the admin key):** Try `addApiKey({acl:['search'], indexes:['AC2_WWW_SINGLE_KEYWORD','AC2_WWW_MULTI_KEYWORD','AC2_WWW_SINGLE_NEURAL','AC2_WWW_MULTI_NEURAL'], description:'AC2 lab browser search-only'})`. If it 403s (expected — no `addApiKey` ACL), FALL BACK: use the existing read-only `ALGOLIA_API_KEY` as `VITE_ALGOLIA_SEARCH_API_KEY` for now and log a TODO to mint a tighter key (dashboard or after adding the ACL). Either way, write the chosen browser key to `.env.local` as `VITE_ALGOLIA_SEARCH_API_KEY`. NEVER use the admin key in the browser.
- [ ] **Step 4:** Run: `node scripts/setup/check_central.mjs`
  Expected: prints `CENTRAL OK · admin write ACL sufficient · neuralSearch provisioned · Agent Studio 200 · browser key set (minted|fallback)`. Build-critical assertion fail (write/neural/agent-studio) → STOP and surface. Do not proceed.

**Read receipt required** (per global protocol) before any `setSettings`/`addApiKey`/Agent Studio call: cite `docs/algolia-api/` file + line for the `mode:'neuralSearch'` setting, the `addApiKey` ACL shape, and the Agent Studio publish flow.

### Task 0.3 — Register LLM providers on `0EXRPAXB56` (BLOCKER for agent creation)
**Files:** Create `scripts/setup/setup_providers.mjs`; Modify `lab/server/src/provider.ts`.
Agent Studio providers are **per-app**. The `provider.ts` provider IDs belong to the old VVKSSPDMJX app and are invalid here — agents cannot be created without a valid `0EXRPAXB56` provider ID.

- [ ] **Step 1 (read receipt):** Cite the Agent Studio provider endpoints from `docs/algolia-api/` (list/create provider: `GET|POST /agent-studio/1/providers` or equivalent) before any write.
- [ ] **Step 2:** `setup_providers.mjs` lists existing providers on `0EXRPAXB56` (`GET /agent-studio/1/providers`). If an OpenAI provider and a Gemini provider exist, capture their IDs + the model each exposes; if missing, create them (OpenAI key = `OPENAI_API_KEY`, Gemini key = `GOOGLE_API_KEY` from `.env.local`).
- [ ] **Step 3:** Choose ONE model to pin across all panels per the FAIRNESS INVARIANT. Default: the resolver's preferred provider (OpenAI if healthy, else Gemini) and that provider's strong model. Record `ALGOLIA_PROVIDER_OPENAI_ID`, `ALGOLIA_PROVIDER_GEMINI_ID`, and the chosen `ALGOLIA_AGENT_MODEL` into `.env.local`.
- [ ] **Step 4:** Update `lab/server/src/provider.ts`: replace the VVKSSPDMJX `agentProviderId`s with the `0EXRPAXB56` IDs; keep the OpenAI→Gemini fallback policy; export the single resolved `{providerId, model}` that ALL agent-creation calls + coordinator LLM calls + judge use.
- [ ] **Step 5 (verify):** `node scripts/setup/setup_providers.mjs --check` prints both provider IDs and the pinned model; assert the chosen provider answers a 1-token health ping.

### Task 0.2 — Strip the old 3-panel lab
**Files:** Delete the files listed under "Deleted" above; Modify `web/src/App.tsx`, `lab/server/src/panels.ts`.

- [ ] **Step 1:** Delete the old panel components/hooks and the Playwright capture (`lab/capture/`, `lab/server/src/website.ts`, `WebsiteColumn.tsx`, `useWebsiteColumn.ts`, `AgentColumn.tsx`, `useAgentColumn.ts`, `LaneRail.tsx`).
- [ ] **Step 2:** Remove the `/api/website` route from `webserver.ts` and the website panel from `panels.ts`. Leave `/api/judge` and `/health`.
- [ ] **Step 3:** Reduce `App.tsx` to a minimal shell that compiles (placeholder `<Matrix/>` mount) — full UI lands in Phase 5.
- [ ] **Step 4 (commit):**
```bash
git add -A && git commit -m "refactor: strip 3-panel lab (website/ask-ai); keep judge+autocorrect+rail patterns"
```

**Acceptance (Phase 0):** `node scripts/setup/check_central.mjs` prints OK (admin ACL sufficient, neural provisioned, Agent Studio reachable, search-only key minted); `cd web && npm run build` compiles the stripped shell; `cd lab/judge && npm test` still green (untouched); old website/Ask-AI code is gone from the tree.

---

## Phase 1 — Data layer: seed the four CENTRAL indices
**MODEL: Sonnet.**

### Task 1.1 — Pure dedup/filter logic (TDD)
**Files:** Create `scripts/setup/seed_dedup.mjs`, `scripts/setup/seed_dedup.test.mjs`.

- [ ] **Step 1 (failing test):** `seed_dedup.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterEnglish, dedupeByUrl } from './seed_dedup.mjs';

test('filterEnglish keeps only language_code en', () => {
  const recs = [{ url: 'a', language_code: 'en' }, { url: 'b', language_code: 'fr' }];
  assert.deepEqual(filterEnglish(recs).map(r => r.url), ['a']);
});

test('dedupeByUrl keeps the record with the latest lastUpdated per url', () => {
  const recs = [
    { url: 'x', lastUpdated: 100, body: 'old' },
    { url: 'x', lastUpdated: 200, body: 'new' },
    { url: 'y', lastUpdated: 50, body: 'only' },
  ];
  const out = dedupeByUrl(recs).sort((a, b) => a.url.localeCompare(b.url));
  assert.equal(out.length, 2);
  assert.equal(out.find(r => r.url === 'x').body, 'new');
});

test('dedupeByUrl does NOT filter by environment', () => {
  const recs = [
    { url: 'x', lastUpdated: 1, environment: 'nonprod20260220' },
    { url: 'y', lastUpdated: 1, environment: 'prod03042026' },
  ];
  assert.equal(dedupeByUrl(recs).length, 2);
});
```
- [ ] **Step 2:** Run `node --test scripts/setup/seed_dedup.test.mjs` → FAIL (module not found).
- [ ] **Step 3:** Implement `seed_dedup.mjs`:
```js
export function filterEnglish(records) {
  return records.filter(r => r.language_code === 'en');
}

// Keep the record with the greatest lastUpdated per url. Records missing
// lastUpdated sort as 0. environment is intentionally ignored.
export function dedupeByUrl(records) {
  const best = new Map();
  for (const r of records) {
    const ts = Number(r.lastUpdated ?? 0);
    const cur = best.get(r.url);
    if (!cur || ts > Number(cur.lastUpdated ?? 0)) best.set(r.url, r);
  }
  return [...best.values()];
}
```
- [ ] **Step 4:** Run `node --test scripts/setup/seed_dedup.test.mjs` → PASS.
- [ ] **Step 5 (commit):** `git add scripts/setup/seed_dedup.* && git commit -m "feat(seed): en-filter + url-dedup logic with tests"`

### Task 1.2 — Seed pipeline + per-index config
**Files:** Create `scripts/setup/seed_central.mjs`. Reference: `scripts/setup/migrate_corpus.py` (existing seed mechanism), `scripts/setup/optimize_index.mjs:49-63` (Case-3 config + 7 synonyms).

- [ ] **Step 1:** `seed_central.mjs` reads Visibility creds (`VISIBILITY_*`, read-only) + CENTRAL `ALGOLIA_ADMIN_API_KEY`; browses ALL of Visibility's `ALGOLIA_WWW_PROD_V2` (use `browse`/`browseObjects` to page through ~15k physical records), applies `filterEnglish` then `dedupeByUrl` (expect ≈ 8,100), and logs the final count. Assert `7800 < count < 8400` or STOP (seed-rule drift guard).
- [ ] **Step 2:** Create the 4 indices on CENTRAL (verify each name does NOT already exist before create — shared tenant) and push the SAME deduped record set to each (`saveObjects`, batched). objectID = stable hash of `url` so re-runs upsert, not duplicate.
- [ ] **Step 3:** Apply per-index config:
  - **All 4:** inherit Visibility `searchableAttributes`, `attributesForFaceting` (must include `source` as `filterOnly(source)` or `searchable(source)` so specialists can facet-filter), `customRanking`, `ranking`; apply the 7 synonym groups from `optimize_index.mjs`.
  - **`*_NEURAL` (P3, P4):** `setSettings({ mode: 'neuralSearch' })`. Do NOT set keyword levers.
  - **`*_KEYWORD` (P1, P2):** keyword mode (default). On **`SINGLE_KEYWORD` only** apply the full Case-3 config: `removeStopWords:['en']`, `ignorePlurals:['en']`, `queryLanguages:['en']`, `removeWordsIfNoResults:'allOptional'`. `MULTI_KEYWORD` gets the common baseline (synonyms + faceting) but NOT the Case-3 levers unless the multi-agent path proves it needs them (data-driven).
- [ ] **Step 4:** Run `node scripts/setup/seed_central.mjs` and capture output.
- [ ] **Step 5 (verify):** For each of the 4 indices, run a `searchSingleIndex` for `typo tolerance` and assert hits > 0; for the neural indices assert `getSettings().mode === 'neuralSearch'`; for `SINGLE_KEYWORD` assert `removeWordsIfNoResults === 'allOptional'`. Print a 4-row confirmation table.
- [ ] **Step 6:** Verify the `source` facet is filterable on the MULTI indices: `searchSingleIndex(MULTI_KEYWORD, { facetFilters: ['source:Support'] })` returns only Support records (count ≈ 1,691).
- [ ] **Step 7 (commit):** `git add scripts/setup/seed_central.mjs && git commit -m "feat(seed): seed 4 CENTRAL indices with per-index retrieval config"`

**Acceptance (Phase 1):** 4 indices exist on CENTRAL, each ≈ 8,100 records, identical record sets; neural indices report `mode:neuralSearch`; `SINGLE_KEYWORD` carries the Case-3 config; `source` facetFilter isolates each specialist's slice with the expected counts; no pre-existing index was touched. Seed is idempotent (re-run does not grow record count).

---

## Phase 2 — Single-agent panels (P1 keyword, P3 neural)
**MODEL: Opus** for the grounding instructions; **Sonnet** for the create/publish wiring.

### Task 2.1 — Port + harden single-agent instructions
**Files:** Create `scripts/setup/instructions_single.md`. Source: `scripts/setup/instructions_case3_reformulation_fix_v2.md` (the live false-refusal fix) layered on `instructions_v2.md` (hardened grounding).

- [ ] **Step 1:** Compose `instructions_single.md` = the hardened grounding contract (110% grounded; answer ONLY from retrieved sources; no training-data facts; not-in-sources → clean refuse + route to official help, which is grounded-GOOD not a violation) + the reformulation-fix v2 rule (do NOT pad the keyword query with "Algolia"/framing words — search the bare concept term; padding caused the off-topic reweight false-refusal, see `docs/experiment/finding-typo-tolerance-false-refusal.md`). Hold model + grounding wording identical to what P2/P4 specialists will use, so the only variable across panels is architecture+retrieval.
- [ ] **Step 2 (read receipt):** Cite the Agent Studio create/publish endpoint shape from `docs/algolia-api/` (path + verbatim rule) before any agent write.

### Task 2.2 — Create + publish + bait-test the two single agents
**Files:** Create `scripts/setup/create_central_agents.mjs` (single-agent portion). Reference: `scripts/setup/agent_admin.mjs` (Node-only Agent Studio admin: PATCH → POST `/publish` → GET confirm; `bait` harness).

- [ ] **Step 1:** Create `ac2-single-keyword` bound to `SINGLE_KEYWORD` and `ac2-single-neural` bound to `SINGLE_NEURAL`, both using `instructions_single.md`, the **pinned `{providerId, model}` from Task 0.3** (identical to every other agent — FAIRNESS INVARIANT), and a search tool scoped to their index. Publish each (`POST .../{id}/publish`); Agent Studio HTTP needs a `User-Agent` header for `/agent-studio/*`.
- [ ] **Step 2:** Record the two agent IDs into `.env.local` (`ALGOLIA_AGENT_P1_ID`, `ALGOLIA_AGENT_P3_ID`) and into SESSION.md.
- [ ] **Step 3 (bait test — the grounding proof):** Run `node scripts/setup/agent_admin.mjs bait <P1_ID>` and `<P3_ID>` against the off-topic bait set (capital of France / Elasticsearch percolator / Kubernetes autoscaling — Cat 7 of the question set). Assert each baits to a clean refuse+route, zero leaked training-data facts. (Confirm `agent_admin.mjs` points at the CENTRAL app/key, not VVKSSPDMJX — repoint if needed.)
- [ ] **Step 4:** Smoke a real query ("How does Algolia handle typo tolerance?") against each; assert a grounded answer with sources from its index.
- [ ] **Step 5 (commit):** `git add scripts/setup/instructions_single.md scripts/setup/create_central_agents.mjs && git commit -m "feat(agents): single-agent P1/P3 created, published, bait-clean"`

**Acceptance (Phase 2):** Two published Agent Studio agents, one per single index; both refuse all bait queries cleanly (0 leaks) and answer in-scope queries with grounded sources; agent IDs persisted.

---

## Phase 3 — Multi-agent panels (P2 keyword, P4 neural): coded Maverick coordinator + native specialists
**MODEL: Opus** (orchestration + grounding contract is the hardest reasoning) · **Sonnet** for agent-creation wiring.
This is the differentiated "wow." Build it purpose-built and native — borrow rc2's *pattern* (orchestrator → specialist A2A + mechanical grounding discipline), NOT rc2/rc3's sales-discovery code (legacy POC).

**ARCHITECTURE DECISION (LOCKED 2026-06-18):** Maverick is a **coded coordinator** in `lab/server/src/multiAgent.ts` (deterministic, testable — matches rc2's quality bar), NOT a standing Agent Studio agent. The **specialists ARE native Agent Studio agents**, each source-scoped on the shared MULTI index (native facetFilter, ~zero custom code). The coordinator does the LLM reasoning (entity-extract, synthesis, follow-up) and calls the specialist agents in parallel.

### Task 3.1 — Specialist template + coordinator prompts (+ shared follow-up block)
**Files:** Create `scripts/setup/instructions_specialist.md`, `scripts/setup/maverick_prompts.md`; append the follow-up block to `scripts/setup/instructions_single.md` (Task 2.1).

- [ ] **Step 1:** `instructions_specialist.md` = a template parameterized by `{charter}` and `{sourceFilter}`. Each specialist searches the shared MULTI index with its `source` facetFilter applied natively, answers ONLY from what it retrieves within its scope, and returns `{ answer, sources, confidence }`. Same grounding contract as single agents. Charters:
  - **Technical** — `source IN [Documentation, Developers, Customer Stories]`: technical docs, API/integration guides, and the customer stories that exemplify them.
  - **Marketer** — `source IN [Website, Blog, Resources, Other]`: positioning, narrative, resources.
  - **Academy** — `source = Academy`: structured learning content.
  - **Support** — `source = Support`: troubleshooting/help.
- [ ] **Step 2:** `maverick_prompts.md` = the coordinator's LLM prompt templates (consumed by `multiAgent.ts`): **(extract)** pull entities/intent from the question; **(synthesize)** merge specialist returns into ONE grounded answer, dedup sources, never assert beyond what specialists retrieved; **(follow-up)** the shared block below.
- [ ] **Step 3 (shared follow-up block — IDENTICAL text in `instructions_single.md` AND `maverick_prompts.md`):** "After answering, propose exactly ONE logical, on-topic follow-up question. If the original request was ambiguous, make it a CLARIFYING question (peel the onion); if it was clear, make it a DEEPENING/next-step question. Stay strictly on-domain; never ask an off-topic question. Output it as a single sentence." This identical instruction is what makes the follow-up a fair head-to-head test (MULTI-TURN invariant) — the differentiator is the agent+retrieval, not the prompt.

### Task 3.2 — Create + publish the specialist Agent Studio agents
**Files:** Modify `scripts/setup/create_central_agents.mjs`.

- [ ] **Step 1 (read receipt):** Check the Agent Studio API in `docs/algolia-api/` — does an agent's search tool accept a per-call index + facetFilter, or are they fixed at creation? This decides agent count.
- [ ] **Step 2:** Create the specialists as native Agent Studio agents, each with `instructions_specialist.md` (its charter + `source` facetFilter), the **pinned `{providerId, model}`** (fairness), and a search tool on the matching MULTI index. Two MULTI indices → **keyword+neural pairs (8 agents):** `ac2-tech-keyword`/`-neural`, `ac2-marketer-keyword`/`-neural`, `ac2-academy-keyword`/`-neural`, `ac2-support-keyword`/`-neural`. (If Step 1 shows per-call index targeting is supported, collapse to 4 and pass the index/filter at orchestration time.) Publish all.
- [ ] **Step 3:** Record IDs to `.env.local` (`ALGOLIA_AGENT_TECH_KEYWORD_ID`, `ALGOLIA_AGENT_TECH_NEURAL_ID`, … 8 vars) and SESSION.md. **No Maverick agent** — the coordinator is Task 3.3.
- [ ] **Step 4:** Bait-test each specialist (Cat 7) → clean refuse within its scope, 0 leaks.

### Task 3.3 — Maverick orchestration code + keyword/neural query path (TDD where pure)
**Files:** Create `lab/server/src/multiAgent.ts`, `lab/server/src/multiAgent.test.ts`.

- [ ] **Step 1 (failing test for the pure routing/query-path logic):** `multiAgent.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { routeSpecialists, buildRetrievalQuery } from './multiAgent.js';

describe('routeSpecialists', () => {
  it('routes an API/docs question to Technical', () => {
    const r = routeSpecialists({ entities: ['typoTolerance'], intent: 'how-to-config' });
    expect(r).toContain('technical');
  });
  it('can fan out to multiple specialists', () => {
    const r = routeSpecialists({ entities: ['pricing', 'records'], intent: 'troubleshoot-billing' });
    expect(r.length).toBeGreaterThanOrEqual(1);
  });
});

describe('buildRetrievalQuery', () => {
  it('keyword path uses bare concept terms (no Algolia padding)', () => {
    const q = buildRetrievalQuery('How do I add typo tolerance in Algolia?', 'keyword');
    expect(q.toLowerCase()).not.toContain('algolia');
    expect(q.toLowerCase()).toContain('typo tolerance');
  });
  it('neural path keeps the natural-language question', () => {
    const q = buildRetrievalQuery('How do I add typo tolerance in Algolia?', 'neural');
    expect(q).toMatch(/how do i/i);
  });
});
```
- [ ] **Step 2:** Run `cd lab/server && npx vitest run src/multiAgent.test.ts` → FAIL.
- [ ] **Step 3:** Implement `multiAgent.ts`:
  - `buildRetrievalQuery(question, mode)`: for `'keyword'`, strip stopwords + the "Algolia"/framing padding and return the bare concept terms (the Case-3 reformulation-fix lesson — padding causes off-topic reweight on keyword); for `'neural'`, pass the natural-language question through (NeuralSearch wants full NL).
  - `routeSpecialists({entities, intent})`: map entities/intent → specialist ids (Technical/Marketer/Academy/Support); return the parallel fan-out set.
  - `orchestrate(question, { mode, specialistAgents, llm })`: extract entities (LLM, pinned model) → `routeSpecialists` → run the chosen **specialist Agent Studio agents** for `mode`'s set (keyword vs neural) in PARALLEL via the Agent Studio API (reuse `lab/server/src/concurrency.ts`), each given `buildRetrievalQuery(question, mode)` → collect `{answer, sources}` → synthesize ONE grounded answer (LLM) → `generateFollowUp` (LLM, the shared block) → return `{ answer, sources, followUp, trace: { entities, specialists:[{name,fired,hits}], synthesisMs } }`. ALL LLM calls use the pinned `{provider, model}` (fairness). The `trace` is the UI orchestration contract (Phase 5).
- [ ] **Step 4:** Run the test → PASS.
- [ ] **Step 5:** Integration smoke: `orchestrate("How does Algolia handle typo tolerance?", {mode:'neural'})` returns a synthesized grounded answer + `followUp` (one on-topic question) + a trace showing Technical fired. Assert sources non-empty and all drawn from retrieved hits.
- [ ] **Step 6 (commit):** `git add scripts/setup/maverick_prompts.md scripts/setup/instructions_specialist.md lab/server/src/multiAgent.* scripts/setup/create_central_agents.mjs && git commit -m "feat(multi-agent): coded Maverick coordinator + native source-scoped specialists + follow-up gen"`

**Acceptance (Phase 3):** the coded coordinator orchestrates entity-extract → parallel specialist-agent fan-out → synthesis → follow-up for P2 (keyword agent set) and P4 (neural agent set); keyword path uses bare concept terms, neural uses NL; the `trace` + `followUp` are emitted; the orchestrated output is bait-clean end-to-end (no specialist or synthesis leak); specialists answer only within their `source` scope; every LLM call + agent runs on the pinned model.

---

## Phase 4 — Judge engine: reconcile to grounding ×1, judge 4 panels
**MODEL: Opus** for the scoring logic + tests; **Sonnet** for endpoint wiring.

### Task 4.0 — Unified `/api/answer` endpoint (the browser's single answer path)
**Files:** Create `lab/server/src/answer.ts` + `lab/server/src/answer.test.ts`; Modify `lab/server/src/webserver.ts`.
Resolves the browser data-flow: **all four panels' answers come through the backend** — the browser cannot run server-side orchestration (P2/P4) and admin/agent keys must stay server-side. P1/P3 are single Agent Studio runs proxied by the backend; P2/P4 are the coded coordinator. One contract, rendered identically.

- [ ] **Step 1 (failing test):** `answer.test.ts` asserts the dispatcher routes P1/P3 → single-agent producer and P2/P4 → `orchestrate`, and that every panel returns the SAME contract `{ answer, sources:[{title,url,source}], timing:{firstTokenMs,totalMs}, followUp, trace? }` (`trace` only for P2/P4). Use a mocked agent runner + mocked llm.
- [ ] **Step 2:** Run `cd lab/server && npx vitest run src/answer.test.ts` → FAIL.
- [ ] **Step 3:** Implement `answer.ts`: `producePanelAnswer(panel, question, { turn })` — P1/P3 proxy a single Agent Studio agent run (stream tokens); P2/P4 call `multiAgent.orchestrate`. Add the `/api/answer` route to `webserver.ts`: accepts `{ question, panels?, turn? }`, runs the requested panels in PARALLEL, streams per-panel tokens over SSE, then emits per-panel on-complete payloads. `turn:2` re-runs a panel with `{turn1Answer, followUp/disambiguation}` in context (multi-turn). Pinned model on all paths (fairness).
- [ ] **Step 4:** Run the test → PASS.
- [ ] **Step 5 (verify):** SSE smoke (`curl -N` against `/api/answer` with one question) returns 4 panels' streamed answers + sources + per-panel `followUp`. P2/P4 also carry `trace`.
- [ ] **Step 6 (commit):** `git add lab/server/src/answer.* lab/server/src/webserver.ts && git commit -m "feat(server): unified /api/answer SSE endpoint for all 4 panels (single proxy + coordinator)"`

### Task 4.1 — Flip grounding weight ×2 → ×1 (TDD)
**Files:** Modify `lab/judge/src/rubric.ts:29`; update `lab/judge/test/aggregate.test.ts` (and any test asserting the ×2 composite).

- [ ] **Step 1 (failing test):** Add to `lab/judge/test/aggregate.test.ts` a case asserting equal weighting:
```ts
it('composite is the equal-weighted mean of the 3 dimensions (grounding x1)', () => {
  // grounding 9, confidence 6, breadth 6 → mean = 7.0 (NOT (2*9+6+6)/4 = 7.5)
  const dims = [
    { dimensionId: 'grounding', score: 9 },
    { dimensionId: 'confidence', score: 6 },
    { dimensionId: 'breadth_depth', score: 6 },
  ];
  const composite = weightedAggregate(dims, ALGOLIA_ANSWER_RUBRIC);
  expect(toFinalScale(composite, ALGOLIA_ANSWER_RUBRIC)).toBeCloseTo(7.0, 5);
});
```
- [ ] **Step 2:** Run `cd lab/judge && npx vitest run test/aggregate.test.ts` → FAIL (currently 7.5 with ×2).
- [ ] **Step 3:** Edit `lab/judge/src/rubric.ts` line 29: change grounding `weight: 2` → `weight: 1`. Update the doc comment (lines 9-18) to state grounding is ×1 equal-weight + hard floor (not ×2), per the 2026-06-18 confirmation. Leave `DEFAULT_GATE`, `aggregateRounds`, claim-recurrence untouched — grounding stays the hard floor at `cap:3`.
- [ ] **Step 4:** Run the full judge suite `cd lab/judge && npm test` → green; fix any other test that hard-coded the ×2 composite (search for `7.5`, `2 *`, `* 2`, "x2" in tests).
- [ ] **Step 5 (commit):** `git add lab/judge && git commit -m "fix(judge): grounding weight x2 -> x1 (equal-weight + hard floor); reconcile to 2026-06-18 spec"`

### Task 4.2 — Judge 4 panels (batch 3 diverse / live 1)
**Files:** Modify `lab/server/src/webserver.ts`, `liveJudge.ts`, `judgeStep.ts`, `panels.ts`.

- [ ] **Step 1:** `panels.ts`: replace the 3 panels with P1–P4 metadata, each `{ panelId, arch, retrieval, indexName, agentId|coordinator }`. Answer production is via `/api/answer` (Task 4.0), not here.
- [ ] **Step 2:** `/api/judge` accepts `{ question, panels:[{panelId, answer, sources, followUp?}], rounds? }` for up to 4 panels; judges EACH panel blind against its OWN retrieved sources (judge never sees which cell). Live = 1 judge, flash model, 1 round, parallel, SSE (target ~20s); batch = 3 diverse judges (Skeptic/Referee/Advocate), pro model, full sources, authoritative. (Judge provider = same family as the pinned agent provider.)
- [ ] **Step 3:** Return per-panel `{ perJudge[], dims:{grounding,confidence,breadthDepth}, composite, flaggedClaims[], gateTripped, borderline, followUpQuality? }` + cross-panel `deltas:{ multiLift, neuralLift, compound }` (multiLift = multi − single within a retrieval row; neuralLift = neural − keyword within an architecture column; compound = P4 − P1). **`followUpQuality`** (0–10, scored only when a `followUp` is present — the MULTI-TURN test): is the generated follow-up on-topic, logical, and conversation-advancing? Reported as a separate comparable signal, NOT folded into the composite. Add a focused unit test for the follow-up-quality scoring path.
- [ ] **Step 4:** Extend the CLI (`cli.ts`): `run-tests` runs all 4 panels over the v3 set → store transcript; `judge <runId>` batch-judges 4 panels; `summary <runId>` prints the 2×2 leaderboard + deltas + grounding headline.
- [ ] **Step 5 (verify):** `cd lab/server && npx tsx src/cli.ts pipeline --limit 3` over 3 questions → prints a 2×2 with 4 composites, 3 deltas, and "grounding: N/N clean". Assert reproducibility: run twice, identical verdicts (zero-flicker, temp-0).
- [ ] **Step 6 (commit):** `git add lab/server && git commit -m "feat(judge): score 4 panels, cross-panel deltas, live(1)/batch(3) tiers"`

**Acceptance (Phase 4):** judge suite green with grounding ×1; `cli pipeline` produces a stable 2×2 scorecard + the three deltas over a sample; grounding hard floor still caps a planted hallucination; live tier returns in ~20s.

---

## Phase 5 — UI: 2×2 grid + score-triggered judge drawer + Leaderboard
**MODEL: Sonnet** for components; **Opus** for the final adversarial UI/UX review.
Design source of truth = `docs/refactor/ux-design-v1.md` (v1.2 canonical layout, v1.3 judge drawer 8-block lean-default + judge selector, v1.4 Leaderboard). Reuse the `AnalysisRail.tsx` pinnable/foldable/resizable pattern as the drawer mechanism.

### Task 5.1 — Types + panel config
**Files:** Modify `web/src/types/chat.ts`, `web/src/config/columns.ts`.
- [ ] Define `PanelId = 'P1'|'P2'|'P3'|'P4'`, `Panel = { id, arch:'single'|'multi', retrieval:'keyword'|'neural', indexName }`, the panel data contract `{ answer, sources:[{title,url,source}], timing:{firstTokenMs,totalMs}, trace? }`, and the judge contract `{ perJudge[], dims, composite, flaggedClaims[], deltas }` (mirror Phase 4 output). Build the 4 panel configs from CENTRAL env (`VITE_ALGOLIA_APP_ID`, `VITE_ALGOLIA_SEARCH_API_KEY` — search-only key only, never admin).

### Task 5.2 — Matrix + PanelCell + answer hook
**Files:** Create `web/src/components/Matrix.tsx`, `web/src/components/PanelCell.tsx`, `web/src/hooks/usePanelAnswers.ts`. Modify `web/src/App.tsx`.
- [ ] `usePanelAnswers.ts`: replaces the deleted `useAgentColumn`/`useWebsiteColumn`. Opens an SSE connection to the backend `/api/answer` (Task 4.0) for a question, fans the per-panel token/complete events into P1–P4 state (`{answer, sources, timing, trace?, followUp}`). All 4 panels driven by this one hook.
- [ ] `Matrix.tsx`: 2×2 grid IS the scoreboard — rows = retrieval (left vertical labels K/N), cols = architecture (Single/Multi); each `PanelCell` header carries its composite score + time (score+time sandwich the grid). Winner cell glows; persistent compound/winner badge.
- [ ] `PanelCell.tsx`: identity (`P# · Single|Multi · Keyword|Neural` + mode/agent badges); lifecycle states (idle→streaming→answered→judging→judged | refused ✋ | error); streamed markdown answer with inline `[n]` citations; dynamic **source pills** row (one per source actually used); status chips (`✅ grounded (0 flagged)` / `⚠ n`, `📎 n sources`, `⏱ firstToken/total`); multi-only orchestration mini-trace (`Maverick → Technical ✓ Marketer ·`); actions `[Sources] [Trace] [Why it won]`.
- [ ] `App.tsx`: host `<Matrix/>`, the `[Live | Leaderboard]` top toggle, and the judge drawer; wire `useLiveJudge` for 4 panels (gate on all 4 reporting).

### Task 5.3 — JudgeDrawer (score-triggered)
**Files:** Create `web/src/components/JudgeDrawer.tsx`. Reuse `AnalysisRail.tsx` patterns; remove `AnalysisRail.tsx` once superseded.
- [ ] Clicking a panel's composite score slides the drawer in from the right (pinnable + foldable). Lean default (progressive disclosure, v1.3):
  - **Always visible:** ① composite + one-line verdict + grounding-status badge; ②③ dimension bars (mean-of-3 + inline consensus marks showing where the 3 judges landed); ⑥ Comparison (the deltas: multi-lift vs sibling, neural-lift vs sibling, compound vs P1).
  - **Conditional:** grounding badge expands into **flagged-claim cards** (actual claim text + "k/3 judges") ONLY on violation.
  - **Expanders:** ⑦ How it answered (multi = Maverick entities + which specialists fired + synthesis; single = its one search query + hits; + the config diff that defines the cell); ⑧ Per-judge detail (batch only).
  - **Judge selector:** labeled avatar-chip row `[◉ Synthesis] [○ 🔍 Skeptic] [○ 🛠 Referee] [○ 🎓 Advocate]` each showing its own score; click → same template reloads to that judge; `‹ back to Synthesis` breadcrumb; accessible (real text labels, keyboard-nav, per-persona color). Live tier = Synthesis only (1 judge, indicative label).
  - Mode badge: **live = indicative** / **batch = authoritative**.

### Task 5.4 — OrchestrationTrace
**Files:** Create `web/src/components/OrchestrationTrace.tsx`.
- [ ] Maverick → 4 specialists fan-out viz that lights up live (`Tech ✓ / Mktr · / Acad · / Supp ·`) → "5 grounded docs → Maverick synthesizes → answer". Inline mini-version in the multi cell; full version in a drawer/expander (block ⑦). Single panels: same affordance shows their one search.

### Task 5.5 — Leaderboard
**Files:** Create `web/src/components/Leaderboard.tsx`.
- [ ] Separate view via the top toggle. Same 2×2 grammar, aggregated over the v3 set (batch, authoritative): (1) aggregate 2×2 with **mean composite** per cell + winner glow + the three deltas stated as a one-line verdict + grounding headline ("100% clean across N"); (2) **dimension attribution** (where each lift comes from — e.g., neural-lift mostly breadth/depth) — first-class; (3) per-question table (rows=questions, cols=P1–P4, winner per row, ⚠ on thin/contested) — **click a row → the Arena 4-panel + judge drawer for that question** (reuse, no new machinery); (4) expanders: win-rate per cell, score distribution, flagged/capped audit (red). Defaults (non-blocking, assumed unless Arijit changes): headline = mean composite; keep dimension attribution; per-question row reuses the Arena.

### Task 5.6 — Verify + commit
- [ ] `cd web && npm run build` compiles; `npm test` green. Manual: run a question, all 4 cells stream + judge + fill the matrix; click a score → drawer with the right panel; toggle Leaderboard. Take screenshots for the record.
- [ ] `git add web && git commit -m "feat(ui): 2x2 matrix scoreboard + score-triggered judge drawer + Leaderboard + orchestration trace"`

**Acceptance (Phase 5):** the 2×2 grid renders 4 streaming panels with live judging; score-click opens the correct per-panel judge drawer (lean default + judge selector + flagged-claim-on-violation); multi cells show the orchestration trace; the Leaderboard toggle shows the batch aggregate 2×2 with deltas + dimension attribution + clickable per-question rows; build + tests green; browser-shipped key is search-only.

---

## Phase 6 — Question set v3 + daily delta-sync
**MODEL: Sonnet.**

### Task 6.1 — Recreate the question set (v3) + multi-turn run flow
**Files:** Create `docs/experiment/test-questions-locked-v3.md`; Modify `lab/server/src/questions.ts`, `lab/server/src/cli.ts`.
- [ ] Recreate the set (the v2 set in `docs/experiment/test-questions-locked.md` is the structural template — 8 categories incl. Cat 7 out-of-scope grounded-refusal baits and Cat 8 multi-turn). **New requirement:** include items where **neural beats keyword** (conceptual/synonym-heavy/natural-language queries) and where **multi-agent beats single** (cross-source questions needing Technical+Support+Marketer synthesis), so the 2×2 can actually differentiate. Keep the dev/held-out split for the autocorrect overfit guard. Freeze + version it.
- [ ] **Multi-turn = generated follow-up (per the MULTI-TURN invariant).** Cat 8 entries carry an opener only (clear or ambiguous); the follow-up turn is NOT scripted — each panel generates its own via the shared block. The CLI runs the 2-turn sequence per panel: turn-1 answer (+ its `followUp`) → turn-2 = re-run with `{turn1Answer, followUp}` in context (Task 4.0 `turn:2`). The judged artifact for Cat 8 includes turn-1 answer + the generated follow-up + turn-2 answer, so `followUpQuality` (Task 4.2) is comparable across panels.
- [ ] Wire `questions.ts` to load v3; add the 2-turn driver to `cli.ts run-tests`. Commit.

### Task 6.2 — Delta-sync pipeline (data-only, TDD on the diff)
**Files:** Create `scripts/setup/delta_sync.mjs`, `scripts/setup/delta_sync.test.mjs`.
- [ ] **Step 1 (failing test):** the diff is pure — test it:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeDelta } from './delta_sync.mjs';

test('computeDelta returns new + changed records, by objectID + hash', () => {
  const live = [{ objectID: 'a', _hash: '1' }, { objectID: 'b', _hash: '2' }, { objectID: 'c', _hash: '3' }];
  const existing = new Map([['a', '1'], ['b', 'OLD']]); // a unchanged, b changed, c new
  const delta = computeDelta(live, existing);
  assert.deepEqual(delta.map(r => r.objectID).sort(), ['b', 'c']);
});
```
- [ ] **Step 2:** Run `node --test scripts/setup/delta_sync.test.mjs` → FAIL.
- [ ] **Step 3:** Implement `computeDelta(liveRecords, existingHashByObjectId)` returning records whose objectID is new or whose content hash changed; and a `runDeltaSync()` that: browses live Visibility, applies `filterEnglish` + `dedupeByUrl` (same seed rule), computes the delta vs each CENTRAL index's current state, and **upserts data only** via `saveObjects` (NEVER calls `setSettings` — each index keeps its own retrieval config/mode). Deletions: mark dormant or remove per Arijit's call (default: upsert-only; log removed URLs, do not delete — revisit).
- [ ] **Step 4:** Run the test → PASS. Document the cron/schedule (end-of-day) in the script header; do NOT wire a live cron yet (manual/triggered run for now).
- [ ] **Step 5 (commit):** `git add scripts/setup/delta_sync.* lab/server/src/questions.ts docs/experiment/test-questions-locked-v3.md && git commit -m "feat: v3 question set + data-only delta-sync (config-preserving) with diff tests"`

**Acceptance (Phase 6):** v3 set is frozen, includes neural/multi differentiators + the dev/held-out split; `delta_sync` diff is tested and, on a dry run, upserts only changed/new records while leaving each index's settings/mode untouched.

---

## Phase 7 — Adversarial verification + deploy
**MODEL: Opus** (adversarial review) · **Sonnet** for deploy wiring.

### Task 7.1 — Grounding + reproducibility audit
- [ ] Run the Cat 7 bait set through ALL FOUR panels (P1–P4) via `cli run-tests --ids <cat7>`; assert every panel refuses cleanly (0 training-data leaks). Multi-agent must not leak via any specialist or the synthesis step.
- [ ] Run `cli judge` twice over the full v3 set; assert identical verdicts (zero-flicker, temp-0) and that the grounding hard floor caps any planted hallucination.
- [ ] Adversarial review (Opus subagent): does the judge being blind + scored-vs-own-sources actually keep keyword-vs-neural fair (thin keyword retrieval → lower breadth/depth, NOT grounding violations)? Confirm against a thin-retrieval question.

### Task 7.2 — Deploy
**Files:** Modify `vercel.json`, `render.yaml`, env dashboards.
- [ ] Frontend env on Vercel: `VITE_ALGOLIA_APP_ID`, `VITE_ALGOLIA_SEARCH_API_KEY` (search-only), `VITE_LAB_API_URL`. Backend env on Render: `ALGOLIA_ADMIN_API_KEY` (server-only), the 10 `ALGOLIA_AGENT_*_ID`s, both provider IDs (`ALGOLIA_PROVIDER_OPENAI_ID`/`_GEMINI_ID`) + `ALGOLIA_AGENT_MODEL`, `OPENAI_API_KEY` + `GOOGLE_API_KEY`, `LLM_PROVIDER` (resolver picks openai→gemini).
- [ ] Deploy; verify the live 2×2 runs a question end-to-end on the Vercel URL: the browser calls the Render backend `/api/answer` (4 panels stream — single proxied, multi orchestrated) then `/api/judge` (matrix fills). Answers + orchestration + keys are all server-side; the browser only holds the search-only key (for source preview).
- [ ] `git commit -m "chore(deploy): point lab at CENTRAL 0EXRPAXB56; ship 2x2 to Vercel + Render"` (push only on Arijit's go).

**Acceptance (Phase 7):** all 4 panels bait-clean; judge reproducible; fairness confirmed; the 2×2 lab is live and runs a question end-to-end.

---

## Global acceptance criteria (the build is "done" when all hold)
1. Four CENTRAL indices, identical ~8,100-record en/url-deduped corpus, correct per-index retrieval config (neural mode on P3/P4; Case-3 config on P1); no pre-existing shared-tenant index touched.
2. P1/P3 = single Agent Studio agents (proxied); P2/P4 = coded Maverick coordinator over native source-scoped specialist agents. **FAIRNESS: identical model + provider + grounding contract on all 4 + the coordinator; only architecture+retrieval vary.** All answers flow through `/api/answer`.
3. Both OpenAI + Gemini providers registered on `0EXRPAXB56`; `provider.ts` resolves one pinned `{provider, model}` applied uniformly (prefer OpenAI → fallback Gemini).
4. Judge scores 4 panels blind on the 3-dim composite with **grounding ×1 + hard floor**; 3 diverse judges (batch) / 1 (live); reproducible at temp-0. Generated-follow-up quality scored as a separate comparable signal (`followUpQuality`).
5. The 2×2 UI: matrix scoreboard + streaming panels + source pills + score-triggered judge drawer (lean default, judge selector, flagged-claim-on-violation) + orchestration trace + separate Leaderboard with deltas and dimension attribution.
6. v3 question set frozen with neural/multi differentiators; Cat 8 multi-turn uses generated (not scripted) follow-ups; data-only delta-sync tested.
7. Every panel refuses all out-of-scope bait cleanly (including the multi-agent synthesis path); the grounding floor caps hallucination.
8. Old 3-panel code (website / Ask-AI / capture) deleted; build + all test suites green; browser ships only a search-only key (answers/keys server-side).

---

## Self-review notes (architect, 2026-06-18)
- **Spec coverage:** brief §§2,3,6,8,9,10 + UX v1.0–v1.4 + the 6 ADRs each map to a phase/task above (data §1, single-agent §2, multi-agent/roster §3, judge ×1 §4, UI/drawer/Leaderboard §5, question-set/delta-sync §6, verify/deploy §7).
- **App + key (2026-06-18):** build home = CENTRAL `0EXRPAXB56` (`ALGOLIA_*`), NOT a separate FLAGSHIP app. `ALGOLIA_ADMIN_API_KEY` in place + write-verified (lacks only `addApiKey` → browser key minted by hand/fallback). NeuralSearch + Agent Studio verified live. Naming locked `AC2_WWW_*` / `ac2-*`. Brief/ADRs still say "FLAGSHIP" + old names — this plan wins.
- **Gaps closed (2026-06-18, Arijit review):** (1) Maverick = **coded coordinator** in `lab/server` (not an Agent Studio agent); specialists = native source-scoped agents (Phase 3). (2) **Provider registration** on `0EXRPAXB56` for **both OpenAI + Gemini** added as Phase 0 Task 0.3 (per-app IDs; the old `provider.ts` IDs don't carry over). (3) **Unified `/api/answer`** backend endpoint (Task 4.0) = the single answer path for all 4 panels (browser can't run orchestration; keys stay server-side). (4) **Multi-turn = generated follow-up**, judged via `followUpQuality` (MULTI-TURN invariant). (5) **FAIRNESS INVARIANT**: identical model+provider+grounding across all 4 panels + coordinator.
- **Deferred (documented, not silent):** the **autocorrect loop** is salvaged but its re-wire to the 4-panel Leaderboard metric is **Phase 2** (post-build optimization), not in this plan. Likewise "compare two runs" overlay and dataset enrichment.
- **Shared-tenant risk:** `0EXRPAXB56` has ~150 indices + other teams' agents. Touch only our 4 `AC2_*` indices + `ac2-*` agents.
- **Known build-time opens (not blockers):** (a) 8 specialist agents vs 4 parameterized — decided at Task 3.2 Step 1 by the Agent Studio API; (b) delta-sync deletions = upsert-only default; (c) 3 Leaderboard micro-choices = defaults in Task 5.5.
- **Read-receipt discipline:** Tasks 0.1, 0.3, 2.1, 3.2, 7.2 touch the Algolia/Agent Studio wire protocol — each requires a read receipt against `docs/algolia-api/` before the write.
