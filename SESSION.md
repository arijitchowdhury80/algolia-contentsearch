# SESSION.md — Algolia-Central2

_Last updated: 2026-06-28 (handoff). Latest session = closed Backlog A (expandedQuery drop, shipped) + Backlog B (native memory, negative). Judge "Confidence" build was completed in the prior session._

## ▶ STATUS (one line)
**Backlog A + B CLOSED; on `main` `03e9184` (synced, clean tree).** A = `brain.expandedQuery` DROPPED from retrieval (raw turn to agent; grounding hazard removed) `dc03bc7`. B = Agent Studio native memory does NOT carry context → AC2 keeps stateless `messages[]` replay, no Redis `03e9184` + ADR-002. Judge build shipped earlier (`a3402bb`). **Only `P2b` (human-rank judge calibration, needs Arijit ~20 min) remains; P3 skipped.** Repo `github.com/arijitchowdhury80/algolia-contentsearch`.

## ▶ RESUME — first actions next session
1. Read this file. Judge build + Backlog A + Backlog B all DONE and on `main` (`03e9184`, clean tree). Nothing in-progress, nothing broken. **The single remaining task is `P2b` (item 3 below) — needs Arijit.** If Arijit gives no direction, propose P2b or wait.
2. **DONE (Arijit approved "A", 2026-06-28) — expandedQuery dropped from retrieval:** `orchestrate.ts:40,65` now send the **raw user turn** to the agent (was `brain.expandedQuery`). brain still runs (intent/entities/proposedQuestion → dossier, baton routing, judge Coverage). `expandedQuery` field survives ONLY as baton's routing-prompt signal (`baton.ts:26`) — NOT retrieval, so no grounding risk. New TDD test `orchestrate.test.ts` "sends the RAW user turn". Tests 109 green, tsc clean. **NOT committed** (working tree dirty). Validation behind it: Gate 1 ✅ (NeuralSearch fires on raw NL); Gate 2 (32-Q A/B) = +0.24 (noise) + grounding hazard on baits (7.5). Writeup: `docs/experiment/2026-06-28-expandedquery-drop-validation.md`. Optional follow-up: a narrow turn-≥2 coreference rewrite (not needed today — turns are sent fresh + self-contained).
3. Remaining deferred items (optional):
   - **P2b — calibration ranking (needs Arijit, ~20 min):** the judge's trust-gate. Run `cd lab/server && npm run calibrate` AFTER putting real human ranks into `lab/server/calibration/set.json`. Tune `lab/judge/src/rubric.ts` / `prompt.ts` until Spearman ≥ 0.7. Autonomous gate FAILS (~0.0) — see "Calibration status"; human ranking is the real signal.
   - ~~Backlog B — prove native memory live~~ **DONE 2026-06-28 → NEGATIVE.** Native Agent Studio memory does NOT carry context via the completions API (2-turn probe: same conv-id, "what was my previous question?" → "you have not asked me a previous question"; negative across client-id / +5s-delay+msg-id / server-returned-id). Corrects the prior findings-doc claim. AC2 KEEPS manual `messages[]` replay; no Redis (never used). Probe `lab/server/src/experiments/nativeMemoryProbe.ts` (`npm run expt:nativememory`). Memory [[project-native-memory-not-usable]]. Architecture decision recorded: `docs/design/adr-002-conversation-state-stateless-replay-vs-redis.md` (Redis≠token-saving; AC2 stateless replay + dossier is right; native transcript store > Redis for any future persistence).
   - **P3 (SKIPPED by Arijit) — RC2 win/tie/loss gym.** Only if a head-to-head RC2 benchmark is wanted; live-eval-heavy.
4. Don't re-litigate the proven facts (see "Decisions locked").

