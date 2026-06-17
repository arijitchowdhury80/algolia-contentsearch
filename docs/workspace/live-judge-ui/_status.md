# Live Judge in the UI — status

**State: BUILT + verified END-TO-END IN THE BROWSER.** Date: 2026-06-14.

Browser proof (screenshot: live-judged-proof.png): typed "How does Algolia handle
typo tolerance?" → ②/③ streamed → panel auto-went idle→judging→"LIVE JUDGED" with
real verdicts (③ 2.0/10; Skeptic 2.9 / Referee 3.9 / Advocate 2.6 each with a full
rationale; ② 8.8; live ②-vs-③ margin −6.8; synthesis narrative). The React effect
timing seam (lanes report → hook fires fetch → panel renders) is now PROVEN.
Bonus real finding: ③ false-refused on a query whose sources DID contain the answer
— the live judge caught it as a retrieval/synthesis failure (score 2.0).

## What shipped
**Backend (lab/server):**
- `liveJudge.ts` — single-question judge of the displayed answers. Pure mappers
  (`buildLiveArtifact`, `toVerdict`) + injected-scorer orchestrator (`judgeLive`)
  + `makeLlmScorer`. Reuses `judgeArtifactMultiRound` (same engine as batch).
- `activeJudgeLlm.ts` — extracted the provider-resolution block (DRY); `judgeStep.ts`
  now uses it too (one source of truth for the judge provider).
- `webserver.ts` — new `POST /api/judge` (400 validation, per-panel error isolation, CORS).
- `tsconfig.json` — excludes `*.test.ts` from tsc (tests run via judge's vitest).

**Frontend (web):**
- `lib/judgeClient.ts` — typed client + `toJudgeSource` (richest grounding text).
- `lib/analysis.ts` — `toAnalysisData` (③ drives judges; ②-vs-③ margin in synthesis).
- `hooks/useLiveJudge.ts` — gates on both agent lanes done → POST → AnalysisData; seq-guarded.
- `hooks/useAgentColumn.ts` — emits `AgentResult` on done/error; enriched source capture (chunk_text).
- `components/AgentColumn.tsx` — threads `onResult`.
- `components/AnalysisPanel.tsx` — idle(mock preview) / streaming / judging / done(live) / error states.
- `App.tsx` — wires `useLiveJudge` → agent columns + panel.
- `styles/ab.css` — `.analysis__live` / `.analysis__status`. `.env.local` — `VITE_LAB_API_URL`.

## Verification (evidence)
- tsc: lab/server CLEAN, web CLEAN.
- Tests: liveJudge **7**, judge **64** (no regression from refactor), autocorrect **22**, web **37** (1 live skipped). All pass.
- **Live E2E (the gate):** `POST /api/judge` on Gemini, rounds=1 — grounded ③ answer
  scored 5.9 (clean); fabricated ② answer scored 0.70 and **GATED** ("complete
  hallucination"). Endpoint returns per-judge scores+notes+synth+gate. ~58s.

## Validation risk surface
- **Proven:** the backend engine end-to-end on the live provider; all pure
  mappers/client/panel-state logic; type alignment across App→hook→client→backend.
- **NOT proven by an automated run yet:** the in-browser effect timing (lanes
  report → hook fires fetch → panel renders live). Every piece is proven; the
  React integration in a real browser is the one remaining manual check.

## How to use
1. Backend: `cd lab/server && npx tsx src/webserver.ts` (port 8787). [Currently RUNNING, pid 12381.]
2. Frontend: `cd web && npm run dev`, open the page, type a question.
3. ②/③ stream → panel shows "judging…" (~30–90s on Gemini) → real verdicts.

## Deferred (fast-follow)
- Vercel: live judge is local-only (keeps mock on the deploy).
- Could judge ① website too; currently judges the two agent lanes.
- Live uses thinner sources + fewer rounds than batch → indicative, not authoritative.
- NOT committed yet (awaiting user go-ahead).
