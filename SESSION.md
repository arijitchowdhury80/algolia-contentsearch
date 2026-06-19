# SESSION.md — Algolia-Central2

_Last updated: 2026-06-19 (later) EDT_

## ▶ RESUME (2026-06-19 later — SENIOR-UX REDESIGN + PERF/STREAM DIAGNOSIS + FIX-AND-LEARN LOOP) — START HERE (supersedes ALL blocks below)

**One-line status:** Ran a senior-UX pass over the 2×2 lab and shipped a set of polish fixes (verified live, desktop + mobile); diagnosed the perf + "no streaming" complaints to the backend; and stood up an always-on **Fix-and-Learn self-improvement loop**. All work committed + pushed to `origin/refactor/2x2-answer-quality-lab`.

**Working directory note:** Dropbox renamed the project folder — the canonical, latest copy is now **`~/AI-Development-OLD/RAG/Algolia-Central2`** (NOT `~/AI-Development`, which Dropbox is re-syncing from an older snapshot). The dev server must be started from `-OLD`. See the lessons log.

### DONE THIS SESSION (UX redesign — all verified live via browser)
- **Unified question bar:** one slim top bar = where you ask AND see the current question (the submitted query stays in the field); removed the separate read-only question strip and the bottom composer. Sample-questions picker sits beside it and opens downward.
- **Removed the winner-verdict headline strip** (per Arijit — "not adding value").
- **Viewport-fit layout:** the 2×2 now fills the screen as equal halves; the PAGE never scrolls — each tile scrolls internally with its SOURCES footer pinned. Kills the whitespace-when-one-declines problem. (`grid-template-rows: auto minmax(0,1fr) minmax(0,1fr)`.)
- **"Best answer" tag** on the winning tile (★ + glow) — scannable verdict without the headline strip.
- **Alive waiting state:** ticking elapsed timer + context hint per panel (multi-agent says "takes longer") — kills the frozen-screen feel during the long backend waits.
- **Neural badge honesty:** P3/P4 show plain "Neural"; "enabling" shows ONLY when the backend explicitly reports the index isn't live (was over-claiming "not ready" from absent `/health` data).
- **Mobile fixed:** stacked tiles size to content + the question bar wraps (Send no longer cut off).
- Verified: `tsc` clean; live browser screenshots across hero / answering / judged / declined / drawer / 390px mobile.

### DIAGNOSED (both BACKEND — blocked on the SSH allow-rule / VPS redeploy)
- **"No streaming":** `lab/server/src/answer.ts` is non-streamed by design — it awaits the full Agent Studio completion then emits one SSE block (`firstTokenMs===totalMs`). Upstream Agent Studio DOES stream; `agentRunner` buffers it. Fix = forward tokens as SSE deltas.
- **"Suddenly slow":** 100% backend — multi-agent chains (sequential LLM calls) + newly-enabled neural + likely Gemini throttling. Frontend changes cannot affect generation time (proven by network trace: all calls hit the VPS). Levers: parallelize specialists, cap hops, trim sources, progressive judge.

### NEW MECHANISM — Fix-and-Learn Loop (always-on, set globally)
- Global SOP: `~/.claude/docs/fix-and-learn-loop.md`; trigger wired into `~/.claude/CLAUDE.md` (Cardinal Rule 6 + a dedicated section).
- Project arm: `docs/sop/lessons-log.md` — seeded with ~12 issues from this whole 2×2 effort (root cause + fix + prevention each).
- On any issue resolved during execution: capture Symptom → Root cause (named mechanism) → Fix → Evidence → Prevention heuristic, to memory/vault, before moving on.

### NEXT (unchanged, still gated on backend access)
1. **VPS backend redeploy** — BLOCKED on the SSH allow-rule. Enables: `/health` neural field (badge auto-clear), token streaming, source facets in the pills, judge tuning. Command in the ~2am block below.
2. **Flip neural** (`enable_neural.mjs` still 412) → see [[project-neural-needs-events]].
3. **Authoritative batch `cli pipeline`** once neural is on.

---

## ▶ RESUME (2026-06-19 ~2am — FRONTEND STYLED + DEPLOYED LIVE) — (superseded by the block above)

