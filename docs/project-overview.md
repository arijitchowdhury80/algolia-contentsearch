# Visibility Agents — Project Overview

> **Status:** DRAFT for review · **Date:** 2026-06-09 · **Owner:** Arijit Chowdhury
> This is the umbrella overview for the project. It captures purpose, decisions, the two-phase plan, the grounding contract, and the evaluation method. Phase-level implementation plans come later (one per phase). Everything here is open to your feedback before we lock it.

---

## 1. Purpose & North Star

Build a **strictly-grounded, two-way conversational agent** on Algolia's **Visibility** app (`1QDAWL72TQ`, content index `algolia-www-prod-v2`) that answers questions about Algolia **measurably better** than the current Algolia.com **Ask-AI**.

"Better" is not vibes. It means, on the same questions, our agent wins on a weighted rubric covering:

1. **Grounding / factual accuracy** — every claim traceable to the index (non-negotiable, see §5).
2. **Answer depth & quality** — more complete, more useful, better structured.
3. **Two-way engagement** — remembers the thread, answers, then asks one on-topic follow-up; runs discovery; "peels the onion" to the question behind the question.
4. **Human-likeness** — sounds like a sharp human, not a documentation bot.

The incumbent we're beating, Ask-AI, is **keyword search over one common index, not Agent Studio, no multi-agent, largely one-shot** (per the project brief and the live screenshot). Our edge is engagement + depth + airtight grounding — and eventually multi-agent depth.

> **Recon update (2026-06-09 — see §3.5):** the *live* Ask-AI matches the description above, but the Visibility app **also already contains** a newer, actively-maintained **Agent Studio** chatbot (`[Beta] Algolia.com Website Search/Chatbot`) that already does grounded, intent-aware, follow-up-asking chat on gpt-5.2. So "the incumbent" is now two things, and which one we A/B against is an open question (§12).

**Why this is winnable on the same data:** we hold keys to the *same* live app and index Ask-AI uses, so the A/B is apples-to-apples on identical content. The difference will be entirely in how we *engage* and *ground*, not in having better raw data.

---

## 2. The two reference systems (what we copy, what we don't)

We have two mature sibling systems ("Algolia Central", app `0EXRPAXB56`, index `algolia-central_enterprise_ledger`, on **NeuralSearch**). Both were studied in depth.

- **rc2-algolia** — `/Users/arijitchowdhury/AI-Development/RAG/AlgoliaRAG-Google/rc2-algolia`. **The quality bar.** Maverick (the coordinator) is **fully coded**; Elena/Bruno (specialists) are in Agent Studio.
- **rc3-phoenix** — `/Users/arijitchowdhury/AI-Development/RAG/AlgoliaRAG-Google/rc3-phoenix`. Maverick was **ported into Agent Studio**. Less code, but **lower answer quality**.

**Why rc2 out-answers rc3** (evidence-ranked, from the code study):

1. **Deterministic discovery state machine in code.** rc2 tracks the 8-signal discovery dossier in Redis with no-repeat logic, qualification thresholds, fatigue handling, and forced exactly-one follow-up per turn (`rc2 lib/search/orchestrator.ts`, `discovery_analyzer.ts`, `redis.ts`). Agent Studio must emulate all that bookkeeping from prompt text, which drifts.
2. **Mechanical grounding auditor that scrubs every paragraph before it streams** (`rc2 lib/search/content_auditor.ts:383-658`) — deletes any customer/metric/link not traceable to a retrieved source. Agent Studio can only be *told* not to hallucinate; rc2 *removes* hallucinations.
3. **Explicit retrieval orchestration** — context assembly, Atlas guidance, 3-tier fallback — produces richer, more on-topic grounding than Agent Studio's single-shot tool search.
4. **Full control of prompt structure, model, and temperature** (rc2 sets a "sandwich" prompt with final directives last, `temperature 0.7, maxTokens 8192`).

