# Algolia Answer-Quality Lab

A lab for **proving and improving answer quality** on Algolia's content. It pits three systems against each other on the same question, scores them with a blind AI judge, and runs an eval-driven loop to make the best one better.

**Live prototype:** https://algolia-contentsearch.vercel.app/

---

## What it does

One question → three answers, side by side:

| Panel | What it is |
|-------|-----------|
| **① Current Website Search** | Live algolia.com keyword search (captured by a Playwright backend harness) — the "old world" reference. |
| **② Ask AI** | Algolia's default Ask-AI prompt on the faithful (untuned) index — the **quality floor**. |
| **③ Our System** | An optimized, strictly-grounded agent on a tuned index — the **system under test**. |

Two reusable engines drive the science:

- **AI Judge** (`lab/judge/`) — three blind judges (Skeptic / Referee / Advocate) + a Chief Synthesizer score each answer on a weighted rubric, with a **grounding hard-gate**. Multi-round aggregation produces a stable score: it averages the reproducible pre-gate score and decides the grounding gate by a **supermajority vote** (a one-off flag can't swing the verdict). Provider-agnostic (Gemini or OpenAI behind one seam).
- **Autocorrect loop** (`lab/autocorrect/`) — a Karpathy-style AutoResearch loop: judge → diagnose the weakest dimensions → mutate the system's config → re-test → keep-if-better, with a held-out overfit guard and explicit stopping criteria. *(Decision core built + tested; orchestrator WIP.)*

The grounding rule is non-negotiable: every factual claim must trace to the index, or the answer refuses and routes. Beating keyword links is trivial — the real bar is beating Algolia's own generated Ask AI **without ever fabricating**.

---

## Repo layout

```
web/            React + Vite + TS prototype (the 3-panel UI)  ← deployed to Vercel
lab/
  judge/        AI Judge — pure, provider-agnostic, unit-tested
  autocorrect/  Autocorrect loop decision core (pure, tested)
  server/       Node harness: run-tests → judge → summary; Gemini/OpenAI providers
  capture/      Playwright capture of live algolia.com search + Ask AI
scripts/setup/  Agent Studio admin (deploy prompts), index optimizer
docs/           Plan, API reference, experiment methodology, results
SESSION.md      Live working state (start here to resume work)
```

## Running locally

**Prototype (the 3-panel UI):**
```bash
cd web && npm install && npm run dev      # http://localhost:5173
```
Needs `web/.env.local` with the `VITE_*` vars (search-only Algolia keys + agent/index IDs). Not committed — see `web/.env.local.example` pattern in the env table below.

**Backend harness (batch test + judge):**
```bash
cd lab/server
npx tsx src/cli.ts run-tests              # all locked questions × 3 panels → transcript
npx tsx src/cli.ts judge <runId>          # AI Judge scores the transcript
npx tsx src/cli.ts summary <runId>        # score table
```
Needs root `.env.local` with `GOOGLE_API_KEY` (Gemini judge, default) and Algolia admin keys. Judge model: `gemini-2.5-pro` (override with `JUDGE_MODEL` / `JUDGE_PROVIDER`).

**Tests:**
```bash
cd lab/judge && npx vitest run            # AI Judge (50 tests)
cd lab/autocorrect && ../judge/node_modules/.bin/vitest run   # loop core (16 tests)
cd web && npm test                        # UI (27 tests)
```

## Environment variables (web app — all `VITE_*`, search-only / public by design)

| Var | Purpose |
|-----|---------|
| `VITE_OURS_APP_ID` | Our build app id |
| `VITE_OURS_SEARCH_KEY` | Search-only key for our agents |
| `VITE_AGENT_MIRROR_ID` / `VITE_INDEX_MIRROR` | ② Ask AI agent + index |
| `VITE_AGENT_TUNED_ID` / `VITE_INDEX_TUNED` | ③ Our System agent + tuned index |
| `VITE_INCUMBENT_APP_ID` / `VITE_INCUMBENT_SEARCH_KEY` / `VITE_INCUMBENT_INDEX` | ① incumbent (read-only) |

Server/LLM keys (`*_ADMIN_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`, …) live in the **root** `.env.local` and are **never** sent to the browser.

## Status & honest caveats

- **First verdict (16-question dev set, Gemini judge):** ③ Our System mean **7.44** vs ② Ask AI **4.59** vs ① Website **3.16**. ③ wins mainly on *grounding discipline* (② leaks on most questions); when both stay grounded they're roughly tied. ③ still trips the grounding gate on ~⅓ of questions — under active diagnosis.
- **In the deployed UI**, panels ② and ③ answer live (browser-direct to Agent Studio; ~20s each on the Pro model). **Panel ① and the judge/analysis panel are not live in the browser** — they require the Node backend; ① is shown as a labeled placeholder.
- Judge stability was proven on gpt-5.2; re-validation on Gemini is pending.

See `docs/experiment/ai-judge-methodology.md` and `SESSION.md` for full detail.