**One-line status:** The 2×2 lab UI is now **fully styled + DEPLOYED LIVE on Vercel** (`https://algolia-contentsearch.vercel.app`, prod, verified end-to-end against the VPS backend: answers stream, judge scores, drawer opens, grounded refusal renders). A self-healing **"Neural · enabling"** badge is live on P3/P4 (honest while neural is off). **NEXT (in order): (1) VPS backend redeploy** — needed so `/health` serves the new neural-mode field that makes the badge auto-clear when neural flips (the SSH redeploy was BLOCKED this session by the auto-mode guard → needs explicit user go-ahead or run by hand); **(2) flip neural** once `enable_neural.mjs` stops 412'ing; **(3) authoritative batch `cli pipeline`**.

**Branch:** `refactor/2x2-answer-quality-lab` (off main; NOT merged to main). Latest commit `ddfade9` (UI styling + neural badge), pushed to origin. **Vercel prod is deployed from this branch's local build via `vercel --prod`** (NOT git-auto; the prod alias now serves the 2×2). Prior commits: `b02d8c2` 2×2 build · `01c83a9` agents · `6472d60`/`4e72ae3` VPS deploy · `bb32f17` handoff.

### DONE THIS SESSION (2026-06-19 ~2am) — UI styling + deploy
- **Discovered + fixed:** the 2×2 UI shipped logic-complete but **visually a skeleton** — Matrix grid, PanelCells, JudgeDrawer specifics, Markdown, Popover had **zero CSS** (only salvaged legacy `apphead/composer/sampleq/arail` were styled). "All suites green" only proved logic; `vite build` doesn't fail on missing CSS.
- **Implemented locked `docs/refactor/ux-design-v1.md` v1.2:** new `web/src/styles/lab2x2.css` (~560 lines) — Matrix 2×2 scoreboard (accent cells P1 cyan/P2 purple/P3 coral/P4 green, score pills, vertical KEYWORD/NEURAL labels, delta strip, winner glow), PanelCell (identity/badges/body/source pills/mini-trace/chips/actions/footer), JudgeDrawer `jdrawer__` pieces (selector chips, composite, dims, comparison deltas, claim cards, config, per-judge), Popover, Markdown spacing. Added `--accent-p1..p4` tokens. Hero shows only the composer pre-run (`lab--hero`).
- **Fixed stale 3-panel copy** → "one question → four systems" 2×2 framing (Composer hero + placeholder).
- **Self-healing neural-enabling badge** (TDD): backend `GET /health` now returns per-index neural mode (cached `lab/server/src/neuralStatus.ts`); frontend `useNeuralStatus` + `lib/neuralStatus.ts` + PanelCell show "Neural · enabling" on P3/P4 until the index reports `neuralSearch` → clears with NO redeploy when the flip lands. Conservative: unknown/`/health`-down → shows enabling (honest, neural IS off now).
- **gitignore hardened:** added `.secrets/` (SSH key!) + `.claude/` — they were untracked-but-not-ignored (key-leak risk).
- **Verified:** web 94 · server 79 · judge 66 tests green; tsc clean; web build clean. Screenshots across ALL states (hero, streaming, answered, judged, drawer, refusal, neural badge) on local AND live prod.
- **CAVEAT (data, not UI):** the live single-judge (flash) frequently gates keyword panels (P1/P3 ~3.0) while multi/neural land 9–10 → big deltas, but neural is still OFF (P3/P4 run keyword-mode) so the neural axis is a CONFOUND, and live judge is thin-source-indicative. The authoritative verdict still needs neural-on + batch `cli pipeline`.
- **MINOR follow-up:** agent answers using `[[n]](url)` citation syntax render the outer brackets literally in `Markdown.tsx` (link still works) — lightweight-renderer edge case, cosmetic.

### DONE (live, verified)
- **Phase 0 probe** (`scripts/setup/check_central.mjs`): admin write ACL ✅, Agent Studio ✅, browser search-only key MINTED → `.env.local:VITE_ALGOLIA_SEARCH_API_KEY`.
- **Phase 0.3 providers** (`setup_providers.mjs`): **OpenAI key is 429-DEAD** → registered `ac2-gemini` (`ALGOLIA_PROVIDER_GEMINI_ID=a1ca01bf-bc28-4844-89d1-331b79c3e1ab`), pinned `ALGOLIA_AGENT_PROVIDER=gemini` / `ALGOLIA_AGENT_MODEL=gemini-2.5-pro` (fairness invariant = same on ALL agents).
- **Phase 1 seed** (`seed_dedup.mjs`+test TDD-green, `seed_central.mjs`): 4 indices `AC2_WWW_{SINGLE,MULTI}_{KEYWORD,NEURAL}` on `0EXRPAXB56`, **8103 records each** (15179→en 11063→url-dedup 8103), identical sets, url-hash objectIDs. Case-3 levers on `SINGLE_KEYWORD`, 7 synonyms + `source` facet on all. Verify: `node scripts/setup/verify_seed.mjs`.
- **Neural event clock STARTED** (`seed_neural_events.mjs`): 839 relevance-faithful events/neural-index pushed.

