# SESSION.md — Algolia-Central2 (Visibility Agents)

_Last updated: 2026-06-18 ~1:05am EDT_

## ▶ RESUME (2026-06-18 ~1am) — START HERE (latest; supersedes ALL blocks below)

**This session DID BOTH workstreams Arijit asked for ("do both, A first") + the UX rework + a judge-speed/streaming overhaul + full-screen layout. All BUILT, VERIFIED, COMMITTED (6 commits, NOT pushed).**

### ➕ UPDATE (~1:45am) — judge SPEED + STREAMING + FULL-SCREEN (committed e8f4bb5, d78dfbf)
- **Why:** Arijit hit a 7–10 min live judge (he was testing the OLD code on Vercel/VPS — the new code is LOCAL only). Root cause: gemini-2.5-pro × 2 rounds × 2 panels SEQUENTIAL + 429 retry-backoff + no progress UI.
- **Fix (live judge is indicative; batch `cli judge` stays authoritative on pro):** live model → **gemini-2.5-flash** (`makeActiveJudgeLlm({fastLive})`, override `JUDGE_LIVE_MODEL`); **DEFAULT_LIVE_ROUNDS 2→1**; **panels judged in PARALLEL** (`judgeLive` + `onPanel` cb, order preserved); **`/api/judge` streams SSE** (phase/panel/result/error on `Accept: text/event-stream`); `judgeClient.streamJudge` + `useLiveJudge.progress` + `AnalysisRail` JudgingView (spinner + live count + per-panel score as it lands). **~7-10 min → ~15-25s.** Browser-proven (proof-5/6).
- **Full-screen:** lanes were capped `clamp(340,30%,400px)` → big empty right margin. Now `.rail__cell flex:1 1 0; min-width:360px` → lanes fill the width; rail still scrolls for many lanes; a resized lane keeps its width (`[style*=width]→flex-grow:0`).
- Scout/esteelauder Akamai "Access Denied" screenshot Arijit shared = FYI only (different tool), no action taken.

### ✅ DEPLOYED (~2:05am) — everything is now LIVE on Vercel + VPS
- **Pushed** all 8 commits to origin/main (`7f1b4c3..3f4462b`) → Vercel auto-rebuilt the frontend.
- **VPS judge backend redeployed** (`git pull` + `docker build` + restart on `chowmesadmin@72.61.72.147` `~/lab-judge`, now @ `3f4462b`). Verified: `/health` ok, auth ENABLED, **SSE streaming confirmed** (`event: phase`→`panel`→`result`, model `gemini-2.5-flash`).
- **End-to-end verified on `algolia-contentsearch.vercel.app`:** new full-screen UX + permanent rail + 3-dim bars + streamed flash judge, completed in ~28s (proof-8-vercel-live.png). Sequence done right (backend before relying on frontend) — no SSE/JSON mismatch window in practice.
- **Timing instrumentation** also shipped: per-lane "· 24.1s" + judge "judged in Xs" + live streamed count + server `[judge-api] done in Ns` log (commit 3f4462b).
- Authorization: Arijit gave standing OK to execute deploys/pushes ("don't keep asking, keys are in env, it's your job to execute") — applies to this deploy flow.
- Remaining: re-measure ③ vs ② via batch `cli judge` (authoritative, vs the indicative live panel which thin-source-gates).

