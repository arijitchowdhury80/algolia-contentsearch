# SESSION.md — Algolia-Central2

_Last updated: 2026-06-29 (session 3). Diagnosed RC2 slowness, ran a 4-way model eval, switched live RC2 to **flash-lite primary + flash fallback**, caused+recovered a prod streaming incident, committed the eval harness, discarded the broken cross-provider fallback._

## ▶ STATUS (one line)
**Live RC2 = flash-lite primary + flash fallback, stable. Eval harness committed.** Session-4 DONE: (1) 5 Central2 commits PUSHED → origin/main `7d3ae03`; (2) RC2 feat tree CLEANED (cross-provider WIP → `stash@{0}` + scratchpad patch); (3) HUD flash-lite fix SHIPPED to prod (`main` `e1e80739`, verified live); (4) **GYM #25 BUILT + eval-path PROVEN** (gym scaffold authored; autonomous RUN gated on P2b). Open: P2b calibration (the gate that unblocks the gym + everything judge-trusting).

## ▶ GYM #25 — what's built (session 4)
- **Shadow capability:** `scripts/setup/honed/clone_shadow.mjs` — config-faithful clone of live specialist → `ac2-<role>-shadow`. **`ac2-support-shadow` (`bbdbf943-…`) created + verified** (model/instructions/source-scoped tools all == live). Autonomy boundary: hone on shadow, promote to live is gated.
- **Eval primitive + PROVEN path:** `scripts/setup/honed/baton_eval.mjs` (warm-baton → judge-ready request WITH source bodies) | `judge:cli` rounds=3 → SUP-1 composite **8.21**, gate clean, on the shadow. (the §11.6 path-proof.)
- **Executor (authored, NOT run):** `scripts/setup/honed/gym.workflow.js` — Workflow script: per-unit evaluator-optimizer (diagnose/propose Opus → deploy-to-SHADOW Haiku → re-eval → keep/rollback), E2E synthesize, gated promote. Parses clean.
- **Resumable state + driver:** `gym_state.json` (SOP §6/§10 backbone, support baseline seeded) + `gym_driver.md` (/loop runbook, modes smoke/spotcheck/trust, hard invariants).
- **⛔ HARD GATE (SOP §8):** judge is UNCALIBRATED (P2b not done) → running the loop in *trust* mode = Goodhart. Gym is built + path proven; real optimization run waits on P2b. NEW FILES UNCOMMITTED on Central2 main.

## ▶ RESUME — first actions next session
1. Read this file. Two repos in play:
   - **RC2 app** (live site): `~/Dropbox/AI-Development/RAG/AlgoliaRAG-Google/rc2-algolia` (dev branch `feat/gold-capture`, tree CLEAN — WIP in `stash@{0}`); live deploys from `main` via worktree `/private/tmp/rc2-main-docs` (@ `e1e80739`, HUD flash-lite fix live).
   - **Central2** (this repo, eval harness + AC2 + gym): `~/Dropbox/AI-Development/RAG/Algolia-Central2`, `main` @ `136da03`, pushed, clean.
2. **Nothing broken. Everything committed + pushed.** Live RC2 stable.
3. **The one real next step = P2b judge calibration** (~45 min, Arijit blind-ranks). It's the gate that unblocks the honing gym (#25, built) in trust mode AND every judge-trusting decision. Sheet ready: `lab/server/calibration/set.json` → `applyHumanRanks.mjs` → `CALIBRATION_ROUNDS=3 npm run calibrate` (pass = Spearman ≥0.7). Then run `gym.workflow.js {unit:'support', mode:'trust'}`.
4. Gym runbook: `scripts/setup/honed/gym_driver.md`. Gym state: `scripts/setup/honed/gym_state.json` (read first; `blockers` lists P2b).

## ▶ WHAT HAPPENED THIS SESSION
### A. Started: "wire RC2 cross-provider fallback (Gemini→Algolia inference)"
- Built `FallbackProvider` in rc2-algolia (lib/llm/fallback.ts + config/index). Unit test 7/7. Local live failover proof passed (broke Gemini key → Algolia US inference answered).
- User renamed env to clean `ALGOLIA_INFERENCE_*` (purged "minimax"); code updated to match. Found+fixed a real bug in rc2 `.env.local` (BASE_URL and API_KEY were on ONE line → dotenv never set the key).

