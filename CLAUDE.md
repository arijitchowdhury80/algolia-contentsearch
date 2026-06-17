# CLAUDE.md — Algolia-Central2 (Visibility Agents)

Lean project router. Global `~/.claude/CLAUDE.md` still applies. Keep this file a pointer index, not a content dump — detail lives in the docs below.

## What this project is
Build a strictly-grounded, two-way conversational agent on Algolia's **Visibility** app that beats algolia.com's live keyword **Ask-AI** on answer quality. Two phases: (1) prove a single agent is better, (2) prove multi-agent A2A makes it better still. Full plan → **`docs/project-overview.md`** (read this first).

## Read-first docs
- **`docs/project-overview.md`** — the plan: purpose, locked decisions, phases, grounding contract, eval method, open questions. Source of truth for *what* and *why*.
- **`docs/algolia-api/`** — local Algolia API reference (all APIs, MCP tool ↔ REST). Start at `00-index.md`; lookup via `99-mcp-tool-map.md`. Consult before any Algolia call.

## Non-negotiable
**110% grounded.** Every factual claim must be traceable to the Algolia index, or it doesn't ship. No training-data facts. No answer in index → strict refuse + route (no adjacent-fallback).
**Enforcement (revised 2026-06-10):** grounding is enforced by **the Agent Studio agent itself** — strict, hardened instructions (`scripts/setup/instructions_v2.md`) — and **verified empirically** by a bait-query harness (`scripts/setup/agent_admin.mjs bait`), NOT by custom client code. Custom code is kept minimal and confined to native Algolia. (The earlier plan mandated a mechanical code auditor; we removed it per the "minimise custom code / native-Algolia-only" steer. A server-side mechanical check returns only at Stage 2 IF bait data shows the agent leaks.)

## Decision rule
Every architectural choice — start-point, index design, model, multi-agent — is **data-proven by answer quality**, never assumed. Recommendations in the docs are hypotheses to validate.

## Apps & credentials (never hardcode keys — read `.env.local`)
| Context | App ID | Notes |
|---|---|---|
| **ARIJIT-TEST (OUR build home)** | `VVKSSPDMJX` (`ARIJIT-TEST_*`) | Full admin + Agent Studio. Our indices + agents live here. |
| VISIBILITY (incumbent, READ-ONLY) | `1QDAWL72TQ` (`VISIBILITY_*`) | Algolia's **live** app; keyword search. We only READ it (no `editSettings`). |
| CENTRAL (reference only) | `0EXRPAXB56` (`ALGOLIA_CENTRAL_*`) | NeuralSearch reference system |

Live index `ALGOLIA_WWW_PROD_V2` (uppercase!); `OPENAI_API_KEY` = Agent Studio provider key. **All current IDs (agents, provider, indices, search key) are in `SESSION.md`.**

## Hard operating rules
- We **build on `VVKSSPDMJX`** (we lack `editSettings` on the live app). The live `ALGOLIA_WWW_PROD_V2` on `1QDAWL72TQ` is **READ-ONLY** — never write it (it's the incumbent we benchmark).
- Our indices on VVKSSPDMJX: `ALGOLIA_WWW_PROD_V2` (faithful mirror) + `visibility_www_tuned`. Namespace our agents `visibility-agent-*`. Don't disturb the other team's agents on `1QDAWL72TQ`.
- Browser app ships a **search-only** key; admin/OpenAI keys are server/script-only, never bundled.
- Agent Studio = `https://{APP}.algolia.net/agent-studio/1/agents/...`. **Publish** via `POST .../{id}/publish`. Non-curl HTTP clients need a `User-Agent` header for `/agent-studio/*`.

## Reference codebases (inspiration, not to copy wholesale)
- **rc2 = the quality bar** — `…/AlgoliaRAG-Google/rc2-algolia`. Coded coordinator (Maverick): deterministic discovery state machine + mechanical grounding auditor + Redis memory. Specialists in Agent Studio. *Caveat: NeuralSearch — its full-NL-query + `removeStopWords:false` assumptions DON'T port to our keyword index.*
- **rc3** — `…/AlgoliaRAG-Google/rc3-phoenix`. Maverick ported into Agent Studio; lower quality. Reference for Agent Studio patterns + the reusable `eval/` harness.

## Workflow / current state
**PIVOTED 2026-06-12 → "Answer-Quality Lab".** Approved plan: `~/.claude/plans/i-think-the-whole-cheeky-moler.md` (NOT the old toasty-meandering-robin). 3 panels (① live website search · ② Ask AI = quality floor · ③ our optimized system) + two reusable skills (AI Judge `lab/judge/` ⇄ Autocorrect loop) to beat Ask AI on a locked 24-question set, then an Algolia-branded run report. Big-bang parallel build underway. **Read `SESSION.md` → "▶ RESUME (2026-06-13)" first.** (The earlier 4-column framing in `docs/project-overview.md` is superseded by the plan file.)

**UPDATE 2026-06-13:** Judge + Autocorrect are BUILT, zero-flicker-proven, and packaged as the reusable **`eval-loop/`** plugin (installed globally at `~/.claude/skills/{ai-judge,autocorrect-loop}`). Verdict corrected: ③ beats ② by only +0.73 (both gate ~70%), not the stale +2.85.

**UPDATE 2026-06-14 (latest — read `SESSION.md` → "▶ RESUME (2026-06-14)" first):** Lab UI now actually works — live judge + ① website panel wired (need local backend on :8787); Sample Questions panel built; autocorrect loop parallelized + hardened; reliability SOP at `docs/sop/llm-harness-reliability.md` ([[feedback-llm-harness-reliability]]). Clean autocorrect run = no mutation beat baseline (lever is RETRIEVAL, not prompt rewording; see `docs/experiment/finding-typo-tolerance-false-refusal.md`). **Big verified batch is UNCOMMITTED — first action next session = commit it.**
