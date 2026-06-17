# SOP & Runbook — LLM Harness Reliability

_Canonical engineering standard for the lab / eval-loop harness. Read this before
building or debugging any batch-LLM or agent-orchestration code in this repo.
Derived from real failures (2026-06-14 autocorrect-loop session). Goal: drive the
error rate down as we productize._

**How to use this doc:**
- **Building?** Follow the [Standing Standards](#standing-standards) + run the
  [Pre-Run Checklist](#pre-run-checklist) before any long/expensive run.
- **Something broke?** Jump to the [Failure Catalog](#failure-catalog) — find the
  symptom, apply the documented fix.

---

## Standing Standards (the rules)

These are non-negotiable defaults for LLM/agent harness code. Each maps to a real
failure below.

### S1 — Bounded parallelism for every multi-item LLM batch
Never `for (const x of items) await llmCall(x)`. Slow models (Gemini 2.5 Pro is a
*thinking* model, ~70–90s/call) turn N sequential awaits into hours. Use a bounded
concurrency map: `mapWithConcurrency(items, cfg.concurrency, fn)` (`lab/server/src/concurrency.ts`).
- Order-preserving (write results by input index, regroup deterministically).
- Concurrency configurable (`RUN_CONCURRENCY`, default 4). Remember effective
  in-flight calls ≈ concurrency × per-item fan-out (a judged panel fans 3 judges).

### S2 — Resilient provider clients
Every LLM HTTP client (`gemini.ts`, `openai.ts`, …) MUST:
- Retry the full transient HTTP set: **429, 500, 502, 503, 504** (not just 429/500/503).
- Retry **thrown network errors** too (`fetch failed`, timeout/abort, ECONNRESET) —
  wrap the `fetch` in try/catch *inside* the retry loop, not just response-status checks.
- Use exponential backoff with an **injectable base** (`backoffBaseMs`) so retry
  logic is unit-testable in milliseconds, not real seconds.
- Surface a clear error after `maxRetries` (include status/finishReason in the message).

### S3 — Guard every orchestration seam: degrade, don't crash
A long run (hundreds of calls) must never die from one failed call. Every injected
seam (`deploy`/`evaluate`/`propose`, judge-per-item) must isolate failure:
- Per-item judging: catch → record an `error` score, keep going (don't fail the batch).
- `propose` (mutation): catch → **return the incumbent** (round becomes a no-op →
  rollback → loop survives). Also discard empty/too-short proposals.
- Rule of thumb: ask "if this one call throws, does the whole run die?" If yes, wrap it.

### S4 — Thinking-model token budgeting
Thinking models spend output tokens on hidden reasoning *before* the answer. A low
`maxTokens` (e.g. 4000) can be fully consumed by thinking → empty response with
`finishReason: MAX_TOKENS` → throw. **Budget output ≈ 4–8× the expected answer
size** for thinking models. (Proposer rewrite of a ~2k-token prompt → use ≥16000.)

### S5 — Cache invariant baselines in eval loops
In iterative eval/optimization loops, re-measure only what changes between
iterations. The autocorrect loop only mutates the ③ panel, so the ①/② floor is
measured once per split and cached (`applyFloorCache` + `runTests({panelIds})`).
Re-measuring invariants is pure waste (was 2× cost).

### S6 — Pure-logic extraction for testability
Extract decision/merge/transform logic out of I/O wrappers so it's unit-testable
without network: `applyFloorCache`, `mapWithConcurrency`, `toVerdict`, `splitMargin`.
Every integration seam needs at least pure-logic coverage. Never ship orchestration
glue with zero tests (lab/server was typecheck-only and the loop crashed twice in
ways tests would have caught).

### S7 — No fabricated data in user-facing surfaces
Never render mock/placeholder scores, metrics, or content in the UI — even labeled
"MOCK". It reads as broken and erodes trust. Use empty-state call-to-actions instead.
Keep fixtures in tests, not in shipped components.

### S8 — Observability in long runs
Long/expensive runs must emit: **timestamps** per phase, a **heartbeat** (so "is it
hung?" is answerable without forensics), and a **final structured summary** (per-round
means, KEEP/ROLLBACK, stop reason). Lack of timestamps forced phase-timing via
score-file mtimes this session.

### S9 — Debugging discipline (process)
- **Judge progress from evidence, not a summary grep.** A loop that logs round
  summaries only on completion will look "stuck on round 0" mid-round. Check log
  **mtime + tail + per-item lines**, not just `grep "round N"`.
- **Reproduce against the actual component before blaming it.** The typo-tolerance
  "index bug" was disproven by querying the index directly (it was healthy). Get
  evidence first (systematic-debugging).
- **Keep a non-MCP fallback.** MCP tokens get revoked (401). Fall back to the REST
  API with keys from `.env.local`.
- **0% CPU ≠ hung** for I/O-bound work — it's blocked on the network. Liveness =
  log advancing, not CPU.

---

## Pre-Run Checklist (before any long/expensive run)

Run through this before launching anything that makes >~50 LLM calls or runs >5 min:

- [ ] **Smoke first.** Run the `--smoke` / tiny-`--ids` path end-to-end. It exercises
      the real seams cheaply and catches wiring/crash bugs before you burn hours.
- [ ] **Parallelism on?** Confirm batches use `mapWithConcurrency`, not sequential awaits.
- [ ] **Retry coverage?** Provider client retries {429,500,502,503,504} + network throws.
- [ ] **Token budgets?** `maxTokens` covers thinking + answer for thinking models.
- [ ] **Seams guarded?** A single failed call degrades gracefully (no whole-run crash).
- [ ] **Baseline cached?** Invariants measured once, not per iteration.
- [ ] **Provider consistency.** `cli provider` → all agents + judge on the same provider.
- [ ] **Run in background + log to a file** with timestamps; note the pid and log path.

---

## Failure Catalog (symptom → cause → fix → runbook)

| # | Symptom | Root cause | Fix shipped | If it recurs, do this |
|---|---------|-----------|-------------|----------------------|
| F1 | Run "stuck", round 0 takes hours | Sequential `await` over (questions × panels) on a slow thinking model | `mapWithConcurrency` in `judgeStep.ts` + `runTests.ts`; `RUN_CONCURRENCY` (S1) | Confirm the batch uses the concurrency map; raise `RUN_CONCURRENCY` (watch rate limits); check it's not actually progressing (S9) |
| F2 | Loop ~2× slower than expected | Re-measuring the fixed floor every round | Per-split floor cache `applyFloorCache` + `runTests({panelIds:[ours]})` (S5) | Verify rounds >0 log "ours only — floor cached" and run 1 panel |
| F3 | **Run crashes** mid-orchestration: `Gemini returned empty text (finishReason=MAX_TOKENS)` | Thinking model ate a too-small `maxTokens` budget → empty → threw → unguarded seam | Proposer `maxTokens` 4000→16000; guard `propose` (try/catch → incumbent); discard <200-char proposals (S3, S4) | `grep -iE "finishReason\|empty text\|Error" <log>`; raise `maxTokens` on the failing call; wrap the seam to degrade |
| F4 | Some scores are 0/error; transient `fetch failed`, `Gemini 502` | Retry set missed 502/504 + network throws escaped the loop | `gemini.ts` retries {429,500,502,503,504} + catches network throws; injectable `backoffBaseMs` (S2) | Check the adapter's retryable set + that `fetch` is inside try/catch; add the missing code |
| F5 | "Is the loop even correct?" — no trust | Live adapters + cache had zero tests (typecheck-only) | Extracted pure fns + tests; `lab/server` runs vitest, tsconfig excludes `*.test.ts` (S6) | Add a pure-logic test for the seam in question; run `vitest` via `../judge/node_modules/.bin/vitest` |
| F6 | Misjudged run state / wrong root cause | Inferred progress from a summary grep; blamed a component without reproducing | Process discipline (S9) | Re-check via mtime+tail+per-item; reproduce against the real component before fixing |
| F7 | Can't time phases / "is it hung?" | No timestamps/heartbeat/summary in the run log | (Standard S8 — to implement) | Use score-file mtimes as a stopgap; add timestamps + heartbeat + final summary |
| F8 | Fake judge scores on UI launch | Idle state defaulted to `MOCK_ANALYSIS` | Idle → call-to-action; removed `MOCK_ANALYSIS`/`isMock` (S7) | Grep components for mock/placeholder constants rendered outside tests |

---

## Reference — key files

- `lab/server/src/concurrency.ts` — `mapWithConcurrency` (S1) + tests.
- `lab/server/src/gemini.ts` — resilient provider client (S2) + tests.
- `lab/server/src/autocorrectAdapters.ts` — `applyFloorCache` (S5), guarded `propose` (S3) + tests.
- `lab/server/src/judgeStep.ts`, `runTests.ts` — parallelized batches (S1).
- `lab/server/src/config.ts` — `RUN_CONCURRENCY`, `JUDGE_ROUNDS`.
- Run the harness tests: `cd lab/server && ../judge/node_modules/.bin/vitest run`.

## Related findings
- `docs/experiment/finding-typo-tolerance-false-refusal.md` — verbose reformulation
  × index `allOptional` over-broadening (a product-side reliability lesson).
