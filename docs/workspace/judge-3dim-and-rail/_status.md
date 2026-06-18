# Workstream B — 3-Dim Judge + Permanent Analysis Rail

_Feature-builder run. Started 2026-06-18. Owner: Claude + Arijit._

## Goal (Arijit, locked)
Two coupled changes, built as ONE pass (the UI is built around the new judge contract — "build once"):
1. **Judge → 3-dimension composite.** Replace the 7-weighted-dimension single score with **3 dimensions**: D1 Grounding (HARD FLOOR + scored), D2 Answer confidence (NEW), D3 Breadth & depth. Each of the 3 judges (Skeptic/Referee/Advocate) gives a composite across the 3 dims; **final = average of the 3 judges' composites**, then grounding hard-floor caps it if a real violation recurs.
2. **Permanent analysis RAIL** (was on-demand drawer). Collapsible right rail filling the dead right-side space, showing composite + per-dimension bars + ②-vs-③ margin + per-judge breakdown, color-coded. PLUS (Arijit, this session): **lanes manually resizable**, the rail **pushes** lanes (no overlay), and a **pin** toggle.

## Locked contract (the seam — build UI around THIS)
- Rubric = 3 dims: `grounding` (weight 2, gated), `confidence` (weight 1), `breadth_depth` (weight 1). On 1–10.
- Per-judge composite = weighted mean of its 3 dim scores, rescaled 0–10 (existing `weightedAggregate` + `toFinalScale`).
- Pre-gate final = **mean of the 3 judge composites** (`DEFAULT_SYNTHESIS.rule = "mean"`, per Arijit "average of the 3 judges").
- Grounding floor preserved EXACTLY: claim-recurrence gate, gatingTemperament = skeptic, supermajority across rounds, cap=3 ([[feedback-zero-flicker-judge]], [[feedback-grounding-supermajority-vote]]). Grounding is BOTH a scored dim AND the hard floor.
- `RoundAggregate.dimensionMeans` already gives per-dim averages → the 3 bars.
- ADD `RoundAggregate.judgeComposites: {judgeId, temperament, composite}[]` (avg across rounds) for the per-judge breakdown. (liveJudge already derives per-judge scores in `judgesFromRounds`; expose dims too.)
- `LiveJudgeVerdict` ADD `dimensions: {id,label,score}[]` (from dimensionMeans + rubric labels). Web `JudgeResult` + `analysis.ts AnalysisData` carry it → rail bars.
- **Engagement dim DROPPED** from the headline composite (Arijit's 3 dims are explicit). Two-way/engagement deferred — note in open questions. (liveJudge's `notApplicableDimensions: ["engagement"]` becomes a no-op; clean it.)

## Files
Backend: `lab/judge/src/{rubric,prompt,synthesis,types}.ts` (+ tests in `lab/judge/test/`), `lab/server/src/{liveJudge,judgeStep}.ts`.
Frontend: `web/src/lib/{judgeClient,analysis,score}.ts`, `web/src/components/AnalysisDrawer.tsx`→rail, `web/src/App.tsx`, `web/src/styles/ab.css`.

## Verify (TS project — maps ruff/mypy/pytest → tsc/vitest)
- `cd lab/judge && npx vitest run` + `npx tsc --noEmit`
- `cd lab/server && npx tsc --noEmit && ../judge/node_modules/.bin/vitest run`
- `cd web && ./node_modules/.bin/tsc -b && npm test` + browser proof

## Progress
- [x] Read full judge + UI contract chain (types/rubric/synthesis/prompt/judge/aggregate/helpers/index/liveJudge/analysis)
- [x] Spec + contract locked (this file)
- [x] BACKEND: rubric 3-dim (grounding x2 / confidence / breadth_depth) + synthesis "mean" + judgeComposites in aggregate + prompt GROUNDING_NOTE reworded. judge tsc clean + **65 tests**.
- [x] BACKEND: liveJudge exposes `dimensions` (1–10, rubric order) + per-judge `judges[].score` now round-averaged composite (0–10). server tsc clean + **33 tests**. (judgeStep/store untouched — additive field; no hardcoded old dim ids in logic.)
- [x] FRONTEND: design-thinking (inline — refinement of locked Algolia aesthetic; mental model = docked inspector rail).
- [x] FRONTEND: judgeClient `JudgeVerdict.dimensions` + analysis.ts `AnalysisData.{dimensions,floorScore,gateTripped,borderline}`.
- [x] FRONTEND: `AnalysisDrawer`→`AnalysisRail` (permanent, collapsible). Composite + 3 per-dim bars + ②-vs-③ margin + per-judge + config diff + synthesis. Idle/streaming/judging/error = honest status (no mock). useLiveJudge import migrated; old drawer + its test deleted; new AnalysisRail.test added.
- [x] FRONTEND: lanes `resize: horizontal` (native); rail pushes lanes (flex sibling in `.lab__workspace`); collapse↔strip; pin (persisted, disables collapse); left-edge drag resize; all persisted to localStorage.
- [x] Browser proof (4 shots in proof/): push (1), 3-dim done w/ real judge data + gate + margin (2), collapsed strip + lanes reclaim width (3), pinned full rail w/ collapse disabled (4). web tsc + **87 tests**.

## Verification (all green)
- judge: `npx tsc --noEmit` clean · `vitest` **65**
- server: `npx tsc --noEmit` clean · `vitest` **33**
- web: `tsc -b` clean · `vitest` **87** (1 skipped)
- Browser: 4 proofs, real Gemini 3-dim judge live.
- Validators (code/ui): vault SOPs unreadable in this env (Google-Drive EPERM, known) → validated against feature-builder embedded checklists (tiers, a11y labels/focus/keyboard, no hardcoded colors — all token-based, distinctive Algolia aesthetic).

## Honest note from the proof
On the typo-tolerance Q, the LIVE judge GATED ③ to 3.0 (grounding hard-floor fired) even though the agent answers it well now (workstream A). Cause = the known "live judge is indicative" caveat: the UI passes THIN browser source snippets, so a claim in the full answer isn't covered by the thin sources → skeptic flags it. This is CORRECT hard-floor behavior given thin sources, and it actually demonstrates the floor works. Authoritative ③-vs-② numbers come from the batch `cli judge` on full transcripts, not the live panel. (Re-measuring A's win via batch judge is the remaining follow-up.)

## Done this session BEFORE B (context)
Workstream A (③ false-refusal) FIXED + deployed + verified — see [[project-case3-refusal-diagnosis]]. ③ judge re-measure still pending (fold into B's live judge once rail works).