### ✅ A — ③ false-refusal FIXED + DEPLOYED (was diagnosed-only)
- Captured ③'s ACTUAL searchIndex query via the SSE `9:` frames (`/tmp/probe_agent_query.mjs`). On "typo tolerance" it searched `"Algolia typo tolerance handling"` then broadened to `"typo tolerance configuration"` → both off-topic → refused. Replaying those strings on the index = exact same off-topic hits ⇒ **100% the reformulation STRING** (no hidden tool params). Data-proven across typo-tolerance/vector-search/synonyms (`/tmp/probe_reformulations.mjs`, `/tmp/probe_gen.mjs`): the **bare concept term wins**; padding with **"Algolia"** + framing words poisons ranking (NOT burial — old theory overturned again).
- Fix: rewrote ONLY the RETRIEVAL section → **`scripts/setup/instructions_case3_reformulation_fix_v2.md`** (corrects v1's wrong "burial" rationale, adds "never include the word Algolia", tightens to bare concept term + examples). **DEPLOYED live to ③ `b5c4de23`** (`agent_admin.mjs update`, 9161 chars, published). Runtime-verified: typo-tolerance/vector-search/synonyms now search the bare term → canonical docs → full grounded+cited answers (were refusals). Grounding **bait set still clean** (off-topic refuses, no fabrication). Rollback = `instructions_case3_grounded_lead_v1.md`.
- **FOLLOW-UP (not done):** re-measure ③ vs ② via batch `cli judge` on full transcripts (the live panel can't — see caveat below). Update `docs/experiment/finding-typo-tolerance-false-refusal.md` in-repo (still has old burial theory; corrected only in memory).

### ✅ B — 3-dim judge + permanent analysis rail BUILT (feature-builder; Arijit chose "full workstream B now")
- Workspace + full status: **`docs/workspace/judge-3dim-and-rail/_status.md`** (read it).
- **Judge:** rubric → 3 dims `grounding`(x2, gated) / `confidence` / `breadth_depth`; synthesis default `"mean"` (avg of 3 judges); new `RoundAggregate.judgeComposites`; grounding hard-floor PRESERVED + now also a scored dim. Files: `lab/judge/src/{rubric,types,synthesis,prompt}.ts`. **judge 65 tests + tsc clean.**
- **Server:** `liveJudge` verdict adds `dimensions[]` + per-judge composite (0–10). **server 33 tests + tsc clean.**
- **UI:** `AnalysisDrawer`→**`AnalysisRail`** (new) = permanent, collapsible, **pinnable** right rail that **pushes** the lanes (flex sibling in `.lab__workspace`); per-dim color bars + ②-vs-③ margin + per-judge + config-diff + synthesis; **lanes `resize:horizontal`**; rail left-edge **drag-resize**; open/pinned/width persisted to localStorage. `judgeClient`/`analysis.ts`/`useLiveJudge` carry `dimensions`; old drawer + test deleted; `AnalysisRail.test` added. **web tsc + 87 tests.** 4 browser proofs in `docs/workspace/judge-3dim-and-rail/proof/`.
- **Engagement dim DROPPED** from the composite (Arijit's 3 dims explicit) — deferred.

### ⏳ FIRST ACTIONS NEXT SESSION
1. **COMMIT everything** (A + B). Suggested commits: (a) `fix(agent): ③ reformulation v2 — bare concept term, kills "Algolia"/framing padding`; (b) `feat(judge): 3-dimension composite (grounding/confidence/breadth_depth) + judgeComposites`; (c) `feat(web): permanent collapsible+pinnable analysis rail, per-dim bars, resizable lanes (push)`. Push to `main` needs Arijit's explicit OK.
2. **Re-measure ③ vs ② via batch `cli judge`** (workstream-A's win + the new 3-dim numbers).
3. Redeploy the judge backend to the VPS (new 3-dim code) + redeploy web to Vercel so the rail/3-dim go live. (VPS rebuild cmd in [[project-vps-judge-backend]].)

### ⚠ Caveat surfaced this session (important)
The LIVE judge gated ③ to 3.0 on typo-tolerance in the browser proof EVEN THOUGH the agent answers it well now — because the UI passes THIN browser source snippets, so the skeptic flags a full-answer claim the thin sources don't cover. This is CORRECT hard-floor behavior given thin sources, and it's the documented "live judge is indicative" caveat. **Authoritative numbers = batch `cli judge` on full transcripts, NOT the live panel.**

### Throwaway probes (fine to delete): `/tmp/probe_agent_query.mjs`, `/tmp/probe_reformulations.mjs`, `/tmp/probe_gen.mjs`, `/tmp/probe_tuned.mjs`.

---

## ▶ RESUME (2026-06-18 ~12:05am) — superseded by the ~1am block above

**This session: (1) DEPLOYED the live-judge backend end-to-end to Arijit's VPS over HTTPS — verified working on the live Vercel deploy; (2) root-caused the ③ "always fails" bug and CORRECTED the documented theory; (3) locked the design for the two next builds. Both next builds are scoped + unblocked but NOT started.**

### Cross-session memory to read first
`MEMORY.md` → top section. Key files: [[project-vps-judge-backend]] (DONE), [[project-case3-refusal-diagnosis]] (CORRECTED bug cause), [[project-judging-multidimensional]] (next build + grounding decision), [[project-poc-and-prod-direction]], [[project-lab-ux-redesign]].

### ⏳ FIRST ACTIONS NEXT SESSION — "do BOTH" (Arijit, 2026-06-18). Suggested order: A first.

**A — FIX ③'s false-refusal (contained product win):**
1. **Capture ③'s ACTUAL searchIndex query.** Run the ③ agent (`b5c4de23-769b-4b38-9051-a19add9dee06` on app `VVKSSPDMJX`, index `visibility_www_tuned`) on "How does Algolia handle typo tolerance?" with tool-call logging so you see the exact reformulated query string it sends. (Use the lab agent path / `callCompletions`; the `a:` frames carry the hits, need the query arg.)
2. **Fix the reformulation rule** in the prompt so the query retrieves the canonical doc. Candidate: `scripts/setup/instructions_case3_reformulation_fix_v1.md` — but VALIDATE it actually pulls the #1 doc (don't assume; the autocorrect run showed prompt-rewording often doesn't win). Validate by: re-run the probe-style search with the new reformulation → does "How does Algolia handle typing mistakes?" come back in top hits? → re-ask in the lab → judge score should jump from 1.1.
3. Deploy the fixed prompt: `node scripts/setup/agent_admin.mjs update b5c4de23-769b-4b38-9051-a19add9dee06 <file>`. Re-measure ③ vs ②.
   - **WHY this, not the index:** PROVEN this session — a sane keyword query on the tuned index returns the typo docs at **#1–2** (only 6 hits), identical under removeWordsIfNoResults allOptional/lastWords/none. The index is fine. The agent's reformulation retrieves the WRONG docs (its 9 live hits were all off-topic). NOT "burial", NOT over-refusal. See [[project-case3-refusal-diagnosis]]. Probe: `/tmp/probe_tuned.mjs` (throwaway; admin REST + native fetch; MCP algolia token is REVOKED/401).

**B — JUDGE PANEL + 3-DIM JUDGE REWORK (bigger build; route via frontend-builder for UI + TDD for judge logic):**
- **Judge → 3-dimension composite:** D1 grounding · D2 answer confidence · D3 breadth+depth. Each of 3 judges (Skeptic/Referee/Advocate) gives a composite across the 3; final = AVERAGE of the 3 judges. **DECISION (Arijit 2026-06-18): grounding = HARD FLOOR *and* a scored dimension** (a real violation still hard-caps; keeps "110% grounded"). Touch `lab/judge/{rubric,synthesis,types,prompt}.ts`, `lab/server/src/{liveJudge,judgeStep}.ts`. Keep zero-flicker ([[feedback-zero-flicker-judge]]) + reliability SOP.
- **Permanent analysis panel:** convert the on-demand `AnalysisDrawer` → a **permanent, collapsible right RAIL** filling the dead right-side space (lanes are fixed-width `clamp(340px,30%,400px)` in a horizontal scroll rail — `web/src/styles/ab.css:314` — so ~600px sits empty with 3 lanes). Color-coded composite + per-dimension bars + ②-vs-③ margin + per-judge breakdown; collapses to a strip. **Build the layout AROUND the new 3-dim judge output — once.** Idle = honest CTA, NEVER mock/zeros. Files: `AnalysisDrawer.tsx`→rail, `App.tsx` (drawerOpen toggle), `lib/analysis.ts`, `ab.css`. See [[project-judging-multidimensional]] (UI decision section).

### Where we stopped (exact)
Just finished diagnosing ③ + getting the grounding decision. Asked Arijit "dive into A now, or checkpoint?" → he ran `/persist`. So: nothing of A/B is started yet. The browser (Playwright MCP) was left open on the live app showing the typo-tolerance result (③ refusal, ② good answer, judge ③ 1.1 / ② 3.0).

### Decisions locked this session
1. **Judge backend host = Caddy on the VPS** (NOT Cloudflare Tunnel — Arijit's Cloudflare is behind corp SSO; long approval). HTTPS via Let's Encrypt at `judge.contentengagement.info`.
2. **Auth = shared-secret header (`x-lab-key` vs `LAB_API_KEY`) + per-IP rate-limit** (opt-in; protects the Gemini bill). Known POC limit: VITE_ key is in public JS; rate-limit is the real backstop.
3. **Key handling:** everything confined to the project `.secrets/` (NEVER `~/.ssh/`). Arijit directive.
4. **③ bug lever = agent reformulation prompt, NOT the index** (data-proven).
5. **3-dim judge: grounding = hard floor + scored dimension.**
6. **Both A and B to be done** ("do both"); A first (contained), B is the bigger build.

### Reference files (read these)
- `~/.claude/projects/.../memory/project-vps-judge-backend.md` — full VPS deploy state, commands, what's live.
- `~/.claude/projects/.../memory/project-case3-refusal-diagnosis.md` — corrected ③ root cause + evidence.
- `~/.claude/projects/.../memory/project-judging-multidimensional.md` — 3-dim judge + permanent-panel design + grounding decision.
- `docs/experiment/finding-typo-tolerance-false-refusal.md` — the OLD (now-contradicted) "burial" theory. Update it when fixing A.
- `scripts/setup/instructions_case3_grounded_lead_v1.md` — live ③ prompt (refusal + reformulation rules at lines 17/20/26).
- `/tmp/probe_tuned.mjs` — throwaway tuned-index probe (re-run to test reformulations).

### Live infra state (all verified this session)
- **Judge backend LIVE:** VPS `chowmes` (Hostinger `72.61.72.147`, user `chowmesadmin`, key at `.secrets/chowmes_ed25519`, SSH host-key file `.secrets/known_hosts`). Containers: `lab-judge` (Docker, `127.0.0.1:8787`, `--env-file ~/lab-judge/judge.env` = GOOGLE_API_KEY+LLM_PROVIDER=gemini+LAB_API_KEY) + `caddy` (`--network host`, Let's Encrypt). Repo cloned at `~/lab-judge` @ `7f1b4c3`. UFW now 22/80/443. Rebuild: `cd ~/lab-judge && git pull && sudo docker build -t lab-judge -f Dockerfile.judge . && sudo docker rm -f lab-judge && sudo docker run -d --name lab-judge --restart unless-stopped -p 127.0.0.1:8787:8787 --env-file judge.env lab-judge`.
- **SSH (zsh: inline opts, vars don't word-split):** `ssh -i .secrets/chowmes_ed25519 -o IdentitiesOnly=yes -o BatchMode=yes -o UserKnownHostsFile=.secrets/known_hosts chowmesadmin@72.61.72.147 "..."`.
- **Vercel:** `algolia-contentsearch.vercel.app` — redeployed with `VITE_LAB_API_URL=https://judge.contentengagement.info` + `VITE_LAB_API_KEY` (= `.secrets/lab_api_key.txt`). Judges VERIFIED lighting up live (chip + lane pills + drawer). CLI authed `arijitchowdhury-5926`; redeploy `cd web && npx vercel --prod`.
- **Domain** `contentengagement.info` (Hostinger DNS), A-record `judge → 72.61.72.147`.

### What has NOT been done (no false completion)
- **A (③ fix) NOT started** — only diagnosed. Agent's exact reformulated query NOT yet captured.
- **B (3-dim judge + permanent panel) NOT started** — only scoped + grounding decision made.
- `docs/experiment/finding-typo-tolerance-false-refusal.md` still states the OLD (wrong) burial theory — not yet corrected in-repo (corrected only in memory).
- Algolia MCP token is REVOKED (401) — used admin REST instead; not re-auth'd.
- Live-judge numbers are INDICATIVE only (thin browser source snippets cap even good answers — ② good answer scored 3.0); batch `cli judge` is authoritative.
- The 12-month algolia.com real query corpus NOT yet obtained.

### Files written/changed this session
- **Committed + pushed (`7f1b4c3` on main):** `lab/server/src/auth.ts` (new), `lab/server/src/auth.test.ts` (new, 14 tests), `lab/server/src/webserver.ts` (auth wiring), `web/src/lib/judgeClient.ts` (sends `x-lab-key`), `web/src/vite-env.d.ts` (VITE_LAB_API_KEY type).
- **Uncommitted/local:** `.secrets/` (chowmes_ed25519, known_hosts, lab_api_key.txt — all gitignored), `.playwright-mcp/` (browser snapshots), `/tmp/probe_tuned.mjs`, `CLAUDE.md` + `SESSION.md` (modified).
- **On the VPS:** `~/lab-judge/{Dockerfile.judge, Caddyfile, judge.env}` + cloned repo.
- **Memory:** updated `project-vps-judge-backend.md`, `project-judging-multidimensional.md`, created `project-case3-refusal-diagnosis.md`, updated `MEMORY.md` + `session_pointer.md`.

---

## ▶ RESUME (2026-06-17 ~2:15pm) — superseded by the 2026-06-18 block above

**This session: finished the Lab UX redesign (D2+D4), made ① work on the live deploy (browser-direct), prepped the judge backend for hosting, and pivoted to a high-stakes product phase. Everything COMMITTED + PUSHED.**

### Cross-session memory to read first
`MEMORY.md` → "▶ CURRENT DIRECTION": [[project-poc-and-prod-direction]], [[project-judging-multidimensional]], [[project-vps-judge-backend]]. (Lab UX redesign is now [[project-lab-ux-redesign]] = done.)

### ⏳ FIRST ACTIONS NEXT SESSION (Arijit drives the order)
1. **Deploy the judge backend to Arijit's VPS.** Arijit will give SSH details. The backend is now JUDGE-ONLY (① no longer needs it). Steps: clone repo on VPS (needs `lab/judge` + `lab/autocorrect` siblings); `cd lab/server && npm install`; env `GOOGLE_API_KEY` (from `.env.local`) + `LLM_PROVIDER=gemini` + `PORT`; run under pm2/systemd; **serve over HTTPS** (Caddy + subdomain, OR Cloudflare Tunnel — REQUIRED: the HTTPS Vercel frontend can't call a plain-http backend). Then set **`VITE_LAB_API_URL`** = the HTTPS URL in Vercel Production (via the authed `vercel` CLI) → redeploy → verify score pills + drawer light up live. VPS currently runs only a "Hermes" agent (idle). `render.yaml` is a fallback host. Arijit offered SSH so Claude can do it end-to-end. Ask: VPS OS + domain-or-tunnel.
2. **Rework the judge → 3-dimension composite.** D1 grounding · D2 answer confidence · D3 answer breadth+depth. Each of the 3 judges gives a composite across the 3; final = AVERAGE of the 3 judges. Grounding becomes a weighted dimension (confirm with Arijit whether it stays a hard floor too). Touch `lab/judge/{rubric,synthesis,types,prompt}.ts`, `lab/server/src/{liveJudge,judgeStep}.ts`, UI `web/src/lib/analysis.ts` + `AnalysisDrawer.tsx` (extend per-judge rows → per-dimension). Keep zero-flicker + reliability SOP. See [[project-judging-multidimensional]].
3. **Real test corpus:** Arijit is sourcing the **last 12 months of algolia.com queries** → build a test set from them + run through the judge+autocorrect loop. See [[project-poc-and-prod-direction]].

### WHY now (stakes) — [[project-poc-and-prod-direction]]
POC with **Adobe + Contentstack** (live customers soon); production target = **Algolia.com itself** (very significant). Build production-grade, multi-tenant-aware, real-query-driven.

### What SHIPPED this session (all committed + pushed; origin/main `e4759d3`)
- **D2 — analysis drawer + lane score pills + verdict chip** (commit in `74e8c6c`). `AnalysisPanel`→`AnalysisDrawer` (right slide-out, role=dialog, Esc/focus-trap/restore). `lib/score.ts` (scoreTone + gate-aware laneTone). `AnalysisData.laneScores` (both ②+③). Header verdict chip. Dropped the bottom-40% split → full-height rail.
- **D4 — persistent composer + follow-up + multi-turn** (`74e8c6c`). `QueryBar`→`Composer` (centered hero → docked). `lib/followup.ts` (conservative `detectFollowUp`) + `FollowUpCallout`. Engine was already wired — pure surfacing. Multi-turn verified live.
- **① browser-direct** (`5b1659e`) — the big fix. algolia.com search = Algolia Autocomplete on incumbent app `1QDAWL72TQ`/`ALGOLIA_WWW_PROD_V2` over the public CORS-safe search API. New `lib/incumbentSearch.ts` (reuses `keywordSearch.ts` + `removeWordsIfNoResults:allOptional` to mirror the site). Removed `websiteClient.ts`. **VERIFIED on the live Vercel URL** — ① returns ranked hits, no backend.
- **Judge backend deployable** (`e4759d3`) — `webserver.ts` binds `$PORT` + lazy-imports Playwright (judge-only boot); `render.yaml` blueprint.
- **Fixes from review + sample-testing:** monotonic submission seq in `useComparison` (stale-score-after-Reset bug); `useLiveJudge` clears to idle on Reset; relative→absolute citation URLs (`sourceUrl`).
- **Verified retrieval finding** `docs/experiment/finding-localized-duplicate-retrieval.md` (corrected an earlier wrong hypothesis — localized dupes are corpus-wide, not tuned-specific).
- Quality gates: internal code-review (0 Critical), ui-validator (0 FAIL/1 WARN — vault SOP unreadable here, validated vs checklist), **86 web tests green**, tsc clean. 9 browser proofs in `docs/workspace/lab-ux-redesign/proof-0*.png`.

### Live infra state
- Vercel `algolia-contentsearch.vercel.app` — latest deploy Ready; ①+②+③ work, follow-ups work. **Judges DON'T work on the deploy yet** (no backend → silent: chip shows "Analysis", no score pills). That's the next task (VPS).
- `VITE_INCUMBENT_APP_ID`/`SEARCH_KEY`/`INDEX` confirmed set in Vercel prod (so ① works deployed).
- Local: judge backend `cd lab/server && npx tsx src/webserver.ts` (:8787); web `cd web && npm run dev` (:5173/5175). Throwaway probes in `/tmp/*.mjs` (verify_retrieval, probe_incumbent, probe_allopt) — not committed, fine to delete.

### NOT done (no false completion)
- Judges NOT working on the Vercel deploy (need the VPS backend + `VITE_LAB_API_URL`).
- Judge multi-dimensional rework NOT started.
- 12-month query test set not yet obtained/built.
- ui-validator NOT run against the live vault SOP (Google-Drive mount `EPERM` in this env).
- Pre-existing: ① weblist titles still show raw HTML entities (`&rsquo;`/`&mdash;`) — minor decode fix deferred.

---

## ▶ RESUME (2026-06-17 ~11:20am) — superseded by the 2026-06-17 ~2:15pm block above

**This session: (1) committed the big 2026-06-14 batch as clean logical commits + set a gitignore policy for eval run outputs; (2) ran UX research and locked ADR-001 (Answer-Quality Lab redesign); (3) started building the redesign — D3 + D1 done.**

### ⏳ FIRST ACTION ON RESUME: continue the **Lab UX redesign**
- **Read `docs/workspace/lab-ux-redesign/_status.md` → "▶ RESUME (next session)"** — it is the complete, self-contained resume. Decisions live in `docs/design/adr-001-lab-ux-redesign.md`.
- **State:** `main` HEAD `dbb98fa`. Committed & green (tsc + 58 web tests): D3 grouped source pills (`b3b5bff`), D1 lane rail (`dbb98fa`), ADR-001 (`45a1eb6`), plus the 2026-06-14 batch (`bd152c9`/`55e3eda`/`a87fd1e`). **Nothing pushed — push to `main` needs Arijit's explicit OK.**
- **Remaining:** D2 (analysis drawer + lane score pills) → D4 (composer + follow-up callout + multi-turn surface) → consolidated browser proof → `ui-validator`. The multi-turn engine is ALREADY wired (ADR read-receipt) — D4 is pure UI surfacing.
- **gitignore policy (new):** `lab/server/output/` is now ignored; cited eval runs are force-added. Don't un-ignore.

### Background processes
Backend `:8787` + vite `:5175` may still be running. `lsof -ti:8787 | xargs kill ; lsof -ti:5175 | xargs kill` if unused; the live judge + ① panel + the browser proof need :8787 up.

---

## ▶ RESUME (2026-06-14 ~12:25pm) — superseded by the 2026-06-17 block above

**This session: made the lab UI actually work (live judge + ① website wired), made the autocorrect loop fast + robust, recorded a reliability SOP, and built the Sample Questions panel. Big batch is BUILT + VERIFIED but UNCOMMITTED.**

### ⏳ FIRST ACTIONS ON RESUME (in order)
1. **Decide: commit the batch.** Everything below is verified (tsc clean; tests green; browser-proven) but NOT committed. On `main`, HEAD `94a1f8a` (pushed). Suggested logical commits: (a) `feat(web): live judge in UI + ① website panel wired + sample-questions panel`; (b) `perf/fix(lab): parallelize judge+run-tests, gemini retry hardening, propose guard, floor-cache tests`; (c) `docs: LLM-harness-reliability SOP + typo-tolerance finding`. Push to `main` needs Arijit's explicit OK (auto-mode blocks direct-to-main; he authorized it before per-push).
2. **Background processes still running** (from this session): backend `webserver.ts` on **:8787** (pid was 12396) + **vite on :5175**. Kill if not needed: `lsof -ti:8787 | xargs kill ; lsof -ti:5175 | xargs kill`. The live judge + ① panel need :8787 up to work locally.
3. **Re-read** memory `feedback-llm-harness-reliability` + `docs/sop/llm-harness-reliability.md` before touching harness code.

### What this session SHIPPED (all tsc-clean, tests green, browser-proven)
**A. Live judge in the UI (was mock).** `POST /api/judge` in `lab/server/src/webserver.ts` judges the displayed ②/③ answers on Gemini and returns per-judge scores+notes+synth+gate. New `lab/server/src/liveJudge.ts` (pure mappers + injected scorer) + `activeJudgeLlm.ts` (extracted provider resolution; `judgeStep` now uses it too). Web: `lib/judgeClient.ts`, `lib/analysis.ts`, `hooks/useLiveJudge.ts`, `useAgentColumn` emits `AgentResult` on done/error, `AnalysisPanel` states idle/streaming/judging/done/error. PROVEN end-to-end in browser (grounded answer 5.9 / fabricated 0.70 GATED; live ②-vs-③ margin). Screenshot `docs/workspace/live-judge-ui/live-judged-proof.png`.
**B. Idle mock removed.** `AnalysisPanel` idle now shows a call-to-action; deleted `MOCK_ANALYSIS` + `isMock` entirely (Arijit flagged fake scores on launch).
**C. ① Website panel WIRED (was placeholder).** `WebsiteColumn` now calls `POST /api/website` (backend Playwright capture of live algolia.com) → renders top result hits + links. `lib/websiteClient.ts` + `hooks/useWebsiteColumn.ts`. PROVEN: "vector search" → 8 real algolia.com results. Screenshot `…/website-panel-wired-proof.png`.
**D. Sample Questions panel (Arijit's Approach A).** Collapsed pill "✦ Sample questions · 27 · ⌄" → expands to a 4×2 grid of 8 color-coded category cards (all 27 locked Qs). Overlay dropdown (~⅓ viewport, doesn't push panels). Click → fills bar + collapses. `config/sampleQuestions.ts` (data), `components/SampleQuestions.tsx`, wired in `QueryBar` (replaced the old 4-chip TRY strip). Screenshot `…/sample-questions-expanded-proof.png`.
**E. Autocorrect loop: FAST + ROBUST.** Parallelized judge + run-tests via `lab/server/src/concurrency.ts` `mapWithConcurrency` (order-preserving; `RUN_CONCURRENCY` default 4) — round 0 ~2h → ~15-20min. Floor cache (`applyFloorCache` + `runTests({panelIds})`) — rounds 1+ judge only ③. Gemini retry hardened: now retries {429,500,502,503,504} + thrown network errors, injectable `backoffBaseMs` (`gemini.ts`). Proposer guarded (try/catch → return incumbent) + `maxTokens` 4000→16000 (was crashing on thinking-model MAX_TOKENS empty). 
**F. Reliability SOP recorded.** `docs/sop/llm-harness-reliability.md` (9 standards S1–S9 + Pre-Run Checklist + Failure Catalog runbook). Memory `feedback-llm-harness-reliability`. Vault: `Projects/Algolia-Central2/wiki/{syntheses/llm-harness-reliability,dev-log}.md`.

### Autocorrect RUN VERDICT (final, clean run `/tmp/autocorrect_real4.log`)
Ran full 3 rounds clean (0 transient errors). **Round 0 baseline ③ dev=6.55. Rounds 1 & 2 both ROLLBACK (grounding-regressed). STOPPED max-rounds, best=baseline.** → **No improvement found; the hand-tuned `grounded_lead_v1` baseline wins.** Live ③ agent `b5c4de23` is back on the **baseline (7254 chars)** — known-good. Takeaway: for ③, "more depth" trades against grounding; the real lever is RETRIEVAL (see typo-tolerance finding), not prompt rewording.

### Known product bug (diagnosed, fix STAGED, NOT deployed)
③ false-refuses on answerable Qs (typo tolerance, vector search). Root cause PROVEN: verbose agent keyword reformulation × tuned index `removeWordsIfNoResults:allOptional` → over-broad retrieval (1000s of hits) → canonical doc buried → agent correctly refuses junk. Index is HEALTHY (direct search returns right docs). Fix staged: `scripts/setup/instructions_case3_reformulation_fix_v1.md` (tighter 2-4 keyword reformulation, re-search narrower not broader). NOT deployed (don't fight a run; deploy via `node scripts/setup/agent_admin.mjs update b5c4de23-769b-4b38-9051-a19add9dee06 <file>`). Full writeup: `docs/experiment/finding-typo-tolerance-false-refusal.md`.

### Verification (this session)
`cd lab/server && npx tsc --noEmit` clean; `../judge/node_modules/.bin/vitest run` → **18** (concurrency 4, floor-cache 3, liveJudge 7, gemini 4). `cd lab/judge && npx vitest run` → **64**. `cd lab/autocorrect && ../judge/node_modules/.bin/vitest run` → **22**. `cd web && ./node_modules/.bin/tsc -b && npm test` → **46** (+1 skipped). Browser proofs in `docs/workspace/live-judge-ui/*.png`.

### NOT done (no false completion)
- **Whole batch UNCOMMITTED** (see first action). 
- **S8 observability NOT built** — the SOP documents timestamps/heartbeat/final-summary for long runs, but the harness doesn't emit them yet (offered to build; Arijit hasn't said go).
- Typo-tolerance reformulation fix STAGED, not deployed.
- ③ still loses to ② on retrieval-miss queries — not solved (needs the retrieval fix, maybe index `allOptional`→`lastWords`).
- `lab/server/output/{scores,transcripts}/` has many untracked run artifacts — NOT needed; don't commit.
- `EXAMPLE_QUERIES` in `web/src/config/columns.ts` now unused (harmless, still exported).

### Key IDs / paths (carry-over)
- Agents (app `VVKSSPDMJX`): ② mirror `02852440-8f57-4383-98bc-bffa5b357516`; ③ tuned `b5c4de23-769b-4b38-9051-a19add9dee06` (live = baseline `grounded_lead_v1`).
- Local backend: `cd lab/server && npx tsx src/webserver.ts` (:8787; live judge + ① capture). Web: `cd web && npm run dev`.
- Autocorrect: `cd lab/server && JUDGE_ROUNDS=3 RUN_CONCURRENCY=4 ./node_modules/.bin/tsx src/cli.ts autocorrect --rounds 3`. Smoke: add `--smoke --ids 1.2`.
- GitHub: github.com/arijitchowdhury80/algolia-contentsearch @ `94a1f8a` (batch unpushed).

---

_(historical — superseded by the 2026-06-14 block above)_

## ▶ RESUME (2026-06-13 ~10:40pm) — (history)

**This session built + packaged the reusable Eval-Loop product (AI Judge + Autocorrect) and corrected the verdict. All committed + pushed (`448e434`). Memory: [[project-eval-loop-product]], [[feedback-zero-flicker-judge]].**

### ⏳ FIRST ACTION ON RESUME — check the live optimization run
A REAL autocorrect run was launched and was **STILL RUNNING at persist** (pid 68620, mid round-0). Log: `/tmp/autocorrect_real.log`. Config: baseline=`grounded_lead_v1`, `--rounds 3`, `JUDGE_ROUNDS=3`, `minImprovement=0.3`, full dev(18)+held-out(9).
1. `tail -50 /tmp/autocorrect_real.log` → look for `=== REAL RUN DONE` + `STOPPED: <reason>` + `best config id` + per-round KEEP/ROLLBACK lines.
2. If it produced a winning mutation, the live tuned agent `b5c4de23` is already on it; read the best prompt and decide whether to keep it.
3. If it crashed/hung: re-run `cd lab/server && JUDGE_ROUNDS=3 ./node_modules/.bin/tsx src/cli.ts autocorrect --rounds 3`.

### What this session shipped (3 phases, TDD throughout, all committed + pushed)
**Phase 0 — Judge ZERO-flicker (commit `35efbf3`).** The grounding gate flickered (same answer scored 3 or 8, ±5 swing) → keep/rollback untrustworthy. Root cause: (a) gate counted heterogeneous per-round trips, (b) gating Skeptic ran temp 0.2. Fix: **claim-recurrence gate** (`lab/judge/src/claimGate.ts` — clusters violations across rounds by stemmed token-Jaccard, trips only when the SAME claim recurs in a supermajority) + **all judges temp 0** (`rubric.ts`). PROVEN: judged identical answers twice → **0/21 gate flips**. Honest residual: quality score wiggles ≤~0.3 (Gemini not bit-deterministic at temp 0) — never flips a gate, handled by `minImprovement`. 64 judge tests. dimensionMeans now persisted (`synthesis.ts`/`judgeStep.ts`/`store.ts`).
**Phase 1 — Autocorrect loop (commits `c741e0a`,`57a21f6`,`e1ef6e1`,`9469053`).** Portable orchestrator `runAutocorrect` (`lab/autocorrect/src/orchestrator.ts`) drives the pre-existing pure decision core via 3 injected seams (`deploy`/`evaluate`/`propose`). Algolia adapters in `lab/server/src/autocorrectAdapters.ts` (deploy via agent_admin.mjs; evaluate via runTests+judgeRun; propose via LLM grounded in judge rationales). CLI: `tsx src/cli.ts autocorrect [--baseline f] [--rounds N] [--smoke] [--ids/--limit]`. Ran live end-to-end (smoke): correctly rolled back a non-improvement, handled empty held-out (bug found+fixed `9469053`), clean stop. 23 autocorrect tests.
**Phase 2 — Eval-Loop plugin (commit `448e434`).** Repo `eval-loop/`: `.claude-plugin/plugin.json`, `skills/ai-judge`, `skills/autocorrect-loop`, bundled `packages/` (via `sync-packages.sh`), README. Skills validated by a fresh subagent with NO source access (it wired both APIs correctly from skill text alone; gaps found were closed). **INSTALLED GLOBALLY:** `~/.claude/skills/{ai-judge,autocorrect-loop}/` + `~/.claude/eval-loop/packages/` → usable in EVERY project. ⚠ global copies are the INSTALLED instance, NOT in git; canonical = repo `eval-loop/`.

### Verdict CORRECTED (important — don't cite the old number)
Fair re-test (② fixed, fresh, N=5, zero-flicker judge, dev split `20260613T004122Z`): **① 3.82 · ② 4.42 (gated 14/18) · ③ 5.15 (gated 12/18)** — ③ beats ② by only **+0.73**, both gate ~70%. The stale "③ 7.44 vs ② 4.59 / +2.85" does NOT survive (it was v1/N=3/gpt-5.2-cached/②-broken). "110% grounded" NOT met. Diagnosis: `docs/experiment/gated-question-diagnosis.md` (③ gates are real — un-sourced opening definition; root-caused to the prompt's "direct answer first" rule). Mutation #1 `grounded_lead_v1` (deployed to `b5c4de23`) validated as a KEEP on targeted Qs. Full log: `docs/experiment/autocorrect-run-log.md`.

### Verification (this session)
`cd lab/judge && npx vitest run` → **64 pass**, tsc clean. `cd lab/autocorrect && ../judge/node_modules/.bin/vitest run` → **23 pass**, tsc clean. `cd lab/server && npx tsc --noEmit` → clean. Zero-flicker proof: `/tmp/judge_stability.log` (Phase 0 N=5 ×2) + `/tmp/flicker_proof.log` (0/21 flips). Smoke: `/tmp/autocorrect_smoke2.log` (clean stop).

### NOT done (no false completion)
- The REAL optimization run had NOT completed at persist — **check it first** (above).
- No FULL optimization yet (more rounds / larger budget). The loop's `evaluate` re-runs the FIXED ② floor every round = ~2× cost; optimize (cache the floor) before long runs.
- OpenAI quota still dead → all on Gemini ([[project-gemini-switch]]). Provider flip-back enforcer still not built.
- `eval-loop/` skills are global but live OUTSIDE git (the repo copy is canonical; re-copy to update).
- UI judge panel still mock; ① WebsiteColumn still not wired (pre-existing, untouched this session).
- `lab/server/output/{scores,transcripts}/` has many new untracked files (not committed; not needed for resume).

### Key IDs / paths (carry-over)
- Agents (app `VVKSSPDMJX`): ② mirror `02852440-8f57-4383-98bc-bffa5b357516`; ③ tuned `b5c4de23-769b-4b38-9051-a19add9dee06` (live = `grounded_lead_v1`). Re-instruct: `node scripts/setup/agent_admin.mjs update <id> <file>`.
- Case-3 prompts: live `scripts/setup/instructions_case3_grounded_lead_v1.md`; rollback `scripts/setup/rollback_case3_v0_live.md`.
- GitHub: github.com/arijitchowdhury80/algolia-contentsearch @ `448e434`.

---

_(historical blocks below — superseded by the 2026-06-13 block above)_

_Last updated: 2026-06-12 ~7pm EDT (handoff)_

## ▶▶▶ HANDOFF RESUME (2026-06-12 ~7pm)

**This session shipped the project to GitHub + Vercel, then did local debugging. Single source of truth = this session (the parallel lane was stopped by Arijit earlier — see ~1pm block + [[feedback-multi-session-coordination]]).**

### Live infrastructure now
- **GitHub:** https://github.com/arijitchowdhury80/algolia-contentsearch (PUBLIC, branch `main`, 3 commits: initial / README / vercel-fix). ⚠ This session's later work is **UNCOMMITTED** (see "Uncommitted" below).
- **Vercel:** https://algolia-contentsearch.vercel.app — LIVE + public, serves the `web/` app. Root `vercel.json` makes git-push auto-deploys build `web/` correctly (a push from the repo root previously 404'd; fixed). Env vars (`VITE_*`, search-only) set in production+development. Vercel CLI authed as `arijitchowdhury-5926`; redeploy via `cd web && npx vercel --prod`. ⚠ Playwright/judge backends CANNOT run on Vercel serverless — only ②/③ agents answer live in the deployed UI (~20s each, Gemini).

### What this turn built/changed (all tsc-clean; NOT committed)
1. **LLM PROVIDER STAGING (Arijit directive):** prefer OpenAI, fall back to Gemini ONLY on limits, and **fully consistent — judge + ALL agents same provider, no mixing**. Built: `lab/server/src/provider.ts` (`resolveActiveProvider`: probes OpenAI, uses it only if healthy, else Gemini; specs hold Agent Studio provider ids — OpenAI `ae943683…`/gpt-5.2, Gemini `730780db…`/gemini-2.5-pro). Judge auto-reads it (`judgeStep.ts`). New CLI: **`npx tsx src/cli.ts provider`** → resolves + READS every agent's model + reports ✓CONSISTENT / ✗MISMATCH. Verified: OpenAI quota-dead → **system on GEMINI**, both agents Gemini → ✓ consistent. Policy memory: [[feedback-llm-provider-policy]].
   - **NOT done:** the auto-PATCH ENFORCER that re-points agents when the provider flips. Switching an agent's provider is an Agent Studio config write whose exact field I didn't confirm (would need a full agent dump) and can't test the OpenAI-direction while OpenAI is dead. TODAY consistency holds (all Gemini); when OpenAI billing returns, the resolver flips the JUDGE to OpenAI and `provider` will flag agents as ✗MISMATCH until re-pointed → inconsistency blocked by DETECTION, not yet auto-fixed.
2. **② Ask AI FIXED (was "broken"):** it had started refusing/giving up. Root cause (diagnosed, not guessed): the agent model was switched gpt-5.2→gemini-2.5-pro (other lane), and **gemini under-reformulates the keyword query on the STRICT untuned index** → full sentence "set up faceted search…" returns **0 hits** (but keyword "faceted search" → 24 hits; content IS there). ③ is immune because the tuned index (`optionalWords:allOptional`) returns 2022 hits even for a full sentence — so part of ③'s win is "the tuned index forgives sloppy queries." FIX: strengthened the keyword-reformulation + mandatory-retry instruction in `scripts/setup/instructions_case2_askai_default.md`, redeployed to mirror agent `02852440`. **Verified ② now answers.** ⚠ **THE VERDICT IS NOW STALE** — ② was broken when measured (old ② mean 4.59); must re-run the judge for fair numbers.
3. **① on-demand backend capture BUILT:** `lab/server/src/webserver.ts` (native node http, `POST /api/website {query}` → Playwright capture → `{answer,sources}`, CORS). Verified working (8 live algolia.com results). Run: `CAPTURE_PORT=8787 npx tsx src/webserver.ts`. **⚠ Still RUNNING in background on :8787 from this session — may need killing.** **NOT done: UI wiring** — `web/src/components/WebsiteColumn.tsx` is still the placeholder; it does NOT call the endpoint yet. Local-only (Playwright won't run on Vercel).
4. **Judge panel mock — explained, not a bug:** the judges WORK (backend, produced the real verdict). The UI "Analysis & Synthesis" panel is mock because it was never wired to the backend. Same gap as ①. The capture API (`webserver.ts`) is the seed of the "lab backend" that should also serve live judging to the UI.

### ▶ NEXT (pick up here — Arijit was offered these, no choice made yet)
(a) Build the **lab backend** so the **judge panel + ①** go live in the UI (extend `webserver.ts` with a `/api/judge` that runs panels+judge for a typed query). (b) **Re-run the verdict** now that ② is fixed (`run-tests` + `judge` — judge auto-uses Gemini via the resolver). (c) Build the **agent auto-sync enforcer** (provider flip). (d) **Commit/push** today's uncommitted work. (e) Wire `WebsiteColumn` → the capture API. (f) Validate judge σ on Gemini; failure-class diagnosis of gated Qs.

### Uncommitted at handoff (git status)
Modified: `lab/server/src/{cli,config,judgeStep}.ts`, `scripts/setup/instructions_case2_askai_default.md`, `web/.gitignore`. New untracked (mine): `lab/server/src/provider.ts`, `lab/server/src/webserver.ts`. New untracked (other lane, leave alone): `scripts/setup/instructions_case3_{grounded_v1,live_snapshot}.md`. Nothing pushed since commit `35e4da3`.

### Sanity checks (verified this session)
`cd lab/judge && npx vitest run` (50) · `cd lab/autocorrect && ../judge/node_modules/.bin/vitest run` (16) · `cd lab/server && npx tsc --noEmit` (clean) · `cd web && ./node_modules/.bin/tsc -b && npm test` (27) · `cd lab/server && npx tsx src/cli.ts provider` (→ GEMINI, consistent).

---

_Last updated: 2026-06-12 ~1pm EDT (persist)_

## ▶▶ UNIFIED RESUME (2026-06-12 ~1pm) — (history; superseded by HANDOFF block above)

**Context:** TWO Claude sessions ran in parallel today and collided; Arijit STOPPED the other lane (~12:30pm) and told this lane to "continue your plan as is." This session is now the SINGLE source of truth. The other lane's work (Gemini agent switch, v2 question set, Atlas+two-way plan) is recorded in memory `project-gemini-switch.md` / `project-atlas-and-twoway.md` and the older "▶ RESUME (~12:15pm)" block below — reconcile, don't assume.

### 🎯 FIRST REAL VERDICT IS IN (the thing we were chasing)
Ran the full **dev-set judge** on transcript `20260612T140037Z` (16 v1-dev Qs × 3 panels), **judge = gemini-2.5-pro, N=3**. Scores: `lab/server/output/scores/20260612T140037Z.json`. Summary:
- **Means: ① Website 3.16 · ② Ask AI 4.59 · ③ Our System 7.44.** ③ beats ② by **+2.85** overall.
- **BUT the win is a GROUNDING story, not a prose story:**
  - On the 4 Qs where NEITHER gated (1.2,1.3,2.1,7.2): ② mean **9.83** vs ③ **9.75** — ② is *fractionally ahead*. Our optimized prompt does NOT beat Ask-AI-default on prose when both stay grounded.
  - ③ wins because ② (default prompt) trips the grounding gate on **12/16** (leaks training data, e.g. 7.1 "Paris"). ③ gates **5/16**, ① gates 4/16.
  - 🚩 **③ ("110% grounded") STILL gates 5/16** (Qs 2.2, 3.2, 4b, 6.3, 8.1 — on these BOTH ② and ③ fail). Contradicts our core promise → top thing to diagnose.
- **⚠ Trust caveats (critical):** (1) judge stability was proven on gpt-5.2, **NOT re-validated on gemini-2.5-pro** — the gate (which drives the whole verdict) could be over-firing; (2) these answers were captured when agents ran **gpt-5.2** (before the agent→Gemini switch), so it's the gpt-5.2-era comparison; (3) N=3 (coarser gate vote than report-grade N=5); (4) this is the **v1 16-Q** set — the locked set is now **v2 27-Q** (other lane), so it must be re-run on v2 for a comparable official number.

### NEXT ACTION (what I offered Arijit, pending his yes — the immediate gate)
**Diagnose the gated questions** — for the 5 ③-failures + 5 both-fail Qs, read each answer + its retrieved hits + the judge rationale and classify: (a) genuine leakage by ③, (b) retrieval gap (tuned index returned no/poor hits → agent answered instead of refusing), or (c) the **Gemini judge over-gating**. This IS the "failure-class diagnosis → Atlas verdict" gate the other lane also flagged. **Blocker for trusting any number: first re-validate judge σ on gemini-2.5-pro** (re-run the stability check on Gemini before believing the gate counts). No new code needed to diagnose — it's reading transcript+scores.

### Resume steps (in order)
1. Read this block + memory `project-answer-quality-lab.md`, `project-gemini-switch.md`, `project-atlas-and-twoway.md`.
2. Sanity: `cd lab/judge && npx vitest run` (**50 pass**); `cd lab/autocorrect && ../judge/node_modules/.bin/vitest run` (**16 pass**); `cd lab/server && npx tsc --noEmit` (clean); `cd web && ./node_modules/.bin/tsc -b && npm test` (27 pass).
3. **Validate judge σ on Gemini** (was only proven on gpt-5.2): re-judge a couple fixed answers twice, confirm low cross-run Δ. If unstable, the verdict's gate counts are suspect → fix before trusting.
4. **Failure-class diagnosis** of the gated Qs (see NEXT ACTION). Produce the verdict on whether ③'s grounding holes are real / retrieval / judge-artifact.
5. THEN decide: re-run the comparison on v2 27-Q + current Gemini agents for an official number; and/or build the WS-G orchestrator (decision core already built+tested).

### What this session BUILT/CHANGED (all verified unless noted)
- **Judge stability hardened** (proven on gpt-5.2, Δ=0.15 vs ±3-5): `lab/judge/src/synthesis.ts` `aggregateRounds` — averages stable PRE-gate score + **supermajority (≥2/3) gate vote**, ambiguous 1/3..2/3 = `borderline` (not capped). Root cause was gate-flicker, NOT temperature (gpt-5.2 honors temp; the openai.ts comment was wrong). Default N=5 (JUDGE_ROUNDS env). See memory `feedback-grounding-supermajority-vote`.
- **Judge resilience** (`lab/judge/src/judge.ts`): retry a judge call up to 2× on unparseable JSON (gemini emits stray-token glitches); `lab/server/src/judgeStep.ts` isolates per-panel failures so one bad answer never crashes a run. Judge tests **50 pass**.
- **JUDGE switched to Gemini** (`lab/server/src/gemini.ts` adapter w/ 429/5xx retry; `config.ts` `JUDGE_PROVIDER` default=gemini, model `gemini-2.5-pro`; `judgeStep.ts` picks provider). Minimax token = dead (1004 login fail). `OPENAI_API_KEY` = quota-exhausted (429). Rollback: `JUDGE_PROVIDER=openai`.
- **Live website capture WIRED into the harness** (`lab/server/src/website.ts` + `capture.d.ts`; cli registers it for run-tests/pipeline; `WEBSITE_STUB=1` to stub). Adapter maps capture.mjs results→{answer,sources}. Verified: 8 real algolia.com results/q.
- **WS-G autocorrect DECISION CORE built+tested** (`lab/autocorrect/` NEW pkg, **16 tests** via judge's vitest binary): pure `splitMargin/decideKeep/isWin/shouldStop/diagnoseWeakest` + `summarizeSplit` adapter. Optimizes stable `meanScore`; grounding=hard constraint; held-out overfit guard; patience/maxRounds/win stop. Orchestrator NOT built.
- **UI honesty fixed** (`web/src/config/columns.ts`): ② no longer mislabeled "placeholder/Wave 2" (it's the real Ask-AI-default agent); ① relabeled backend-captured.
- **③ prompt formatting fixed + DEPLOYED**: `scripts/setup/instructions_case3_optimized_v0.md` line ~34 → clean anchor-text citations (no raw inline URLs). **This is live on the tuned agent b5c4de23** (model now gemini-2.5-pro per other lane). NOTE: other lane wanted Case-3 frozen at `instructions_case3_v0_baseline.md` for baseline — moot now (other lane stopped), but the LIVE Case-3 = optimized prompt.
- **Methodology doc** `docs/experiment/ai-judge-methodology.md` §7 (stability) + §11 updated.
- **Removed** temp probes (probe_stability/probe_compare/probe_providers).

### NOT done (no false completion)
- **dimensionMeans NOT persisted** in PanelScore → `diagnoseWeakest` can't run on real scores yet (needs a judge run that records per-dimension means; currently only per-judge weightedScore is stored).
- Judge σ NOT re-validated on Gemini. WS-G orchestrator NOT built (loop can't run end-to-end). UI judge-score wiring NOT done (Analysis panel still MOCK). Live support Ask AI north-star NOT captured. Failure-class diagnosis NOT done (offered, pending Arijit's yes). Verdict is v1/16-Q/gpt-5.2-era — NOT yet re-run on v2/27-Q/Gemini-agents.

---

## Status — MAJOR PIVOT (2026-06-12): 3-panel lab + two reusable skills
**Plan: `~/.claude/plans/i-think-the-whole-cheeky-moler.md` (APPROVED — read first).** The 4-column A/B was reframed by Arijit. Now:
- **3 panels** (not 4; Beta dropped — its OpenAI key 401s, out of our control): **① Current Website Search** (Playwright capture of live algolia.com), **② Ask AI** (faithful Ask-AI-default Agent Studio agent on our www mirror = the quality FLOOR; + live support Ask AI captured **manually by Arijit** as north-star), **③ Our System** (our optimized index + optimized two-way agent: grounded-synthesis AND 110%-strict, adaptive personality).
- **Two reusable skills extracted**, run in a closed loop: **AI Judge** (3 blind judges Skeptic/Referee/Advocate + Chief Synthesizer, grounding hard-gate) ⇄ **Autocorrect** (Karpathy AutoResearch loop: judge→diagnose→mutate Case 3 config→re-test→keep-if-better; held-out split; stop when ③ beats ② by ~+1.0/10 sustained, zero grounding violations, OR budget). Methodology docs → future skills.
- **UX**: 60/40 — top 60% = 3 panels, bottom 40% = analysis/synthesis + config-diff.
- **Win target**: ③ measurably beats ② (Ask AI) on the locked set. Deliverable: Algolia-branded run report + recommendations for improving algolia.com answers via the Visibility app.

**Execution = big-bang parallel (multi-agent).** WAVE 1 DONE & verified (2026-06-12): WS-A webapp restructured to 3-panel 60/40 (`web/`, tsc+27 tests green), WS-F AI Judge module (`lab/judge/`, tsc+31 tests green), WS-H question set drafted. **Questions LOCKED v1**: `docs/experiment/test-questions-locked.md` (24 = 3/category, 16 dev / 8 held-out; cat 4 has BOTH high-fashion-luxury + fashion-ecommerce). WAVE 2 IN PROGRESS: WS-C Playwright capture + WS-B backend test-runner/judge harness (running as background agents). **Arijit-owned (Claude, by hand, next): WS-D Case-2 Ask-AI-default agent + WS-E Case-3 optimized agent+index (Algolia mutations + core IP), then WS-G autocorrect loop + WS-I run report.**

### Tracking + Wave-2 progress (2026-06-12 cont.)
Task list (TaskCreate) tracks WS-A…I. **DONE & verified:** WS-A, WS-F (AI Judge), WS-H (locked Qs), WS-C (Playwright website capture), WS-B (backend harness: run-tests→judge→summary, `lab/server/`), WS-D capture (live Ask AI Playwright `lab/capture/askai-capture.mjs` — works, full-24 ≈10-15min, NOT yet run for the north-star), WS-E partial (Case 2/3 agents DEPLOYED, index optimized).
- **Agents deployed (reused existing IDs, just re-instructed):** mirror `02852440…` → **Case 2 Ask-AI-default** (`scripts/setup/instructions_case2_askai_default.md`, on ALGOLIA_WWW_PROD_V2 mirror); tuned `b5c4de23…` → **Case 3 optimized v0** (`scripts/setup/instructions_case3_optimized_v0.md`, on visibility_www_tuned). `agent_admin.mjs update` does PATCH+publish.
- **Index optimized (v0):** `scripts/setup/optimize_index.mjs` applied to `visibility_www_tuned` — removeStopWords/ignorePlurals/queryLanguages=en, removeWordsIfNoResults=allOptional, +7 domain synonym groups. NL queries now retrieve (was 0 on strict).
- **Judge fixes landed:** (1) label↔id resolver (strong models echo labels) — `lab/judge/src/parse.ts`; (2) **refusal-aware** policy "refusal wins decisively" (Arijit) — `expectedBehavior:'refuse'` on cat-7 artifacts → correct refusal scores HIGH, substantive OOS answer = grounding fail. `lab/judge/src/{types,prompt}.ts` + harness `judgeStep.ts`. 38 judge tests pass.
- **Smoke baseline (4 Qs: 1.2,3.1,4a,7.1) findings:** refusal fix verified (7.1: Case3 refusal=9.37, Case2 "Paris" leak=2.25 gated). Judge was NOISY (±3-5 swing). **→ JUDGE-STABILITY GATE NOW DONE (2026-06-12 9:48am).**
- **JUDGE STABILITY HARDENED & VERIFIED (2026-06-12):** Root-caused via 5-round probe (NOT assumed): (1) gpt-5.2 *honors* temperature+seed (HTTP 200) — the openai.ts "rejects temperature" comment was WRONG; pre-gate score was already stable (σ≈0.03-0.2). (2) **100% of the ±3-5 noise was the binary hard-gate flickering** on borderline answers (skeptic confidence wobbles around the 0.7 line → cap fires/doesn't). Fix = **`aggregateRounds`** (lab/judge/src/synthesis.ts): average the stable **pre-gate** score (the loop's quality metric) + decide the gate by a **supermajority vote (≥2/3 of rounds)**; ambiguous middle (1/3..2/3) = **`borderline`** flag, NOT capped (Arijit's chosen policy — "supermajority + flag"). Default **N=5 rounds** (JUDGE_ROUNDS env; 3 ok for quality-only). GROUNDING_NOTE tightened (no longer excuses empty/incomplete answers). **Proven:** 2 independent 5-round passes → worst cross-run Δ=**0.15** (was ±3-5). Paris-leak gates 100% stably; correct refusal stays ~8.8 (borderline, not capped); clean answers Δ~0.01. Judge **49 tests green**, judge+server+web tsc clean. New persisted fields: rounds/meanPreGateScore/stdDevPreGateScore/gateTripFraction/borderline.
- **Pending:** ~~judge-stability hardening~~ DONE → **WS-G (autocorrect loop — NOW UNBLOCKED, stable metric ready)** → WS-I (report). Run live Ask-AI `--all` for north-star (anytime). Smoke transcript/scores: `lab/server/output/{transcripts,scores}/20260612T062806Z.json`.

### Wave-1 artifacts
- `docs/experiment/test-questions-{draft,locked}.md`; `docs/experiment/ai-judge-methodology.md`.
- `lab/judge/` (AI Judge module + tests). `web/` restructured to 3 panels (config/columns.ts now website|mirror|tuned; AnalysisPanel.tsx added with mock data; KeywordColumn/useKeywordColumn removed; keywordSearch.ts kept as diagnostic util).
- Manual TODO for Arijit: run the 24 locked questions on the LIVE support Ask AI (support.algolia.com) and paste answers (north-star capture).

### Progress 2026-06-12 ~10:30am (post judge-stability)
- **OpenAI quota EXHAUSTED (429 insufficient_quota)** on `OPENAI_API_KEY` → judge + autocorrect loop cannot RUN until billing topped up / key swapped. run-tests (agents+website) is unaffected.
- **Dev-set transcript refreshed:** `run-tests --split dev` ran all 16 dev Qs through live website capture + current Case-2/Case-3 agents → transcript `20260612T140037Z` (judge step failed on the 429, so NO scores). Cleared the stale-agent caveat for dev.
- **Live website capture WIRED (Case ①):** `lab/server/src/website.ts` adapter (capture.mjs results→{answer,sources}) + `capture.d.ts` + cli registers it for run-tests/pipeline (WEBSITE_STUB=1 to stub). Verified: real algolia.com results, 8 sources/q.
- **UI honesty fixed:** `web/src/config/columns.ts` — ② no longer "placeholder/Wave 2" (it IS the real Ask-AI-default agent now); ① wording = backend-captured. web 27 tests green.
- **③ formatting fixed:** `instructions_case3_optimized_v0.md` line ~34 → clean anchor-text citations (no raw inline URLs). Redeployed to tuned agent b5c4de23 (published, 5897 chars).
- **WS-G decision core BUILT + TESTED (offline):** new package `lab/autocorrect/` — pure decision functions `splitMargin/decideKeep/isWin/shouldStop/diagnoseWeakest` (keep-if-better, grounding=hard constraint, held-out overfit guard, patience/maxRounds/win stop). **13 tests pass** (run via judge's vitest binary: `cd lab/autocorrect && ../judge/node_modules/.bin/vitest run`); src tsc clean. Optimizes the stable `meanScore` (=judge meanPreGateScore); grounding is a constraint (gatedCount===0).
- **STILL TODO for WS-G to RUN:** (a) ScoreSet→SplitMetrics adapter (pure, buildable now); (b) orchestrator wiring runTests→judge→diagnose→mutate(LLM proposer)→deploy→re-test→decideKeep/rollback→loop (needs OpenAI quota); (c) Autocorrect methodology doc → skill. Also TODO: wire real judge scores into the web UI (Analysis panel still MOCK; note live-query vs batch-score design wrinkle).

## ▶ RESUME HERE (2026-06-12 ~12:15pm EDT) — LATEST, do these first

**BIG CHANGES THIS SESSION (PM):** (a) **LLM provider switched to Gemini 2.5 Pro** — OpenAI quota was dead (429 insufficient_quota); tested added keys → Gemini works, Minimax token 401-dead. Both agents (`google_genai` provider `730780db-5c7f-4350-aef4-e9632af57aed`, model `gemini-2.5-pro`, verified) + the judge (`lab/server/src/gemini.ts`, default provider=gemini) now run Gemini. (b) Approved **Atlas + two-way plan** `~/.claude/plans/in-rc2-and-rc3-warm-scone.md`. (c) **Part D offline prep done.** Memory: `project-gemini-switch.md`, `project-atlas-and-twoway.md`.

1. **Check baseline run-tests** (background this session): `runId=20260612T161131Z`, 27 v2 Qs × 3 panels on Gemini, website stubbed → `lab/server/output/transcripts/20260612T161131Z.json`. If interrupted: `cd lab/server && WEBSITE_STUB=1 ./node_modules/.bin/tsx src/cli.ts run-tests`.
2. **DO NOT run the judge here** — a 2nd session owns it (was running a 16-Q judge). Consume its scores + Gemini stability σ (task #6). If that lane is gone: `JUDGE_ROUNDS=5 tsx src/cli.ts judge 20260612T161131Z`.
3. **NEXT GATE (this lane) → diagnose retrieval failure classes** straight from the run-tests transcript (each answer + its retrieved hits): citation/URL · entity disambiguation · authority misranking · zero/wrong-on-known-entity. → produces the **ATLAS VERDICT** (build Atlas/Rules only if a class recurs that tuning can't fix; see plan). No judge needed.
4. **Two-way deploy is PENDING the baseline:** live Case 3 runs the FROZEN `scripts/setup/instructions_case3_v0_baseline.md`; the deepened two-way version sits in `scripts/setup/instructions_case3_optimized_v0.md` (authored, undeployed). Capture baseline FIRST, then deploy as a measured mutation. Harness gap (task #5): turn-1 answer is discarded → blocks proper two-way measurement.
5. **Question set is now v2** (27 Qs, 18 dev/9 held-out; Cat 8 = 6). `docs/experiment/test-questions-locked.md`. Scores only comparable within v2.
6. Rollback to OpenAI if billing returns: `JUDGE_PROVIDER=openai` (judge) + PATCH agents back to provider `ae943683-905b-403c-b16f-c1525fc9b7a8` + `gpt-5.2`. Re-validate judge σ on whichever model (task #6 — stability was proven on gpt-5.2, NOT yet on Gemini).
7. **⚠ Coordination:** a 2nd session edits judge code + runs the judge — reconcile before assuming single source of truth. **⚠ Latency:** Gemini agents ~20-26s/answer (thinking) vs sub-second on gpt.

### (superseded) ▶ RESUME (2026-06-12 9:48am) — older block below
1. Read the Status + Wave-2 progress blocks above + `~/.claude/plans/i-think-the-whole-cheeky-moler.md` (approved plan). The OLD "## Resume action" further down is from the superseded 4-column build — ignore it.
2. Sanity-check: `cd web && ./node_modules/.bin/tsc -b && npm test` (27 pass); `cd lab/judge && npx vitest run` (**49 pass**); `cd lab/server && npx tsc --noEmit` (clean).
3. ~~harden judge stability~~ **DONE & verified (2026-06-12 9:48am)** — see the "JUDGE STABILITY HARDENED" bullet above. The judge metric is now stable (cross-run Δ=0.15); WS-G is unblocked. Methodology doc updated (`docs/experiment/ai-judge-methodology.md` §7).
4. **NEXT GATE → build WS-G (autocorrect loop)** per plan. The judge gives the stable fitness signal: use `judgeRun` (multi-round, N=5) → read `meanPreGateScore` (quality, the thing to MAXIMIZE) + `gateTripped`/`borderline` (grounding CONSTRAINT — must stay clean) per panel from the scores JSON. Loop: locked set → judge → diagnose Case-3 weakest dims from rationales → mutate Case-3 config (`scripts/setup/instructions_case3_optimized_v0.md` and/or `optimize_index.mjs`) → re-test → keep-if-better-on-pre-gate/rollback; 16 dev / 8 held-out; stop when ③ ≥ ② by ~+1.0/10 sustained 2 rounds, zero reproducible grounding violations, OR budget. Write Autocorrect methodology doc → future skill.
5. Build **WS-I** (Algolia run report). Run live Ask-AI north-star: `cd lab/capture && node askai-capture.mjs --all` (~10-15min).
6. Note: the smoke transcript `20260612T062806Z` panels are still the OLD mirror/tuned agents (pre Case2/Case3 re-instruction parity check). Before trusting loop numbers, run a FRESH `run-tests` so transcripts reflect the current Case2/Case3 agents.

### Key IDs / commands (carry-over)
- Case 2 (Ask-AI-default) = mirror agent `02852440-8f57-4383-98bc-bffa5b357516` on `ALGOLIA_WWW_PROD_V2`; Case 3 (optimized) = tuned agent `b5c4de23-769b-4b38-9051-a19add9dee06` on `visibility_www_tuned` (both on our app VVKSSPDMJX). Re-instruct: `node scripts/setup/agent_admin.mjs update <id> <file>`.
- Locked Qs: `docs/experiment/test-questions-locked.md` (24, v1). Prompts: `scripts/setup/instructions_case2_askai_default.md`, `instructions_case3_optimized_v0.md`. Index opt: `scripts/setup/optimize_index.mjs`. Methodology: `docs/experiment/ai-judge-methodology.md`.

### (Superseded) prior 4-column build — what was built (web/src/)

### Task 15/16 — what was built (web/src/)
- `config/columns.ts` — 4 ColumnConfig from VITE_* env (app/index/agent/pipeline/accent/proves). `EXAMPLE_QUERIES`.
- `hooks/`: `useComparison` (shared submission seq + clearSeq + transcript registry/export), `useKeywordColumn` (algoliasearch v5), `useAgentColumn` (callCompletions streaming, sources from hits, refusal heuristic, error-frame→error state).
- `components/`: AppHeader, QueryBar (hero+chips), ComparisonKey, ColumnGrid (responsive 4→2×2→1 + mobile tab switcher; all lanes stay mounted), ColumnHeader (App/Index/Engine/pipeline/proves + READ-ONLY badge + status pill), KeywordColumn, AgentColumn (autoscroll), ChatMessage (user/answer/refusal/error variants + streaming caret), SourceList, ResultHit, **Markdown** (dependency-free, recursion-fixed, XSS-safe; `Markdown.test.tsx` 10 tests).
- `styles/ab.css` — comparison grid + chat bubbles + lane states + responsive (tokens only, no hardcoded hex).
- `vite.config.ts` test include widened to `*.test.{ts,tsx}`. Removed scaffold `App.css`/`index.css`; `main.tsx` loads tokens+dashboard+ab.css. `vite-env.d.ts` types the VITE_* env.
- **⚠ OPEN FLAG for Arijit:** `components/Markdown.tsx` is custom display glue (~110 lines, 0 deps) — added so the quality-comparison answers are readable. Veto allowed per minimise-custom-code steer; fallback = raw text.
- Workspace/design-thinking docs: `docs/workspace/ab-webapp/{_status,01-design-thinking,07-aesthetic,07b-uiux-constraints}.md`.

## Resume action (do these first, in order)
1. Read this file, `docs/project-overview.md` (the plan), and `~/.claude/plans/toasty-meandering-robin.md` (approved build spec).
2. `cd web && npm test` (22 pass, 1 live test skipped) + `./node_modules/.bin/tsc -b` (clean) to confirm libs intact.
3. ~~**Task 14 — port libs**~~ **DONE (2026-06-10).** Ported + tested in `web/src/`:
   - `lib/agentStudioClient.ts` — pure `parseSSELine` + `parseCompletionStream` (0:/9:/a:/3: frames) + browser-direct `callCompletions` (fetch + stream, `onText` callback, search-key headers; `User-Agent` set only in node — browsers forbid it & CORS works without it). **Tool loop deliberately NOT built**: our agents run `searchIndex` server-side, hits arrive via `a:` frames in one call. Add a client loop only if a live stream shows a client-side tool request.
   - `lib/keywordSearch.ts` — `buildKeywordFilters()` (exact Appendix-A string) + `keywordSearch()` over `algoliasearch` v5 `searchSingleIndex`.
   - `lib/conversation.ts` — `buildConversationHistory()` (last 16 msgs ≈ 8 turns). `types/chat.ts` — trimmed Message/Source/HistoryEntry.
   - ~~`lib/grounding/`~~ **REMOVED 2026-06-10.** Per the "minimise custom code / native-Algolia-only" steer, the custom rc2 grounding auditor was deleted. **Grounding is now enforced in the Agent Studio agent itself** (hardened instructions) + verified by bait queries. Re-portable from rc2 if Stage-2 ever needs a server-side check.
3b. **GROUNDING HARDENED (2026-06-10) — done before UI, per Arijit.** Authored `scripts/setup/instructions_v2.md` (strict: answer only from index hits; else refuse+route; no training-data facts; no invented customers/metrics/quotes/URLs; URLs only if in a hit). PATCH-applied + published to BOTH our agents (mirror + tuned) via `agent_admin.mjs update`. **Proven** with `agent_admin.mjs bait`: baseline Beta answered "capital of France?"→"Paris" (training-data leak); v2 declines off-topic, refuses fabrication/absent-feature/exact-price baits, keeps in-index answer quality. `create_agents.py` now loads v2 (reproducible).
4. **Task 15 (NEXT) — frontend design-thinking** (invoke `frontend-builder` → `algolia-design`) to finalize the chat + 4-column layout BEFORE writing UI; then build components (DS port map = overview §7c). DS files already in `web/src/styles/{tokens,dashboard}.css` + `web/src/assets/`. Libs above are ready to wire.
5. **Task 16 — wire** the single query bar → fan out to 4 columns (env IDs below), stream cols 2-4, results-list col 1, apply grounding auditor to agent columns, render `Index | Agent` headers; E2E verify; capture transcripts (JSON) for later eval.
6. Hold: data-first rule; namespacing; live `ALGOLIA_WWW_PROD_V2` on `1QDAWL72TQ` stays READ-ONLY.

## Live infrastructure (all verified working unless noted)
- **Build app `VVKSSPDMJX`** (`ARIJIT-TEST_APP_ID` / `ARIJIT-TEST_ADMIN_API_KEY` in `.env.local` — hyphenated names NOT shell-valid, read literally). Full admin incl. `editSettings`. Agent Studio ENABLED.
  - Indices: `ALGOLIA_WWW_PROD_V2` (faithful untuned mirror, 15,168 — A/B col 3) + `visibility_www_tuned` (15,168, `removeWordsIfNoResults:lastWords` — col 4).
  - OpenAI provider id `ae943683-905b-403c-b16f-c1525fc9b7a8` (from `OPENAI_API_KEY`).
  - Agents (published, answering): **mirror `02852440-8f57-4383-98bc-bffa5b357516`** (→`ALGOLIA_WWW_PROD_V2`, col 3); **tuned `b5c4de23-769b-4b38-9051-a19add9dee06`** (→`visibility_www_tuned`, col 4).
  - Browser search key: `11ad0f071ac3cc9be1d1951c17dbc64b` (search-only).
- **Incumbent app `1QDAWL72TQ`** (READ-ONLY to us; we lack `editSettings` there). A/B col 1 = keyword search on `ALGOLIA_WWW_PROD_V2`; col 2 = Beta agent `ebff018c-66e1-44df-b33a-2a58a0188840` (⚠️ its prod model-provider returns **401** — col 2 not measurable until the other team fixes it). Client key = `VISIBILITY_API_KEY`.
- **`web/.env.local`** holds all the above as `VITE_*` vars (search keys only; admin/OpenAI keys live in root `.env.local`, never bundled).

## Gotchas (hard-won)
- Agent **publish** is a separate action: `POST /agent-studio/1/agents/{id}/publish` (the `status` field on create does NOT stick).
- **urllib** needs an explicit `User-Agent` header for `/agent-studio/*` (WAF 4xx otherwise); curl is fine.
- Provider registration validates the LLM key by calling the provider → can transiently 400 "timed out"; retry.
- The `1QDAWL72TQ` `visibility-www-prod` copy (made early) is **SUPERSEDED** — ignore it; the real work is on `VVKSSPDMJX`.
- `.env.local` `VISIBILITY_INDEX_NAME` was fixed lowercase→`ALGOLIA_WWW_PROD_V2`.

## Decisions locked (full rationale: docs/project-overview.md)
1. **Win condition** — LLM-judge harness (reuse Central's) + blind human/SME panel (authoritative).
2. **Build home (REVISED)** — we lack `editSettings` on live `1QDAWL72TQ`, so OUR agents + tunable indices live on **`VVKSSPDMJX`** (full admin); incumbents (col 1 keyword, col 2 Beta) are called READ-ONLY on `1QDAWL72TQ`. Effectively the read-prod/build-sandbox hybrid; content is copied so the A/B stays fair.
3. **Coordinator path** — prototype in Agent Studio (DONE) → harden in code (Stage 2).
4. **A/B = 4-col ablation** — col1 live keyword, col2 Beta `ebff018c`, col3 our agent/mirror index, col4 our agent/tuned index. (2v3 = agent effect; 3v4 = index effect; 1v4 = old-vs-new.)
5. **Discovery** — intent-first adaptive.
6. **Grounding edge** — strict refuse + route; no adjacent fallback; never training-data facts. **Enforcement REVISED 2026-06-10:** done in the Agent Studio agent (hardened instructions `instructions_v2.md`) + verified by bait queries — NOT custom client code (the rc2 mechanical auditor was removed; custom code minimised, native-Algolia-only). Mechanical code check returns at Stage-2 only if bait data shows leakage.
7. **Start-point** — DECIDED: **clone-and-improve the Beta `ebff018c`** (Stage-0 audit). Surgical fixes: strip `---collect`; add empty-retrieval retry; add two-way behavior; widen synonyms.
8. **Webapp** — fresh **React+Vite+TS** (resolved from DS), browser-direct (Stage 1) → backend at Stage 2; ~~grounding client-side~~ **grounding now in the agent (see #6); port-don't-rebuild superseded for grounding (removed)**.
9. **Guiding principle** — every architectural choice is data-proven by answer quality, never assumed.
10. **Custom code minimised / native-Algolia-only (Arijit steer 2026-06-10).** Keep custom code to unavoidable native-Algolia glue. Runtime deps = `algoliasearch` + React only. No redis/logger/SDKs. See memory [[feedback-minimise-custom-code-native-algolia]].
11. **Conversation memory model — INVESTIGATED & DECIDED (evidence-grounded, primary Algolia docs read):**
    - **Multi-turn context** = the `messages` array we send each turn (client holds the thread; `conversation.ts` slices last ~8 turns, `callCompletions` prepends). The server NEVER auto-injects prior turns — true even with memory ON. This small thread-glue is unavoidable for our custom UI.
    - **Agent Studio "memory"/Conversations toggle** = server-side STORAGE/retrieval only (persist Q/A/tool-calls/metadata; list/retrieve/export/delete; per-user via JWT; retention 0/30/60/90). It does NOT feed context back to the model. Source: `algolia.com/doc/guides/algolia-ai/agent-studio/how-to/conversations` (mirror: rc3 `docs/research/agent-studio-docs/03-capabilities.md:58-150`). It's currently OFF (ephemeral) — **correct for Stage-1 A/B** (we capture transcripts ourselves). **Turn ON at Stage-2** (authenticated/JWT mode; send `id:"alg_cnv_…"` + `messages[].id:"alg_msg_…"`).
    - **OOTB `<Chat>` widget** (`import { Chat } from 'react-instantsearch'`) gives zero-code single-agent chat (manages its own thread). **CANNOT be used for our 4-column A/B** — verified against the API ref (`algolia.com/doc/api-reference/widgets/chat/react`): no programmatic `sendMessage`, can't hide its input box, no messages-array access for transcript capture; props are only `initialMessages`/`onFinish`/`onToolCall`. So one-box-driving-4-widgets is NOT possible. The raw Vercel **AI SDK 5 `useChat`** (what `<Chat>` wraps) DOES expose `sendMessage`+`messages`, but adopting it adds the AI-SDK dependency + a transport adapter — heavier than our ~50-line `callCompletions`, so rejected for Stage-1. **`<Chat>` is the candidate for a Stage-2 single-agent production chat.**

## Key findings
- **Keyword retrieval is the core risk, CONFIRMED:** full-NL queries → 0 hits on the strict AND-match index (`removeWordsIfNoResults: none`); 3–5 keyword terms → 7–14 hits. Agent keyword-reformulation is the PRIMARY fix; index `removeWordsIfNoResults` relax alone is marginal (0→1 poor hit) — iterate (`allOptional`, synonyms) by data.
- **Live demo of the thesis:** same query — untuned index → grounded REFUSAL; tuned index → grounded answer. Index effect + zero-hallucination both shown.
- **rc2 = quality bar** (coded coordinator: deterministic discovery + mechanical grounding auditor + Redis); rc3 = Agent Studio patterns + reusable `eval/` harness. Both NeuralSearch — their full-NL-query assumption doesn't port to keyword.
- The Visibility app has 15 Agent Studio agents (a team owns the Beta); the docs-site "Ask AI" (`askai.algolia.com`, different app/index) is a separate product, not our incumbent.

## Remaining work (order)
1. **Task 14** — port libs (agentStudioClient, keywordSearch, grounding auditor, chat types) + Vitest tests.
2. **Task 15** — frontend design-thinking → UI components (Algolia-branded chat + 4-col comparison).
3. **Task 16** — wire 4-col A/B fan-out + chat + grounding; E2E; transcript capture.
4. Index tuning iteration on `visibility_www_tuned` (`allOptional`, synonyms) — data-driven.
5. Get Beta col-2 provider 401 fixed (external) to measure the incumbent agent.
6. **Stage 2 (later):** backend proxy → coded coordinator + mechanical grounding auditor + persistent memory; port rc2 `eval/{judge,harness,compare}`; human panel.
7. **Phase 1b:** index-architecture experiment (single vs Atlas) — ADR.
8. **Gate → Phase 2** (multi-agent A2A) only if Phase 1 wins.

## What has NOT been done (no false completion)
- Task 14 libs DONE & tested, but: NO UI; NO wiring; no hooks (useAgentColumn/useKeywordColumn/useChatThread). `App.tsx` is still the empty scaffold.
- `callCompletions` streaming loop verified by unit tests + a node live call (real agent answered) + a browser CORS probe (raw fetch). The full streaming-read loop has NOT been exercised end-to-end inside a React component yet.
- No functional A/B in the app yet; no transcripts captured.
- No eval harness ported; no golden question set; no scoring; no human panel.
- No Stage-2 backend / coded coordinator / mechanical grounding auditor yet (Stage-1 is Agent-Studio prototype only).
- Index tuning is minimal (only `removeWordsIfNoResults:lastWords`); not yet optimized.
- Beta col-2 not measurable (its prod provider 401s).
- Phase 1b (Atlas) not started; Phase 2 not started.
- Overview §12 open questions still open (model choice locked-ish to gpt-5.2 for parity; win-margin, golden set, human panel, team coordination unresolved).

## Reference files
- `docs/project-overview.md` — the plan (source of truth). `docs/algolia-api/` — local Algolia API ref. `docs/recon/` — Ask-AI recon screenshots.
- `~/.claude/plans/toasty-meandering-robin.md` — approved build spec.
- `CLAUDE.md` — lean project router. `.env.local` — all creds (VISIBILITY 1QDAWL72TQ, CENTRAL 0EXRPAXB56, ARIJIT-TEST VVKSSPDMJX, OPENAI_API_KEY).
- `scripts/setup/migrate_corpus.py`, `scripts/setup/create_agents.py` — repeatable setup.
- `web/` — the React+Vite+TS app. DS source: `/Users/arijitchowdhury/AI-Development/Algolia-Design-System`.
- rc2 quality-bar code: `…/AlgoliaRAG-Google/rc2-algolia` (`lib/search/{orchestrator,content_auditor,audit,discovery_analyzer}.ts`, `eval/`). rc3: `…/rc3-phoenix` (`src/hooks/chat/useAgentStudioMaverick.ts`).

## Files written/updated this session
- `docs/algolia-api/` (10 files), `docs/project-overview.md` (+§3.5/§3.6/decisions/Appendix A), `docs/recon/` (3 PNGs).
- `CLAUDE.md` (lean), `~/.claude/plans/toasty-meandering-robin.md` (build spec).
- `scripts/setup/migrate_corpus.py`, `scripts/setup/create_agents.py`.
- `web/` scaffold: `web/.env.local`, `web/vite.config.ts` (vitest), `web/src/main.tsx` (token imports), `web/index.html` (fonts), `web/src/styles/{tokens,dashboard}.css`, `web/src/assets/` (logos).
- `.env.local` (root): fixed `VISIBILITY_INDEX_NAME`; user added `ARIJIT-TEST_*` + `OPENAI_API_KEY`.
- Vault: `…/ArijitOS-Brain/Projects/Algolia-Central2/project-overview.md` (raw copy).
- Memory: `MEMORY.md` + `project-visibility-agents.md` + `feedback-data-driven-decisions.md` + `user-arijit-visibility.md` + `session_pointer.md`.
- `SESSION.md` (this file).

### Session 2026-06-10 (cont.) — Task 14 + grounding pivot
- **web/src/lib/**: `agentStudioClient.ts` (+`.test.ts` 10 tests, +`.live.test.ts` gated), `keywordSearch.ts` (+`.test.ts` 3), `conversation.ts` (+`.test.ts` 4). **web/src/types/chat.ts**. `web/package.json` (+`test`/`test:watch` scripts).
- **REMOVED** `web/src/lib/grounding/{audit.ts,inlineStreamAuditor.ts,inlineStreamAuditor.test.ts}` (custom auditor deleted per minimise-custom-code steer; re-portable from rc2).
- **scripts/setup/**: `agent_admin.mjs` (node admin: `get`/`update`/`bait` — trusts cert chain; python urllib hit SSL self-signed-cert-in-chain, do NOT weaken TLS, use node), `instructions_v2.md` (hardened grounding prompt, 7180 chars, now live+published on BOTH agents), `current_instructions.txt` (old Beta-inherited baseline dump), `inspect_agent.py` (python GET — blocked by SSL, superseded by agent_admin.mjs). `create_agents.py` now loads `instructions_v2.md` (reproducible).
- **CLAUDE.md** (project): Non-negotiable grounding-enforcement clause rewritten (agent-config + bait-verify, not custom code).
- **Memory**: +`feedback-minimise-custom-code-native-algolia.md` (+MEMORY.md index line).
- **Verified**: `tsc -b` clean; `vitest run` 17 pass / 1 skipped; CORS browser-direct works from localhost (200, 17KB SSE); bait set proves v2 fixes the "Paris" training-data leak.