## ▶ BACKLOG A RESULT (2026-06-28) — expandedQuery drop VALIDATED
- Harness: `lab/server/src/experiments/expandedQueryAb.ts` (+ pure `expandedQueryAgg.ts`, 7 unit tests). Run: `cd lab/server && npm run expt:expandedquery -- --rounds 3 --concurrency 4`. Artifacts: `docs/experiment/expandedquery-ab-{results.json,summary.md}` + analysis doc `docs/experiment/2026-06-28-expandedquery-drop-validation.md`.
- Verdict: NO reliable quality lift (+0.24, within ±0.3 noise) AND a real grounding HAZARD on bait/refusal queries (the documented false-refusal bug, reproduced with a score). Recommendation = drop full rephrase, keep narrow coref. Lesson captured: `docs/sop/lessons-log.md` + memory [[feedback-query-rephrase-strips-skeptical-framing]].
- Caveats: indicative thin-source judge (agentRunner discards source bodies) + flash-judge noise (2 rows lost to JSON-parse errors; clean Qs occasionally gate-trip). Gross pattern trustworthy; fine deltas not. An authoritative full-source batch re-run was NOT done.

## ▶ WHAT SHIPPED (the judge build) — merged via `a3402bb`
Branch `refactor/2x2-answer-quality-lab` → merged + pushed to `main`. Judge commits:
- `4512ee4` P1 — 4-dim rubric (Grounding/Coverage/Depth/Relevance), `confidence`→`certainty` rename, retire reference judge, replay rewired to mature engine.
- `713cbcc` P2 — calibration harness + **gate-bug fix** (unverifiable claims no longer trip the multi-round gate; `synthesis.ts:~182`) + P4 Confidence UI (ConfidenceChip + 4-bar drawer).
- `361a26e` P5 — standalone HTTP judge service (`npm run judge:serve`) + CLI (`npm run judge:cli`) + `ai-judge-cli` skill (live-verified on Gemini).
- `5a5aa40` docs — `lab/judge/README.md` (4 dims, gate, 3 integration paths, types, calibration).
- `50b1dcc` refactor — judge server surface grouped under `lab/server/src/judge/` (engine stays `lab/judge/`).
- `a3402bb` merge commit into main.

**Tests (verified by me, not on faith): judge 88 · server 101 · web 107 — all green, tsc clean.**

**Judge is usable now, 3 ways:** import `@lab/judge` (write an `LlmComplete` adapter, call `judgeArtifactMultiRound`) · HTTP `npm run judge:serve` → POST `/api/judge` · CLI `npm run judge:cli` / `ai-judge-cli` skill.

## ▶ JUDGE DESIGN (locked)
- **4 dims, equal-weight mean = composite "Confidence":** Grounding (also the hard gate), Coverage (checklist from `dossier.signals`+`brain.entities` via `Artifact.extractedEntities` — no new extraction), Depth, Relevance.
- **Grounding gate:** only `contradicted` violations cap (to 3); `unverifiable` lowers the grounding dim but does NOT gate; multi-round = a claim must recur to trip (anti-flicker, `claimGate.ts`).
- **3-lens adversarial panel** (skeptic/referee/advocate, temp 0) — already existed; we kept it.
- **Naming:** composite = "Confidence" end-to-end; per-claim signal = `certainty` (renamed from confidence to avoid UI collision).
- Spec: `docs/superpowers/specs/2026-06-27-judge-confidence-refactor-design.md`.

## ▶ CALIBRATION STATUS (P2b — the open trust gate)
- Harness built: `lab/judge/src/calibration.ts` (Spearman + runCalibration) + `lab/server/src/judge/calibrationCli.ts` (`npm run calibrate`).
- Autonomous construct-validity gate **FAILS** (Spearman ~0.0). ROOT CAUSE diagnosed: the gym gold records (`lab/replay/gold/*.json`) have **NO source bodies** (citation labels only), so any grounding eval against them is invalid; a fair set needs REAL retrieved source chunks. The p2-real agent captured some real sources into `lab/server/calibration/set.json`, but strong answers still gate (skeptic labels claims "contradicted" — likely answer↔source mismatch in the synthetic set). 
- **DECISION (Arijit):** stop grinding the synthetic gate; the judge engine is unit-tested + the one real bug it found (the multi-round `unverifiable` gate bug) is fixed. The REAL gate = a 20-min human-rank session with Arijit, deferred.

