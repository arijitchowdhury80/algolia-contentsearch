# Live Judge in the UI — lean spec

_Workspace for the full-stack feature. Phase-1 thinking compressed into this one
doc per the "no ceremony" steer; the feature is narrow and pre-agreed._

## Objective
When a user types a question in the Answer-Quality Lab, the 3-judge panel
(Skeptic / Referee / Advocate + grounding gate) grades the **answers actually
displayed** for ② Ask AI and ③ Our System, and the bottom Analysis panel shows
the **real** per-judge scores, notes, synthesized score, grounding-gate verdict,
and a narrative — replacing the hardcoded `MOCK_ANALYSIS`.

**Done =** type a question locally → ②/③ stream answers → panel shows a
"judging…" state → real verdicts render. Proven end-to-end against the local
lab backend with one real question.

## Locked decisions
1. **Judge the displayed answers** (option A — "judge what I see"), NOT a server
   re-run of the agents. The user wants the answers they see graded; re-running
   would judge different (nondeterministic) answers.
2. **Live judging is INDICATIVE, batch run is authoritative.** Two honest
   reasons: (a) the UI captures thinner source text than the batch harness, and
   (b) the live endpoint defaults to fewer rounds for latency. The official
   verdict still comes from `cli judge` on a full transcript.
3. **Local-only, like ① website capture.** Needs `webserver.ts` running; cannot
   run on Vercel serverless. The deployed site keeps the mock (or a "run locally"
   note) — out of scope here.
4. **Provider = Gemini** (OpenAI quota dead) via the existing `resolveActiveProvider`.
5. **Reuse the judge, don't reimplement.** New `liveJudge.ts` calls
   `judgeArtifactMultiRound` (the same engine the batch harness uses). Per-judge
   notes come from `Judgment.summary`; synthesized score from `aggregate.finalScore`;
   narrative from `perRound[0].synthesis.rationale`.
6. **Enrich UI source capture** so the live grounding gate has real text to check
   (the current `hitsToSources` keeps only title/url/summary).

## API contract — `POST /api/judge` (lab/server webserver)
Request:
```json
{
  "question": "string",
  "followUp": "string?",
  "isRefusalTest": false,
  "rounds": 2,
  "panels": [
    { "panelId": "tuned", "label": "Our System", "answer": "…", "sources": [{ "id":"…","title":"…","url":"…","text":"…" }] }
  ]
}
```
Response:
```json
{
  "rounds": 2,
  "panels": [
    { "panelId":"tuned",
      "judges":[{"role":"skeptic","score":6.5,"note":"…"},{"role":"referee",…},{"role":"advocate",…}],
      "synthesizedScore": 5.9, "preGateScore": 6.4,
      "gateTripped": false, "borderline": false,
      "rationale": "…" }
  ]
}
```
- 400 if `question` empty or `panels` empty.
- A panel that fails to judge returns `{…, error}` rather than crashing the request.

## Acceptance criteria
- AC1 `buildLiveArtifact` maps a request panel → blind `Artifact` (refusal flag
  honored; engagement marked N/A for single-turn; sources mapped to {id,text,label}).
- AC2 `toVerdict` maps a `MultiRoundResult` → verdict: one entry per temperament
  with averaged score + round-0 note; synthesized/pre-gate/gate/borderline/rationale.
- AC3 `judgeLive` judges every requested panel (injected scorer), isolates a
  per-panel failure into `error`, and echoes `rounds`.
- AC4 `POST /api/judge` validates input, runs `judgeLive` on the Gemini provider,
  returns the contract above; CORS like `/api/website`.
- AC5 `AnalysisPanel` renders three states: idle (no run), judging (spinner),
  done (real data) / error. Mock only shows when no run has happened.
- AC6 Live end-to-end: one real question → real verdicts in the browser/curl.

## Risks (pre-mortem, trimmed)
- **Latency tiger (fast-follow):** 2 rounds × 3 judges × 2 panels ≈ 18 Gemini
  calls ≈ 30–90s. Mitigate: clear "judging…" state, default rounds=2, judge only
  ②/③ (skip ① stub). Acceptable for a local lab tool.
- **Thin-source gate tiger (track):** title+summary grounding is weaker than the
  batch full-text. Mitigate: enrich capture; label live as indicative.
- **Don't-disturb-the-run elephant:** the background autocorrect run writes the
  live ③ agent. This feature only READS answers the browser already has +
  judges them — it never deploys/PATCHes an agent. Safe.