### DONE (build) — committed
- **2×2 code build** (workflow `wd7g540ei`) → committed `b02d8c2`; adversarial review caught real gaps → **rectify agent** fixed them → all suites GREEN (lab/judge 66/66 · lab/server 72/72 + tsc 0 · web build 0 · scripts 9/9), independently re-verified.
- **10 live `ac2-*` agents created + published + bait-clean** on `0EXRPAXB56` (script `01c83a9`). Source-scoping uses `searchParameters.filters` STRING (NOT facetFilters array — that 422s; proven shape rc3 elena agent). IDs (also in `.env.local`):
  - `ALGOLIA_AGENT_P1_ID=23901423-a1de-4b6d-ac50-95bb1fbdc19e` (ac2-single-keyword)
  - `ALGOLIA_AGENT_P3_ID=63326efb-979e-4235-97d9-ded71ff73716` (ac2-single-neural)
  - tech-keyword `fb933ecc…` · tech-neural `c1c425b1…` · marketer-keyword `4d671dd3…` · marketer-neural `4af0897c…` · academy-keyword `be89f47d…` · academy-neural `74ebd5ef…` · support-keyword `6851a346…` · support-neural `979bbb4b…`
  - Grounding verified: all 10 decline off-topic/competitor/adjacent cleanly; scoping confirmed (specialists see only their `source` slice).

### DONE (deploy)
- **Integration smoke** — `cli pipeline --limit 1` ran all 4 panels → judge → 2×2 leaderboard end-to-end (machinery proven). Caveats: both multi panels gated on grounding (coordinator synthesis); neural not yet on (P3/P4 keyword-mode) → NOT an authoritative neural verdict.
- **✅ BACKEND DEPLOYED LIVE on the VPS** (replaced the old judge-only backend). Host `72.61.72.147` user `chowmesadmin` (key `.secrets/chowmes_ed25519`, `-o IdentitiesOnly=yes -o UserKnownHostsFile=.secrets/known_hosts`). Branch checked out at `~/lab-judge`; container **`ac2-lab-backend`** (healthy, `127.0.0.1:8787`) via `deploy/docker-compose.yml` (builds repo-root `Dockerfile`); Caddy fronts **`https://judge.contentengagement.info`**. VERIFIED: /health 200 local+public, auth 401 w/o key, authed `/api/answer` returns a grounded P1 answer. **Hermes + Caddy untouched.** VPS env `~/lab-judge/deploy/.env` (regen: `node scripts/setup/build_deploy_env.mjs` → `scp deploy/.env`). Redeploy: `ssh … 'cd ~/lab-judge && git fetch origin <branch> && git checkout -f -B <branch> FETCH_HEAD && sudo docker compose -f deploy/docker-compose.yml up -d --build'`.