### B. Diagnosed RC2 slowness (user noticed it)
- **Root cause: prod `LLM_MODEL=gemini-2.5-flash`** (heavy thinking model, set ~5d ago). NOT the fallback work, NOT the new Gemini key. Proven: flash TTFT 2.6s vs flash-lite 0.4s on identical prompts (raw Gemini local).

### C. 4-way eval (12 Qs, judge rounds=3) — committed as the harness
- Captured flash / flash-lite / inference(gemma) / baseline via local dev-server per LLM config. Judged with fast judge (gemini-2.5-flash), rounds=3.
- **Verdict: flash-lite 8.04 @ 7.5s (local) WINS** > flash 7.57 @ 13.9s (1 grounding gate) > gemma-inference 7.13 (2 gates, 25s). flash-lite better quality AND faster.

### D. PROD INCIDENT (caused + recovered) — the key lesson
- Deployed flash-lite + the custom cross-provider `FallbackProvider` to live → **~50% of queries errored `Failed to parse stream`** (Vercel streaming broke).
- **Root cause: the FallbackProvider wrapper manually re-drives the async iterator (`it.next()` then relay) → breaks streaming on Vercel serverless.** Local node tolerates it; Vercel doesn't. Isolated: old code (no wrapper) 6/6 clean · flash-lite WITHOUT wrapper 6/6 clean · raw Gemini 5/5 clean. Wrapper = sole cause.
- Recovered: `vercel promote` the previous stable deploy. Memory: [[feedback-stream-wrapper-vercel-passthrough]].

### E. Resolution (user's call): flash-lite primary + flash fallback
- Native `streamWithRetry` already composes `[LLM_MODEL, LLM_FALLBACK_MODEL]` and is Vercel-safe (no custom wrapper). So: `LLM_MODEL=gemini-2.5-flash-lite` + `LLM_FALLBACK_MODEL=gemini-2.5-flash`. **Env-only change, live-read, no redeploy. 5/5 clean.** Better than gemma fallback (flash quality 7.57 > gemma 7.13, and stable).

### F. Cleanup
- Discarded the 2 cross-provider commits (RC2 main worktree `git reset --hard 53c41ca0`).
- Removed stray `rc2-main-docs` Vercel project (a wrong-target deploy I created). Removed unused `ALGOLIA_INFERENCE_*` prod env vars.
- Committed eval harness to Central2 (`7d3ae03`).

## ▶ LIVE RC2 STATE (exact — read before touching)
- Site `algolia-central.vercel.app` = Vercel project **`algoliacentral`** (prj_5V4H7a0Z2Yb6L8lHlBHZlN1wbOMk). Serves the `rc2-algolia` codebase, deploys from branch `main`.
- **Env (live-read — changing it needs NO redeploy):** `LLM_MODEL=gemini-2.5-flash-lite` · `LLM_FALLBACK_MODEL=gemini-2.5-flash` · `GEMINI_API_KEY`=the `AQ.Ab8RN6Lm…` key · NO `ALGOLIA_INFERENCE_*`.
- Current live deploy = the pre-session stable build (promoted `hc34uh55g`); model controlled purely by env.
- Honest note: **prod flash-lite is ~12–14s** (network/pipeline-bound), NOT the 7.5s seen locally. Modest prod speed gain over flash; quality edge holds.

## ▶ DECISIONS LOCKED THIS SESSION
1. RC2 primary = **gemini-2.5-flash-lite**; fallback = **gemini-2.5-flash** (Gemini→Gemini via native streamWithRetry). Cross-provider gemma fallback **dropped**.
2. NEVER ship a streaming wrapper that re-drives `.next()` — breaks Vercel. Pass native stream through, or fail over at request level. Test stream wrappers ON Vercel, not just local.
3. Judge/eval rounds≥3 always (rounds<3 = noise) — re-confirmed.
4. HUD model-label fix = LEFT as-is (cosmetic; runtime correct via env).

