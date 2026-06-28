# SESSION.md — Algolia-Central2

_Last updated: 2026-06-28 PM. This session = content-source multi-agent routing SPIKE → verdict KILL on scoping; data-hardened the corpus; drafted honed specialist prompts + warm-baton design. Mid-stream on the honed-prompt phase._

## ▶ STATUS (one line)
**Content-source SCOPING = KILLED** (no answer-quality lift over one all-source neural agent on a FAIR baseline: oracle ΔBA **+0.25**, within ±0.3 noise). Depth ceiling is the DATA (corpus = titles+summaries+facets; deep content only in **Support** + **"Other"**). **Now mid-stream on Path 1: honed purpose-built prompts + warm baton — about to push Support live and smoke-test it.** Working tree DIRTY (uncommitted). Prior milestones (Judge build, Backlog A, B) are on `main` `03e9184`.

## ▶ RESUME — first actions next session
1. Read this file. Then **continue the honed-prompt phase** (Arijit approved Path 1 + "Full fidelity" + "update live agents, snapshot first"). The immediate next step is item 2.
2. **PUSH SUPPORT + ADHERENCE SMOKE (the concrete next action):**
   a. **Snapshot** the 4 live specialists' current instructions to a file (reversible restore). Use the Agent Studio GET (`GET /agent-studio/1/agents/{id}` — instructions field) via a small script or `scripts/setup/agent_admin.mjs`. App = CENTRAL `0EXRPAXB56`, key = `ALGOLIA_ADMIN_API_KEY`. **List API paginates at 10 → use `?limit=100`.**
   b. **Push** the honed Support prompt (`scripts/setup/honed/instructions_support.md`, with `[[SHARED_GROUNDING]]` substituted from `_shared_grounding.md`) to `ac2-support-neural` via PUT/update + publish.
   c. **Smoke:** run 3–4 support questions (e.g. S1 "403 on indexing", 8.5, a billing/error Q) through `ac2-support-neural` and EYEBALL: does it follow the resolver doctrine (symptom→ranked causes→numbered fix→verify→escalation)? Does it leak JSON (like tech did on 1.3)? 
   d. **If adherent →** push the other 3 honed prompts, build the warm-baton multi-turn harness, run A/B vs `ac2-allsource-neural`. **If not →** fix adherence once, cheaply, before the full run.
3. Honest expectation to hold: Support (+ Marketer-on-"Other") may show real lift; Technical/Academy likely tie the baseline (their depth ceiling is the DATA, not the prompt). A tie there is a valid finding, not a failure.
4. Then decide **Path 2** (enrich the index with chunked full doc/lesson bodies) — the real unlock for deep Technical/Academy answers — only if the data ceiling visibly bites.