**What ports directly to keyword search (both refs agree):** the coded coordinator skeleton, the grounding auditor (arguably *more* valuable on noisier keyword relevance), the discovery engine, the consent-gated A2A handoff, `optionalFilters` boosting, and the entire eval harness.

**What does NOT port — the one big risk:** rc2/rc3 throw the **full natural-language query** at the index with `removeStopWords:false` because **NeuralSearch absorbs verbose conversational queries**. On a **keyword** index that tanks recall. We must engineer a keyword-query path instead (see §6).

---

## 3. The incumbent's data shape (for retrieval design)

The live `algolia-www-prod-v2` index spans these source categories (counts from the Ask-AI screenshot): Documentation (4177), Support (1691), Blog (918), Website (397), Developers (286), Resources (267), Academy (139), Customer Stories (77), Other (63) — ~8,015 records. This taxonomy directly informs the Phase 2 source-aligned specialists (§9).

---

## 3.5 What already exists on the Visibility app (recon 2026-06-09)

Direct inventory of app `1QDAWL72TQ`'s Agent Studio surface (`GET /agent-studio/1/agents`) found **15 agents** — this app is an active, shared workspace, not a blank slate. Key findings:

- **Canonical agent: `[Beta] Algolia.com Website Search/Chatbot`** (`id ebff018c-66e1-44df-b33a-2a58a0188840`, model **gpt-5.2**, **published**, created 2026-03-19, last updated **2026-06-03**). It is an **Agent Studio** agent — which *corrects the project's starting premise* that Ask-AI isn't on Agent Studio. Its `algolia_search_index` tool targets `ALGOLIA_WWW_PROD_V2`, with facets exposed (`source`, `tags`, `category`, `is404`). It has a model-based **guardrail** (topic-scoping to algolia.com) and prompt-suggestions config.
- **Its prompt already implements much of our Phase 1a design, at the prompt level:**
  - **Strict grounding + strict-refuse fallback** ("do not answer from prior knowledge when retrieval is empty"; canned "didn't find anything, but you might like…" line) — aligns with our decision #6.
  - **Mandatory retrieval with keyword reformulation (3–8 keywords, not a full sentence)** — this is exactly the keyword-query-builder mitigation we flagged as the central risk in §6. They've addressed it in-prompt.
  - **Intent classification** (exploratory / evaluative / purchase) + **tone adaptation** (developer / business / buyer) — our "intent-first adaptive discovery" (decision #5).
  - **Answer-then-exactly-one-follow-up** loop with a "never repeat, always add value" response format, plus CTA routing (demo → Speak to an Expert, support → support portal).
- **An evaluation effort already exists here:** 7 `EVAL_*` ephemeral clones of the canonical agent across **gpt-5.2, gpt-5-mini, and claude-haiku-4-5** ("compliance-eval" / "source-model" clones). Someone is already running model-comparison evals on this agent.
- **A team is actively iterating:** human copies in flight — `(Peter copy)`, `(copy)`, `Website Chatbot (Testing) (Shahmir's copy)`, `(Tanya's copy)` — plus a `Shopping assistant` and a published `prompt-suggestions-ALGOLIA_WWW_PROD_V2`.

**Implications for the plan:**
1. **A possible starting point — to be earned, not assumed.** The Beta encodes much of Phase 1a's behavioral layer in-prompt. Whether we clone-and-improve it or start clean is a **data-gated decision** (see §3.6 teardown + §7a Stage 0), not a foregone conclusion.
2. **We're in a shared, live workspace.** Namespacing (`visibility-agent-*`) and not disturbing others' published agents is a hard operating rule, not a nicety.
3. **Reuse signal for evals.** There may already be a Visibility-side eval harness we can reuse instead of (or alongside) Central's; the model-comparison clones also give early signal on model choice (§12).

## 3.6 Beta agent teardown (initial, 2026-06-09)

A first read of the canonical Beta (`ebff018c`) and the longest copy variant (`3fdcf4e2`, which still points at the older `ALGOLIA_WWW_PROD` index but adds tool-managed CTA flows). **This is not a verdict** — the take-vs-rebuild call is data-gated (§7a Stage 0).

**Strong already (in-prompt):** strict grounding + strict-refuse fallback; keyword reformulation (3–8 keywords); intent classification + tone adaptation; answer-then-one-follow-up with a no-repeat format; tool-managed CTA (email gating + meeting scheduling, in the copy variant); model guardrail + facets exposed to the search tool (`source`, `tags`, `category`, `is404`).

**Gaps vs our bar — and note each is something Agent Studio *structurally* can't do (= our Stage-2 code scope):** no **mechanical grounding auditor** (grounding is asked-for, not enforced — the #1 gap vs the 110% non-negotiable); no **deterministic discovery state machine / dossier**; no **persistent memory** beyond the chat window; no **index-side keyword tuning** or **retrieval fallback ladder**; no **mechanical citation enforcement**; shallow 3-bucket discovery; variants split across `PROD` vs `PROD_V2` indices (tech debt).

**Read, pending audit:** the behavioral layer looks ~60–70% there and may be worth not re-deriving; the real quality delta lives in the code-only gaps. The Stage-0 audit decides build-on-it vs start-clean — on the numbers.

---

## 4. Locked decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | **Win condition** | LLM-judge harness (fast iteration, reused from Central) **+ blind human/SME panel** (authoritative verdict). |
| 2 | **Build target** | Live app `1QDAWL72TQ`. All our artifacts namespaced `visibility-agent-*`. Real `algolia-www-prod-v2` index is **read-only** to us. |
| 3 | **Coordinator build path** | **Prototype in Agent Studio** (validate the loop on keyword data fast) → **harden into coded coordinator** (rc2-style) for quality. |
| 4 | **Retrieval source** | **Copy `algolia-www-prod-v2` → `visibility-www-prod`** (our tunable index, same content). All config changes (synonyms, settings, Atlas companion) happen on the copy; the live index stays **read-only**. Ask-AI keeps hitting the untouched live index. |
| 5 | **Discovery mode** | **Intent-first adaptive** — detect why they're here (evaluate / implement / troubleshoot / learn), qualify sales-style only on a genuine buying journey. |
| 6 | **Grounding edge** | **Strict refuse + route.** No adjacent-vertical fallback (stricter than rc2). Facts only from the index; never training data. |
| 7 | **A/B incumbent** | The **live keyword Ask-AI** (the shipped algolia.com search — keyword, non-Agent-Studio, one-shot). Clean old-world-vs-new-world comparison. |

> **Guiding principle (set 2026-06-09):** every architectural choice — start-point (clone vs clean slate), index design, model, multi-agent — is decided by **data and answer quality**, never by assumption. Where this doc states a recommendation, it is a hypothesis to be proven, not a settled call.

---

## 5. Grounding contract (the non-negotiable)

**Rule:** the agent knows *only* what the current retrieval returned. Its training data "does not exist" for factual claims. If the answer isn't in the index, it says so and offers to route — it does **not** stretch to the closest match.

Enforced in three layers (adapted from rc2, hardened):

1. **Prompt layer** — a zero-hallucination directive placed last (recency bias): "your training data does not exist; a named entity without a source link is a hallucination; no external sources (Gartner/Forrester/etc.)." (Pattern: `rc2 prompts/maverick.ts:107-121`.)
2. **Deterministic retrieval bias** — discovery signals extracted by regex (not LLM) drive `optionalFilters` boosts; the *retrieval steering itself* never hallucinates (`rc2 signal_extractor.ts`).
3. **Mechanical post-hoc auditor** — every paragraph is checked **before it streams**: links classified against the retrieved source pool and stripped if untraceable; customer/metric/quote claims validated against source text; ungrounded sentences removed or rewritten (`rc2 content_auditor.ts:521-611`). **This is the layer Agent Studio can't replicate — and the reason we harden in code.**

**Boundary behavior (decision #6):** no grounded answer → graceful refusal + route. Simpler than rc2 (we delete the "rescue adjacent" path). The UX cost (refusing feels less helpful than Ask-AI's confident-but-loose answers) is managed on the **retrieval** side: make retrieval good enough that refusals are rare.

**This contract is the literal scoring gate.** In the eval, a leaked/ungrounded claim is a critical failure, not a deduction (mirrors `rc2 eval/test-cases.ts:42-44`).

---

## 6. The central technical risk: keyword vs neural retrieval

This is the make-or-break of Phase 1. Central relies on NeuralSearch to make sense of conversational queries; Visibility is keyword. Our mitigations:

- **Keyword-query builder** — extract tight keyword/entity queries from the conversational turn instead of passing raw natural language. (rc2's signal extractor already produces a `keyword_query` field we can use; `rc2 prompts/brain.ts:154`.)
- **`removeStopWords: true`** on our copy index (opposite of rc2's neural setting), plus typo tolerance and **synonyms** tuned to Algolia's domain vocabulary.
- **Re-tune `relevancyStrictness`** — rc2's `80` is a neural knob; recalibrate for keyword.
- **Remap searchable attributes / facets** to `algolia-www-prod-v2`'s actual schema (rc2's `title`/`content` + `industry_tags` are enterprise-ledger-specific).
- **Forward-looking:** when Visibility moves to NeuralSearch later, these become *additive* — quality only goes up.

We tune all of this on our **copy** index (`visibility-www-prod`), never the live one.

---

## 7. Phase 1 — prove the single agent is *better*

### 7a. The engagement agent

One **intent-first adaptive, strictly-grounded** front-door agent with genuine two-way engagement. Built in **data-gated stages** (start-point decided by audit, not assumption):

- **Stage 0 — audit the Beta + the index, decide the start-point on data.** Before assuming we clone, prove it: evaluate whether the Beta agent (`ebff018c`) is genuinely well-built — prompt quality, tool/facet config, guardrail — **and** whether the index is configured optimally for our needs. Method: run the Beta against an initial question set through the judge harness, inspect its retrieval quality, and inspect the index settings on `visibility-www-prod`. **Scores well + config is sound → clone & improve. Falls short → clean slate.** Either way the decision is data-proven. (The §3.6 teardown shows promise *and* real gaps; the audit settles it.)
- **Stage 1 — Agent Studio prototype.** Per Stage 0's verdict, stand up our Stage-1 agent (cloned-and-improved, or fresh-built) on the `visibility-www-prod` copy index. Goal = **a working, grounded baseline fast + surface remaining keyword-retrieval gaps.** Not expected to hit the full quality bar — Agent Studio can't do the mechanical grounding scrub or deterministic discovery; those come in Stage 2.
- **Stage 2 — coded coordinator (rc2-style).** Port to custom code to reach the bar:
  - **Conversation memory** — server-side session state (Redis-style), accumulating the discovery dossier across turns (not stateless prompt replay).
  - **Discovery engine** — intent detection first; then signal extraction + no-repeat + forced single on-topic follow-up per turn; qualification only on a buying journey.
  - **Retrieval** — the keyword-query path from §6 against `visibility-www-prod`.
  - **Grounding auditor** — the mechanical pre-stream scrub from §5.
  - **Human voice** — sharp, helpful, not a bot; tone owned in our prompt.

**Definition of done for 7a:** wins the A/B vs Ask-AI on the rubric (judge) AND the human panel prefers it, with **zero ungrounded claims** in the test set.

### 7b. Index-architecture experiment (decided by data, not opinion)

Answer one question with evidence: **does a single index or an Atlas-style two-step yield measurably better answers on Visibility?**

- **Arm A — single index.** Retrieve from `visibility-www-prod` directly (mirrors today's Ask-AI architecture, but with our query builder + grounding).
- **Arm B — Atlas + main (two-step).** Build a small, hand-curated **Atlas companion index** (a "map": canonical entities, URLs, proof points) used to (1) disambiguate what the user means and grab a guaranteed-valid citation, and (2) focus/boost the main-index query. (Pattern: `rc2 retrieval_orchestrator.ts` two-step + `data/map.json`.)
- **Method:** run the same golden question set + judge harness against both arms; compare grounding, depth, and citation validity. **Pick the winner on the numbers.** Document the decision as an ADR.

**Open sub-question:** what populates Atlas for the Visibility domain (Algolia.com content) — and is curating it worth the lift vs the single-index gain? The experiment answers this.

### 7c. The webapp & A/B harness (the Phase 1a vehicle)

Everything in Phase 1 is delivered through one Algolia-branded webapp: a chat box for our agent **plus a built-in side-by-side A/B** that fires the same query at four columns simultaneously, each labeled `Index: … | Agent: …`.

**The four columns (recon-verified 2026-06-09):**

| # | Index | Answering system | Proves |
|---|---|---|---|
| 1 | their `ALGOLIA_WWW_PROD_V2` | live keyword search (Surface 1) | old-world reference |
| 2 | their `ALGOLIA_WWW_PROD_V2` | Beta agent `ebff018c` | agent baseline |
| 3 | their `ALGOLIA_WWW_PROD_V2` | our agent | **agent effect** (2 vs 3) |
| 4 | our `visibility-www-prod` | our agent | **index effect** (3 vs 4); **old-vs-new** (1 vs 4) |

**What production Ask-AI actually is (recon).** Two distinct surfaces, previously conflated:
- **(a) Homepage search** = plain keyword InstantSearch, **no generated answer** — `POST https://1qdawl72tq-dsn.algolia.net/1/indexes/*/queries`, app `1QDAWL72TQ`, index `ALGOLIA_WWW_PROD_V2`, public search key. This is our **column-1 incumbent** (matches the brief).
- **(b) Docs "Ask AI"** = a generated-answer RAG on a **different app/index** — `POST https://askai.algolia.com/chat`, app `H467ZOT0O1`, index `algolia-docs-markdown`. **Not** the incumbent (different content); optional quality-bar reference only.
- No `agent-studio/.../completions` traffic seen in production www. Exact call shapes in Appendix A; evidence screenshots in `docs/recon/`.

**Webapp architecture decisions:**
- **Topology:** **browser-direct** to Agent Studio for Stage 1 (no backend). A **backend is introduced at Stage 2** when we harden the coordinator + grounding auditor. Grounding/coordinator logic runs **client-side** in our own app for the prototype.
- **Stack:** **fresh** — **React + Vite + TypeScript** (resolved from the design system at `/Users/arijitchowdhury/AI-Development/Algolia-Design-System`, which ships React/JSX UI kits + CSS-variable tokens). Style via its `colors_and_type.css` tokens; port the **`dashboard` UI kit** (app-console style fits the chat + A/B better than the marketing kit). Use the bundled **`algolia-design` skill** during the frontend build. **Port-don't-rebuild** rc2's eval harness, grounding-auditor logic, and discovery state machine.
- **Namespacing:** our agent + index are `visibility-agent-*` / `visibility-www-prod`; never write the live index.

**Dependencies before build:** the Algolia **design system** (decides framework + visuals); the index copy `visibility-www-prod`; our Stage-1 agent (clone-or-build per §7a Stage 0); the captured keyword + agent call shapes (Appendix A).

**Eval tie-in:** the A/B harness is also how we capture transcripts for the judge + human panel (§10).

---

## 8. Phase 1 → Phase 2 gate

**Phase 2 does not start until Phase 1 has won.** Concretely: the single agent beats Ask-AI on the judge rubric and the blind human panel, the grounding contract holds at zero violations on the test set, and the 1b architecture decision is made and recorded. Only then do we invest in multi-agent depth.

---

## 9. Phase 2 — prove multi-agent makes it *even better*

After the single agent wins, test whether **purpose-built, source-aligned specialists + A2A orchestration** raise quality further.

- **Source-aligned specialists** — one per high-value source cluster from §3, e.g. **Docs/Developers**, **Support**, **Academy**, **Customer Stories**. Each is a purpose-built Agent Studio agent with a scoped knowledge charter — deeper, more authoritative answers in its lane than a generalist.
- **Orchestration** — the coded front-door agent stays "the hub": it runs discovery, decides when a specialist is warranted, and hands the baton with a **full context dossier** so the specialist never re-asks. (Pattern: rc2 consent-gated handoff with handshake, `orchestrator.ts:500-560, 877-920`.)
- **A2A contract & guardrails** — define the handoff envelope (scope summary + signals), the transport (rc2 calls Agent Studio over HTTPS at `/agent-studio/1/agents/{id}/completions`), a **consent gate** before deep dives, deterministic routing override (don't fully trust the LLM's pick), and — critically — **the same grounding auditor runs on specialist output too** (rc2 wires the auditor into the specialist stream).
- **Research needed before building:** which A2A standard/pattern to commit to (native Agent Studio agent-to-agent vs coded orchestration of Studio agents — rc2 chose the latter for quality), and how multi-agent affects the grounding guarantee and latency.
- **Measure:** re-run the A/B; does specialist depth beat the single agent (and Ask-AI) by a meaningful margin, without breaking grounding?

---

## 10. Evaluation & A/B methodology

Reuse Central's harness — it's mode-agnostic and already built (`eval/judge.ts`, `harness.ts`, `compare.ts`).

- **Golden question set** — a locked, versioned set of multi-turn questions representative of algolia.com's mixed audience (evaluate / implement / troubleshoot / learn). Immutable once set, so scores are comparable over time.
- **Weighted binary rubric** — checks for: zero ungrounded claims (critical ×2), every named entity cited with a valid source link, answer depth, ends with an on-topic follow-up, intent correctly detected, (Phase 2) correct specialist invoked.
- **LLM judge** — deterministic (temp 0, YES/NO + reason), for fast iteration.
- **Head-to-head** — point the harness at **both** our agent and Algolia.com Ask-AI on the same questions; `compare.ts` produces per-check deltas (FIXED / REGRESSED).
- **Human/SME panel** — blind side-by-side pairs (ours vs Ask-AI, unlabeled); panel preference is the **authoritative verdict** that gates Phase 2.

---

## 11. Tech approach (high-level, from rc2)

- **Coordinator:** custom code (TypeScript), server-side session state, SSE streaming, mechanical grounding auditor.
- **Specialists (Phase 2):** Algolia Agent Studio agents, called over HTTPS.
- **Retrieval:** `algoliasearch` v5 SDK (or the documented REST endpoints — see `docs/algolia-api/`) against `visibility-www-prod` (+ Atlas companion if 1b picks Arm B).
- **LLM:** BYOL. Model TBD (see open questions) — Central uses Gemini; we may prefer a top-tier model for quality. Owned prompt + temperature.
- **Local API reference:** `docs/algolia-api/` (already built) is our source of truth for every Algolia call.

---

## 12. Risks & open questions

**Risks**
- **Keyword retrieval quality** (§6) — the primary risk. Mitigated by the query builder + synonyms + tuning on our copy index; validated early in the Stage 1 prototype.
- **Strict-refuse UX** — refusing too often loses on perceived helpfulness. Mitigated by retrieval investment; monitored in the human panel.
- **Building on a live prod app** — mitigated by namespacing + read-only treatment of the real index. (Flagged; accepted.)
- **Two reference codebases are mid-migration** — anchor on rc2 for the coordinator, ignore rc3's deprecated custom code.

**Open questions (to resolve before/within the relevant phase)**

*Newly raised by the 2026-06-09 recon (§3.5) — decide soonest:*
1. **Start point: clone-the-Beta vs clean slate** — **decided by the Stage-0 audit** (§7a), not by assumption. Resolve once the audit data is in.
2. **Eval harness reuse** — is there an existing Visibility-side compliance-eval harness (implied by the `EVAL_*` clones) we should reuse, vs porting Central's `judge/harness/compare`?
3. **Team coordination** — `(Peter/Shahmir/Tanya)` copies suggest an internal team owns this agent. Are they collaborators we align with, or is this an independent track?

*Original open questions:*
5. **Model choice** for the coordinator. Early signal: the existing evals compare **gpt-5.2 / gpt-5-mini / claude-haiku-4-5**; the Beta runs gpt-5.2. Decide whether to evaluate stronger models (e.g. top-tier Claude/GPT) for quality.
6. **"Win" margin** — how much better than the incumbent counts as winning (rubric delta threshold + panel preference %)?
7. **Golden question set** — who authors it, how many, sourced from real Ask-AI traffic or hand-built?
8. **Human panel** — who's on it, how many pairs, scoring scale.
9. **Atlas content** for Visibility (1b Arm B) — what curates it, how much lift justifies the lift.
10. **Conversation memory infra** on the live-app constraint — Redis (as rc2) or alternative.
11. **Phase 2 A2A standard** — native Agent Studio agent-to-agent vs coded orchestration of Studio agents.

---

## 13. Glossary

- **Ask-AI** — Algolia.com's current search-answer feature (keyword, single index, one-shot). The incumbent we're beating.
- **Visibility** — our app context (`1QDAWL72TQ`), content index `algolia-www-prod-v2`. Keyword search today.
- **Central / Maverick / Elena / Bruno** — the reference system and its agents (sales coordinator, SE, SA). On NeuralSearch.
- **Atlas** — a small, hand-curated "map" index of canonical entities + proof points + valid URLs, used as a router and citation source-of-truth alongside the big content index.
- **Onion / discovery signals** — the dossier of things the agent extracts across turns to find the question behind the question.
- **Agent Studio** — Algolia's native platform for building/deploying agents (`askai` template).
- **Grounding auditor** — code that deletes any claim/link not traceable to retrieved sources before the answer streams.

---

## Appendix A — Recon: production call shapes (captured 2026-06-09)

Verbatim from live traffic; keys redacted. Use these to drive the A/B "incumbent" columns.

**Column 1 — live keyword search (homepage Surface 1):**
```
POST https://1qdawl72tq-dsn.algolia.net/1/indexes/*/queries
Headers: x-algolia-application-id: 1QDAWL72TQ ; x-algolia-api-key: <public search key 7f98…>
Body: {"requests":[{"indexName":"ALGOLIA_WWW_PROD_V2","query":"<q>",
  "filters":"language_code:en AND NOT is404:true AND NOT algoliaDisabled:\"true\"","page":0, …}]}
Returns: {"results":[{"hits":[…]}]}  (ranked list; NO generated answer)
```

**Column 2 — Beta agent `ebff018c` (Agent Studio, our "their agent"):**
```
POST https://1QDAWL72TQ.algolia.net/agent-studio/1/agents/ebff018c-66e1-44df-b33a-2a58a0188840/completions?compatibilityMode=ai-sdk-4
Headers: X-Algolia-Application-Id: 1QDAWL72TQ ; X-Algolia-API-Key: <key>
Body: { messages:[ …history, {role:'user', content:'<q>'} ] }
Returns: Vercel AI SDK data-stream (tool-call → searchIndex on ALGOLIA_WWW_PROD_V2 → streamed answer)
```

**Reference only — docs "Ask AI" (Surface 2, different app/index, NOT the incumbent):**
```
POST https://askai.algolia.com/chat/token   (app H467ZOT0O1, assistant fbh6yWWbVGct) → bearer token
POST https://askai.algolia.com/chat         (index algolia-docs-markdown; SSE Vercel AI SDK v5 stream)
Note: token is origin-bound to www.algolia.com + short-lived → not reusable; replicate as our own assistant if ever needed.
```

Columns 3 & 4 use **our** agent (Agent Studio completions, same shape as column 2) pointed at `ALGOLIA_WWW_PROD_V2` (read-only) and `visibility-www-prod` respectively.