## ▶ REPO STATE
- **RC2** (`rc2-algolia`): main worktree (`/private/tmp/rc2-main-docs`) clean @ `53c41ca0` (= live). Dev branch `feat/gold-capture` working tree still DIRTY with superseded cross-provider WIP + `eval/h2h-variant.ts` (harmless; not deployed). Not cleaned (user didn't ask).
- **Central2** (this repo): main @ `7d3ae03`. **5 commits un-pushed** (4 from prior session + this eval harness). Working tree: only `SESSION.md` modified.

## ▶ WHAT HAS NOT BEEN DONE (no false completion)
- Central2 5 commits NOT pushed (awaiting user go).
- Cross-provider fallback NOT shipped (dropped; code only in discarded RC2 commits + dirty feat tree).
- HUD label fix NOT deployed (cosmetic).
- RC2 `feat/gold-capture` working tree NOT cleaned of cross-provider WIP.
- Prior-session pending still open: P2b human-rank calibration (blind sheet ready), gym #25, E2E warm-baton.

## ▶ KEY FILES THIS SESSION
- RC2: `lib/llm/adapters/gemini.ts` (streamWithRetry uses `[LLM_MODEL, LLM_FALLBACK_MODEL]`), `dev-server.mjs` (local API :3005), `eval/h2h-variant.ts` (param capture runner).
- Central2 (committed `7d3ae03`): `lab/server/src/judge/variantJudge.ts`, `scripts/setup/h2h/runs/{capture-all.sh,build-table.mjs,*_answers.json,variant_scores.json}`, `lab/server/src/judge/h2hJudge.ts`.
- Memory: [[feedback-stream-wrapper-vercel-passthrough]], [[project-rc2-deploy-and-keys]] (updated).

## ▶ OPEN QUESTIONS FOR ARIJIT
(Session-4 closed all 4 prior questions: 1 pushed ✅ · 2 cleaned ✅ (stash@{0}) · 3 shipped live ✅ (e1e80739) · 4 gym #25 built ✅.)
1. **P2b judge calibration** — the only gate left. Do it (~45 min) to unblock the gym + judge-trusting work?
2. After P2b: run the gym in trust mode on support, then the other 3 specialists? Or hold?
3. E2E warm-baton full-bank run (the `Synthesize` phase) — run as part of the gym, or standalone first?

## ▶ SESSION-4 FILES WRITTEN
- RC2 `main` (`/private/tmp/rc2-main-docs`, committed `e1e80739`, pushed): `src/components/hud/LegendPanel.tsx`, `src/components/system-xray/SynthesisCard.tsx`, `lib/search/prompts/support.ts`, rebuilt `api/diag.mjs` + `api/search.mjs`.
- Central2 `main` (committed `136da03`, pushed): `scripts/setup/honed/{clone_shadow.mjs, baton_eval.mjs, gym.workflow.js, gym_state.json, gym_driver.md}`, `SESSION.md`.
- Memory: `project-specialist-honing-gym.md` (+ MEMORY.md index).
- Live infra: created Agent Studio shadow `ac2-support-shadow` (`bbdbf943-…`) on CENTRAL `0EXRPAXB56` (additive, not in any routing).
- Insurance (scratchpad, recoverable): `hud-flashlite-fix.patch`, `rc2-feat-crossprovider-wip-FULL.patch`, `rc2-feat-untracked-wip.tgz`, `sup1_request.json`, `sup1_verdict.json`.

## ▶ NOT DONE (no false completion)
- Gym NOT run in trust mode (correctly gated on P2b — judge uncalibrated = Goodhart risk).
- `gym.workflow.js` authored + parses but NEVER executed (needs Workflow tool opt-in + P2b).
- Only `ac2-support-shadow` created; tech/academy/marketer shadows NOT created (one `clone_shadow.mjs <role>` each when needed).
- Full support-bank baseline NOT measured (only SUP-1 smoke @ 8.21); gym's first real step is the full baseline.
- P2b calibration NOT done. P3 gym (#14) SKIPPED by user (prior).