## ▶ WHAT HAPPENED THIS SESSION (the spike + data work)
- **Reframed the question:** AC2 is already single-specialist routing (fan-out retired). RC2 routes on persona/intent, NOT content-source — Arijit's "support→support agent" is a distinct, legitimate architecture. The 4 content-source specialists already exist on the app but were never wired.
- **A/B/C spike** (4-dim judge, 32 v3 Qs + 6 stress, 3 rounds): A=baseline, B=oracle-routed specialist, C=real-router specialist. Harness `lab/server/src/experiments/sourceRoutingAb.ts` + `sourceRouting/{labels,extraQuestions,classifier,routingAgg}.ts` (18 unit tests, full suite 127 green, tsc clean).
- **The flip = the lesson.** First run baseline = 6-source incumbent Maverick → +0.76 "multi-agent wins." That baseline is BLIND to Academy/Support (charter excludes them), so specialists won by default. Re-ran with a FAIR all-source baseline (`ac2-allsource-neural`, same MULTI_NEURAL index, NO source filter) → **+0.25 = KILL.** The +0.51 swing was pure baseline-blindness confound. [[feedback-ab-baseline-same-information-set]]
- **Data-hardening (n=1,000/source)** — Arijit insisted, correctly. Findings: corpus has NO full-body field; `description` depth varies hugely. **Support median 626 chars (70% deep); "Other" median 6,503 (55% deep); Documentation median 60 (96% stubs); Academy/Blog/Developers catalog-grade.** Corrected two of my own n=2 errors: Customer Stories 85% usable (not corrupted; 15% Oh Polly dup bug); "Other" is deep (not 1-line). **Facets reach the model** (verified via live tool-result dump: `facet1` industry + `facet6` features present in the agent's search results).
- **Honed prompts (data-realistic v3)** drafted: Support = deep resolver (data supports it); Technical = precise router + customer-story evidence; Academy = course curator; Marketer = value-frame + long-form on "Other"/Resources. Each + a shared grounding + warm-baton block.
- **Warm baton designed** (RC2-style): on handoff the specialist gets history + a dossier preamble (industry/product/stack/original ask) — never repeat. Baton = framing/retrieval context, NOT a grounding source (Algolia facts still must trace to hits).

## ▶ DECISIONS LOCKED THIS SESSION
1. Content-source SCOPING (cordon + same prompt) = no lift → KILLED. (Vault ADR `2026-06-28-content-source-routing-spike-verdict.md`, supersedes-in-part `2026-06-18-content-source-multi-agent`.)
2. Depth is DATA-bound; honing can only help where content is deep (Support, "Other").
3. Path 1 chosen: hone within data limits + warm baton, then test. (Path 2 = enrich index, deferred.)
4. Baseline for any fairness test = `ac2-allsource-neural` (same index, no filter), NOT the 6-source Maverick.
5. Customer Stories proof = text (85% ok) + facet1/facet6; never invented metrics.

## ▶ FILES WRITTEN THIS SESSION (all UNCOMMITTED)
- **Spike harness:** `lab/server/src/experiments/sourceRoutingAb.ts` + `sourceRouting/{labels.ts,extraQuestions.ts,classifier.ts,routingAgg.ts}` + 3 `.test.ts`. `lab/server/package.json` (`expt:sourcerouting` script).
- **Honed prompts:** `scripts/setup/honed/instructions_{support,technical,academy,marketer}.md` + `_shared_grounding.md`.
- **Baseline agent creator:** `scripts/setup/create_allsource_agent.mjs` (already RUN — `ac2-allsource-neural` live, id `26712546-8a6b-4a17-bd7d-18f7a7621746`).
- **Verdict doc:** `docs/experiment/2026-06-28-content-source-routing-verdict.md` + `source-routing-ab-{results.json,summary.md}`.
- **Lessons log:** `docs/sop/lessons-log.md` (+1 entry: A/B baseline-blindness confound).
- **Vault:** ADR + dev-log + open-questions + index + log under `Projects/algolia-central2/`.
- **Memory:** [[project-content-source-routing-killed]], [[feedback-ab-baseline-same-information-set]], [[project-ac2-agent-inventory-reality]], updated [[feedback-verify-facts-against-live-system]], session_pointer, MEMORY.md.

## ▶ WHAT HAS NOT BEEN DONE (no false-completion)
- Honed prompts NOT pushed live (drafts on disk only). NOT tested against any agent — adherence unproven (Agent Studio agents can mis-format, e.g. tech leaked JSON on 1.3).
- Warm-baton harness NOT built (designed only). Multi-turn A/B NOT run.
- Nothing committed to git this session (Arijit commits on request only). `ac2-allsource-neural` IS live on the app but NOT in `.env.local` (resolved by name).
- Customer Stories 15% dup bug NOT fixed.
- P2b human-rank judge calibration still open (the judge scoring all this is uncalibrated — treat scores as indicative).

## ▶ KEY FACTS / GOTCHAS
- App = CENTRAL `0EXRPAXB56`; keys in `.env.local` (read by scripts, not bash — secrets guard). `.env.local` is STALE for specialist ids → resolve agents BY NAME from `GET /agent-studio/1/agents?limit=100`.
- Index `AC2_WWW_MULTI_NEURAL` = the specialists' shared index (source-filtered per agent). `ac2-allsource-neural` = same index, no filter.
- Judge is INDICATIVE here: agent stream → harness keeps only `{title,url}` (no body), so grounding dim is directional; trust composite/coverage/depth deltas (symmetric). Flash-judge drops ~1–5 rows/run to JSON noise (excluded).
- Tests: `cd lab/server && npm test` (127 green) · `npm run typecheck` (clean).