## ▶ DECISIONS LOCKED THIS SESSION
1. Consolidate onto the mature judge engine; **retire** the weak reference judge (`judgeReference.ts` et al.) — DONE.
2. 4 dims (drop old decisiveness "confidence" dim; split breadth_depth→coverage+depth; add relevance); equal weight; grounding = hard gate.
3. Composite named "Confidence"; per-claim → `certainty`.
4. RC2 role: calibration anchor + (deferred) gym yardstick — NOT a per-answer token-diff.
5. **No separate GitHub repo** for the judge — keep in AC2 monorepo, logically separated (`lab/judge` engine + `lab/server/src/judge` service). Split later only if needed.
6. Packaging: HTTP service + runnable CLI skill (both built).
7. UX: per-answer Confidence chip → right drawer (built).
8. **Coordinator stays custom — PROVEN:** Agent Studio has NO native multi-agent handoff (`/handoffs`,`/teams`,`/orchestrators`,`/workflows`,`/sessions` → 404 live on `0EXRPAXB56`; agent config has no handoff field). "Orchestrator" agents are classifiers + client routing = exactly what `brain`+`baton` are. Conversation memory IS native (on by default). `brain.expandedQuery` is likely redundant (NeuralSearch understands NL) — but deleting it is gated by backlog A. Full findings: `docs/research/2026-06-27-coordinator-algolia-native-findings.md`.
9. P3 (RC2 gym) SKIPPED by Arijit.

## ▶ WHAT HAS NOT BEEN DONE (prevent false-completion claims)
- P2b human-rank calibration NOT done (autonomous gate fails; needs Arijit). Judge is NOT yet human-validated.
- P3 (RC2 win/tie/loss gym) NOT built (skipped). Replay currently scores AC2 absolutely.
- Backlog A (`expandedQuery` drop) + B (native memory) NOT done.
- Live VISUAL UI confirm NOT done — `web/.env.local` lacks `VITE_ALGOLIA_*` keys so the web dev server won't boot; the chip/drawer are covered by static-markup tests only.
- `brain.expandedQuery` NOT deleted (gated by A).
- Working tree: `CLAUDE.md` + `SESSION.md` were dirty pre-session (not mine); this persist overwrites SESSION.md.

## ▶ KEY FILES (paths + purpose)
- `docs/superpowers/specs/2026-06-27-judge-confidence-refactor-design.md` — judge design spec.
- `docs/research/2026-06-27-coordinator-algolia-native-findings.md` — why coordinator stays custom + expandedQuery-drop case.
- `~/.claude/plans/create-the-plan-for-whimsical-hanrahan.md` — the approved 6-phase judge build plan.
- `lab/judge/` — engine (README.md, rubric.ts, judge.ts, synthesis.ts, gate.ts, claimGate.ts, calibration.ts, types.ts).
- `lab/server/src/judge/` — service surface (judgeService.ts, judgeCli.ts, judgeHandler.ts, liveJudge.ts, calibrationCli.ts, calibration tooling).
- `lab/server/calibration/` — set.json (real-source attempt), key.json, RANKING-SHEET.md (blind), cli-fixture.json.
- `web/src/components/{ConfidenceChip,JudgeDrawer,PanelCell}.tsx` — the Confidence UI.

## ▶ ENV / INFRA NOTES
- App = CENTRAL `0EXRPAXB56` (`ALGOLIA_*` in `.env.local`); judge uses provider via `activeJudgeLlm`/`provider.ts` (OpenAI key dead → Gemini fallback; gemini model = `ALGOLIA_AGENT_MODEL` default `gemini-2.5-pro`; flash override = `ALGOLIA_AGENT_MODEL=gemini-2.5-flash`, NOT `JUDGE_MODEL`).
- Reading `.env.local` from a bash command is blocked by the secrets guard; scripts (`scripts/setup/*.mjs`, calibrationCli) read it themselves — use those.
- Repo remote: `github.com/arijitchowdhury80/algolia-contentsearch` (origin). main = `a3402bb` (synced).
