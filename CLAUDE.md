# CLAUDE.md — Algolia-Central2 (Visibility Agents)

> ⚠️ **CURRENT DIRECTION (2026-06-21) — AC2-RC2.** Everything below this banner is STALE (old VVKSSPDMJX / 3-panel / 2×2 framing). The live direction is the **AC2-RC2 pivot**: kill keyword → neural-only; rebuild RC2's quality on full Algolia infra + a reference-based judge (AC2 vs captured RC2 gold) + self-improving prompt loops. **Read `SESSION.md` (▶ RESUME 2026-06-21) first, then `docs/superpowers/specs/2026-06-21-ac2rc2-neural-rc2-replica-design.md`.** Home dir = THIS Dropbox copy (`-OLD` is abandoned). Build home app = CENTRAL `0EXRPAXB56`, indices `AC2_WWW_*`, agents `ac2-*`.

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

**UPDATE 2026-06-14:** Lab UI works — live judge + ① website panel wired (local backend :8787); Sample Questions panel; autocorrect parallelized + hardened; reliability SOP `docs/sop/llm-harness-reliability.md`. Clean autocorrect run = no mutation beat baseline (lever is RETRIEVAL; `docs/experiment/finding-typo-tolerance-false-refusal.md`).

**UPDATE 2026-06-17:** Lab UX redesign (ADR-001 D1–D4) DONE + PUSHED (origin/main `e4759d3`). **① queries Algolia browser-direct → works on the Vercel deploy (no backend).** PIVOT to product phase: POC with Adobe + Contentstack, then production on Algolia.com.

**UPDATE 2026-06-18 ~2:45am (latest — read `SESSION.md` → "▶ RESUME (2026-06-18 ~2:45am)" first):** Massive session, all SHIPPED + DEPLOYED LIVE (Vercel + VPS, `origin/main` @ `7939f73`): **(A)** ③ false-refusal FIXED (agent padded the keyword query with "Algolia"+framing words → off-topic reweight; bare concept term wins; live on `b5c4de23`); **(B)** judge → **3-dim composite** (grounding HARD-FLOOR+scored / confidence / breadth_depth, mean of 3 judges) + **permanent collapsible pinnable analysis RAIL** pushing full-width resizable lanes; then **judge SPEED+STREAMING** (live = gemini-2.5-flash + 1 round + parallel + SSE; 7-10min→~20s; batch stays pro=authoritative), **timing instrumentation**, and **TRANSPARENCY** (flagged-claim card + real config diff — [[feedback-show-dont-tell]]). **NEXT = run the batch `cli judge`** for the authoritative ③-vs-② scorecard (the live panel is thin-source-indicative, gates good answers to ~3.0). Memory: [[project-lab-live-deployed]], [[project-judging-multidimensional]], [[project-case3-refusal-diagnosis]], [[feedback-show-dont-tell]].

**UPDATE 2026-06-18 PM:** Ground-up **v2 refactor** designed — 2×2 four-panel lab ({single,multi}×{keyword,neural}), content-source multi-agent, grounding gate ×1, score-click judge drawer + Leaderboard. Design in `docs/refactor/` + vault `Projects/algolia-central2/`.

**UPDATE 2026-06-18 EVENING (LATEST — read `SESSION.md` → "▶ RESUME (2026-06-18 PM)" + "✅ UNBLOCKED" + "Plan HARDENED" first):** **THE PLAN IS WRITTEN + HARDENED** → `docs/superpowers/plans/2026-06-18-answer-quality-lab-2x2-refactor.md` (7 phases, model-tagged, self-contained, real code + acceptance criteria). **App corrected: build home = CENTRAL `0EXRPAXB56`** (`ALGOLIA_*`), NOT a new FLAGSHIP app — NeuralSearch + Agent Studio verified live; `ALGOLIA_ADMIN_API_KEY` in place + write-verified (lacks only `addApiKey`). **Naming LOCKED: indices `AC2_WWW_<ARCH>_<RETRIEVAL>`, agents `ac2-*`.** 5 review gaps closed (Arijit): Maverick = coded coordinator + native source-scoped specialists · register OpenAI+Gemini providers on `0EXRPAXB56` · unified `/api/answer` SSE endpoint · multi-turn = generated follow-up judged via `followUpQuality` · FAIRNESS INVARIANT (identical model+provider+grounding across all 4 panels). Brief/ADRs still say "FLAGSHIP" + old index names — **the PLAN overrides them.** **NEXT = fresh UltraCode build session** against the plan (Phase 0→7); recommended `/mode acceptEdits`. Memory: [[project-build-home-central-app]] (READ FIRST), [[project-v2-refactor-2x2-multi-agent]].

**UPDATE 2026-06-28 (LATEST — read `SESSION.md` first):** **Judge "Confidence" build COMPLETE → merged + pushed to `main` (`a3402bb`).** 4-dimension judge (Grounding/Coverage/Depth/Relevance, grounding hard-gate, `certainty` per-claim), standalone module — import `@lab/judge` / HTTP `npm run judge:serve` / CLI `npm run judge:cli` / `ai-judge-cli` skill. Engine `lab/judge/`, service `lab/server/src/judge/`. Tests judge 88 / server 101 / web 107. Spec `docs/superpowers/specs/2026-06-27-judge-confidence-refactor-design.md`. **Also proven (live):** Agent Studio has NO native multi-agent handoff → coordinator stays custom; findings `docs/research/2026-06-27-coordinator-algolia-native-findings.md`. **Deferred (optional):** P2b human-rank calibration (real trust gate; autonomous gate fails ~0.0) · backlog A (validate `expandedQuery` drop) · B (native memory) · P3 RC2 gym (SKIPPED). Memory: [[project-judge-coordinator-workplan]], [[feedback-decisive-execution-no-circles]].