### PENDING / NEXT
1. **VPS backend redeploy** (BLOCKED this session — SSH to shared infra denied by the auto-mode guard; needs explicit user OK or run by hand). Redeploys the updated backend so `GET /health` serves the new `neural` field. Until then the "Neural · enabling" badge is correct (neural is off) but will NOT auto-clear when neural flips. Add a Bash allow-rule for the SSH, or run: `ssh -i .secrets/chowmes_ed25519 -o IdentitiesOnly=yes -o UserKnownHostsFile=.secrets/known_hosts chowmesadmin@72.61.72.147 'cd ~/lab-judge && git fetch origin refactor/2x2-answer-quality-lab && git checkout -f -B refactor/2x2-answer-quality-lab FETCH_HEAD && sudo docker compose -f deploy/docker-compose.yml up -d --build'` then `curl -s https://judge.contentengagement.info/health` should show `"neural"`.
2. **Neural enablement** (P3/P4) — `node scripts/setup/enable_neural.mjs` still 412 (overnight aggregation). Non-blocking — P3/P4 run keyword-mode until the flip; the badge tells the truth. See [[project-neural-needs-events]].
3. **Authoritative batch run** — after neural is on: `cli pipeline` over the full v3 set for the real 2×2 verdict (the live single-judge is thin-source-indicative and the neural axis is still a confound until #2).
4. **Frontend (Vercel) — DONE** ✅ deployed to prod (`vercel --prod`), env vars `VITE_ALGOLIA_APP_ID` + `VITE_ALGOLIA_SEARCH_API_KEY` added to Vercel Production; `VITE_LAB_API_URL` + `VITE_LAB_API_KEY` already present + verified matching the VPS secret. Live + verified.

### KEY DECISIONS THIS SESSION
- **Neural axis = synthetic event bootstrap** (Arijit, 2026-06-18): neural needs aggregated events; fresh index 412s. Pushed events; `enable_neural.mjs` flips when ready. Validity caveat accepted.
- **Provider = Gemini** (OpenAI dead). Fairness invariant satisfied (same provider/model all panels).
- env name delta: read key is `ALGOLIA_SEARCH_API_KEY` (plan said `ALGOLIA_API_KEY`).

---

## ▶ RESUME (2026-06-18 PM) — (SUPERSEDED by the BUILD UNDERWAY block above)

### STATUS (one line)
**PLAN WRITTEN.** Design + plan both COMPLETE for the v2 refactor (2×2 four-panel + content-source multi-agent on the FLAGSHIP app). The plan = **`docs/superpowers/plans/2026-06-18-answer-quality-lab-2x2-refactor.md`** (7 phases, per-phase model tags, real code + acceptance criteria, self-contained). **Still zero build code.** Next action = **FRESH UltraCode build session** executes the plan — BUT blocked on FLAGSHIP creds (see below).

### APP CORRECTION (2026-06-18) — build home = CENTRAL `0EXRPAXB56`, NOT a new FLAGSHIP app
Arijit confirmed we operate on **`ALGOLIA_APP_ID=0EXRPAXB56`** (the CENTRAL app; `ALGOLIA_*` keys). Probed live: NeuralSearch ✅ + Agent Studio ✅ (already hosts other teams' agents). Visibility `1QDAWL72TQ` = read-only seed source (`VISIBILITY_*`). VVKSSPDMJX abandoned. The plan + brief "FLAGSHIP" = read as `0EXRPAXB56`. **Shared tenant: 150 indices + other teams' agents — touch ONLY our 4 `ALGOLIA_WWW_PROD_V2_{SINGLE|MULTI}_{KEYWORD|NEURAL}` indices + `visibility-agent-*` agents.**

### ✅ UNBLOCKED — ready for the UltraCode build
- **`ALGOLIA_ADMIN_API_KEY` in `.env.local`, verified write-capable** (ACL incl. addObject/editSettings/deleteIndex/inference). Only `addApiKey` is missing → browser key minted by hand or fall back to the read-only `ALGOLIA_API_KEY` (Plan Task 0.1 Step 3). Old read key kept as fallback browser search key.
- **Index naming LOCKED:** `AC2_WWW_<ARCH>_<RETRIEVAL>` → `AC2_WWW_SINGLE_KEYWORD` (P1) · `AC2_WWW_MULTI_KEYWORD` (P2) · `AC2_WWW_SINGLE_NEURAL` (P3) · `AC2_WWW_MULTI_NEURAL` (P4). Agents mirror: `ac2-single-keyword/-neural`, `ac2-maverick`, `ac2-tech/-marketer/-academy/-support`. (Brief/ADRs still say old `ALGOLIA_WWW_PROD_V2_*` + "FLAGSHIP" — the PLAN's names + `0EXRPAXB56` win.) Plan updated throughout.
- **Open (non-blocking):** confirm build-model strategy (Plan adopts: Sonnet workhorse, Opus for grounding/orchestration/judge/review, Haiku trivial-only). Shared tenant — touch ONLY our 4 `AC2_*` indices + `ac2-*` agents.

### Plan HARDENED (2026-06-18, Arijit review — 5 gaps closed)
The plan was stress-tested and 5 real gaps fixed before build: **(1)** Maverick = **coded coordinator** (`lab/server/multiAgent.ts`), specialists = native source-scoped Agent Studio agents (8: `ac2-{tech,marketer,academy,support}-{keyword,neural}`). **(2)** Phase 0 Task 0.3 = **register both OpenAI + Gemini providers on `0EXRPAXB56`** (per-app IDs; old `provider.ts` IDs invalid here). **(3)** Unified **`/api/answer`** SSE endpoint (Task 4.0) = single answer path for all 4 panels (browser can't orchestrate; keys server-side). **(4)** Multi-turn = **generated (not scripted) follow-up**, judged via `followUpQuality` — tests which architecture asks the better next question. **(5)** **FAIRNESS INVARIANT**: identical model+provider+grounding across all 4 panels + coordinator (Arijit). Autocorrect re-wire = explicitly Phase 2 (deferred). Plan confidence now high; ready for UltraCode.

### ⏳ FIRST ACTION NEXT SESSION
1. Read this block + the PLAN (`docs/superpowers/plans/2026-06-18-answer-quality-lab-2x2-refactor.md`). The plan's "Canonical facts" header is the single source of truth; the two design docs (`docs/refactor/demo-app-retrieval-comparison-brief.md`, `docs/refactor/ux-design-v1.md`) + vault 6 ADRs are the backing detail.
2. Admin key + naming are settled (see "✅ UNBLOCKED" above). Phase 0 Task 0.1 writes `check_central.mjs` to re-verify write/neural/Agent-Studio before seeding.
3. Launch the FRESH **UltraCode** build session against the plan, Phase 0 → 7 in order.
4. 3 non-blocking Leaderboard micro-choices assumed at defaults unless Arijit changes them (mean-composite headline · keep dimension-attribution · per-question row reuses the Arena).

### Where we stopped (exact)
Finished designing the **Leaderboard** view; renamed "Scorecard"→"Leaderboard" to kill the score/scorecard confusion. Clarified the two surfaces: **click a panel's score → Judge drawer** (per-answer); **Leaderboard = separate view via top toggle** (batch aggregate). All design locked. User then ran `/persist`.

### Decisions locked this session
- **Pivot:** drop incumbent-vs-us. New = 2×2 over our own system: retrieval (keyword/neural) × architecture (single/multi). 4 panels, each judged.
- **App:** move to `FLAGSHIP_Accelerator_Program_APP` (NeuralSearch ON); **abandon `VVKSSPDMJX`**. (Arijit to provide FLAGSHIP API/creds.)
- **Indices (4):** `ALGOLIA_WWW_PROD_V2_{SINGLE|MULTI}_{KEYWORD|NEURAL}`, seeded from a fresh **English-only, url-deduped (~8,100)** copy of Visibility `ALGOLIA_WWW_PROD_V2` (`1QDAWL72TQ`, READ-ONLY). Keyword vs neural = `mode` on identical records. Dedup profiled (`scripts/setup/profile_source_dups.py`): 15,179 physical→12,064 unique; en 11,063→8,103; `environment` is NOT a prod filter (keep all, dedup by `url`).
- **Panels (row-major):** P1 single+keyword · P2 multi+keyword · P3 single+neural · P4 multi+neural (bottom-right = full power).
- **Multi-agent = content-source specialists** + **Maverick** orchestrator (discovery, entity extraction, routing, parallel synthesis; broad/unscoped view). Specialists = shared MULTI index scoped by `source` facet filter (native): **Technical** (Documentation+Developers+Customer Stories) · **Marketer** (Website+Blog+Resources+Other) · **Academy** · **Support**. Principle: **data-driven, NOT legacy** (rc2/rc3 = legacy POC; A-C2 = v2; no SE/SA carry-over).
- **Case-3 config port:** tuned config (`removeStopWords:['en'], ignorePlurals:['en'], queryLanguages:['en'], removeWordsIfNoResults:'allOptional'` + 7 synonyms) = STARTING config for `SINGLE_KEYWORD` only (keep `allOptional`); keyword-only levers NOT on neural; synonyms can carry. (Brief §6.)
- **Judge:** 3 dims (Grounding, Confidence, Breadth/Depth). **Grounding = hard GATE at ×1, NOT ×2** (CONFIRMED — ×2 lets one passed-by-all param dominate; composite = gate × mean(g,c,b)). **Blind** judge vs each panel's own sources. **3 DIVERSE judges BATCH** (🔍Skeptic/grounding · 🛠Practitioner/confidence · 🎓Expert/breadth, synthesized, supermajority gate → authoritative) / **1 judge LIVE** (flash, thin → indicative).
- **UX:** 2×2 grid = scoreboard (rows retrieval, cols architecture; score+time sandwich); dynamic source pills; **score-click → pinnable/foldable Judge drawer**. Lean judge panel: always-on ①composite+verdict+grounding-status ②③dimensions ⑥comparison(deltas); expanders ⑦how-it-answered(trace+config) ⑧per-judge; grounding flagged-cards only on violation. Dual-layer judges = one template + selector `[Synthesis]🔍🛠🎓` (labeled chips + tooltips) + inline consensus marks. **Leaderboard** = separate view via toggle `[Live|Leaderboard]`: 2×2 means+verdict+grounding headline → dimension-attribution → per-question table (row→Arena) → expanders (win-rate/distribution/flagged-audit). Compare-runs = Phase 2.
- **Other:** question set = RECREATE (must let neural/multi differentiate). Old algolia.com + Ask-AI panels = DELETE (salvage reusable, lean, no fat). Daily delta-sync = build later (DATA-ONLY, never touch per-index config; en + url-dedup per sync).

### Build model strategy (recommended — confirm when writing the plan)
- **Planning = Opus 4.8** (best reasoning; the plan is the leverage point + it carries per-phase model tags).
- **UltraCode build sub-agents = tiered** (plan tags each phase; UltraCode sets `opts.model` per agent):
  - **Sonnet 4.6 = default workhorse** — index/seed scripts, UI components, wiring, tests, scaffolding (strong coding, fast/cheap for parallel fan-out).
  - **Opus 4.8 = escalate** for the high-reasoning, high-stakes steps: agent instructions + grounding contract, Maverick orchestration logic, judge composite/gate logic, and the adversarial review/verify pass.
  - **Haiku 4.5** only for trivial mechanical sweeps (sparingly; never correctness-critical).
- Principle: spend Opus where it changes the outcome (grounding/orchestration/judging/review); Sonnet for the bulk. NOT all-Opus (slow/costly) and NOT all-Sonnet (the grounding/orchestration/judge logic earns Opus).

### Remaining work (in order)
1. **Write the plan** (goal + steps + acceptance) ← next action.
2. UltraCode build (fresh context): seed 4 FLAGSHIP indices → single-agent panels (port Case-3 agent, repoint) → multi-agent (Maverick + 4 specialists, source-scoped) → judge engine (3 diverse batch / 1 live, ×1 gate, dual-layer) → 2×2 grid UI + judge drawer + Leaderboard → delta-sync → recreate question set → delete old code.
3. Build-time opens: delta-sync mechanics; multi-agent-on-keyword (P2) query path; reconcile grounding ×1 with existing `lab/judge` (×2); dataset enrichment (Phase 2).

### Reference files (read to resume)
- `docs/refactor/demo-app-retrieval-comparison-brief.md` — architecture + decisions + seed spec + roadmap (source of truth).
- `docs/refactor/ux-design-v1.md` — full UX/judge/Leaderboard design + mockups.
- `scripts/setup/profile_source_dups.py` — dedup profiler (read-only). `scripts/setup/optimize_index.mjs` + `migrate_corpus.py` + `instructions_case3_*.md` — Case-3 config + seed to port/adapt.
- Vault `Projects/algolia-central2/` (index.md + 6 ADRs + open-questions.md). Memory `project-v2-refactor-2x2-multi-agent.md`.

### What has NOT been done (no false completion)
**Zero code written.** No FLAGSHIP indices/agents created. No question set. **The plan is NOT yet written.** Grounding ×1 not reconciled with existing `lab/judge` (×2). The 3 Leaderboard micro-choices not explicitly confirmed (defaults assumed). Delta-sync mechanics + multi-agent-on-keyword path not designed in detail. FLAGSHIP API/creds referenced, not yet validated.

### Files written/updated this session
- Repo: `docs/refactor/demo-app-retrieval-comparison-brief.md`, `docs/refactor/ux-design-v1.md`, `scripts/setup/profile_source_dups.py`, `SESSION.md`.
- Vault `Projects/algolia-central2/`: index.md, CLAUDE.md, log.md, wiki/{overview,requirements,open-questions,dev-log}.md, 6 ADRs.
- Memory: `project-v2-refactor-2x2-multi-agent.md`, `MEMORY.md`, `session_pointer.md`.

---

## Prior direction (SUPERSEDED by the refactor above)
The earlier lab (3 panels: ① algolia.com · ② Ask-AI floor · ③ our single agent on `VVKSSPDMJX`) is BUILT + deployed LIVE (Vercel `algolia-contentsearch.vercel.app` + VPS judge backend, `origin/main` @ `7939f73`/`09e68a1`). Its pending "run batch `cli judge`" action is **superseded** — we're rebuilding into the 2×2. **Salvage for reuse:** `lab/judge` (judge engine), the autocorrect loop, analysis-rail UI patterns, the eval CLI. **Delete:** the 3-panel UI + Ask-AI wiring.
