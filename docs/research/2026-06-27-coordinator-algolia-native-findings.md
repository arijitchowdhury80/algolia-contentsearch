# Coordinator → Algolia-Native: Research Findings

_Date: 2026-06-27 · App: CENTRAL `0EXRPAXB56` · Method: 3 parallel research agents — official Algolia docs + RC3 prior research (`rc3-phoenix/docs/research/agent-studio-docs/`) + **live read-only API probes** on our app._

## Question
Why is our coordinator (`brain` / `discovery` / `baton` / `orchestrate`) custom code, and how much of it can become native Algolia Agent Studio / NeuralSearch?

## Live endpoint + capability inventory (probed on `0EXRPAXB56`)
- Resources that exist: `GET/POST /agent-studio/1/agents`, `GET /agents/{id}`, `/agents/{id}/publish`, `/agents/{id}/completions?compatibilityMode=ai-sdk-4`, `GET /providers`, and **nested** `GET /agents/{id}/conversations` (→ 200; 152 conversations already persisted on the maverick agent).
- **404 (do not exist):** top-level `/tools`, `/teams`, `/handoffs`, `/orchestrators`, `/workflows`, `/sessions`, `/memory`, `/templates`, `/functions`, `/skills`.
- Live agent config schema: `{id,name,description,status,providerId,model,instructions,systemPrompt,config,tools,templateType,createdAt,updatedAt,lastUsedAt}`.
  - `config: {"enableAlgoliaMcp": true}` — a single boolean. **No** `handoffs` / `subAgents` / `team` / `memory` / `router` field.
  - `tools[]`: `algolia_search_index` with per-index `searchParameters` (full Algolia search-param object; we use `filters` for source-scoping) + `enhancedDescription` (auto-carries the index's facets + searchable attributes to the LLM).
- The agent runs a **native multi-step tool loop**: one `/completions` call issued 2–4 tool searches / 7–14 hits and synthesized — all server-side.

## The six tool types (docs + live)
`algolia_search_index` · `algolia_recommend` · `algolia_display_results` · `client_side` (OpenAI function-calling) · `mcp_tools` (MCP servers, with `requiresApproval` flow) · `unknown`. **None calls another agent.** The search tool supports ≤10 indices, per-index + tool-level `searchParameters`, and query-time overrides via the completions body `{ algolia: { searchParameters: { "<indexName>": {…} } } }`. `config{}` natively supports `sendUsage`, `sendReasoning`, `temperature`, `max_tokens`, `reasoning`, `features` (our live agents only set `{enableAlgoliaMcp:true}`).

## Findings per coordinator piece

| Custom piece | Native? | Verdict + evidence |
|---|---|---|
| `agentRunner` (run one agent, parse stream) | Already native plumbing | It's the `/completions` wire client. Keep. |
| `brain.expandedQuery` (LLM rephrase → retrieval) | **NATIVE-COVERS → DROP** | NeuralSearch infers intent from raw NL (semantic vectors, zero keyword overlap). Live 5-query A/B: rewrite gave **no lift** in 3/4 cases; the 1 win was *vocabulary injection* (better via the native `synonyms` map). Rewriting also causes the documented false-refusal bug. Even Algolia's reference `grocery-enhance-query` agent does NOT rephrase the semantic query. |
| `brain.intent` (discovery/impl/arch/value) | **NOT native** | Native Query Categorization predicts *catalog categories* from a faceted hierarchy + needs click/conversion training; our content index has none. No sales-funnel intent taxonomy natively. Stays custom *if still consumed*. |
| `brain.entities` {brand,industry,product,concepts} | **NOT native** (content index) | No native NER. The enhance-query pattern only ports for fields mapping to real facets (brand→facetFilter) on a faceted catalog; AC2 content index has no such facets. Stays custom *if consumed*. |
| `brain.proposedQuestion` / `askedSignal` (Onion strategy) | **NOT native** | No analog. This is the real value. Keep. |
| `baton` routing + `orchestrate` handoff | **NOT native** | No handoff/team/orchestrator primitive (404s + no config field). An agent cannot call another agent. Stays custom. |
| `discovery` Onion state + dossier + `isQualified` | **NOT native** | No slots/qualification primitive. Live test: passing a conversation-id alone did NOT make the agent recall a prior turn (codeword test) — it's a transcript store, not a state engine. Stays custom, permanently. |
| Cross-turn memory | **NATIVE (on by default)** — see conflict note | Pass a stable conversation `id` (`alg_cnv_*`); `memory` is enabled by default (`?memory=false` disables; `?memory=true` is rejected/422). Live pronoun test: turn-2 "give me an example of **it**" resolved to turn-1 "faceted search" with NO replayed history → context carried natively. Caveat: our strict grounding instructions can still SUPPRESS recalled context (an off-corpus recall refused). |
| Conversation **persistence/store** | **NATIVE** | `GET /agents/{id}/conversations` → 200 live (152 stored on maverick); `GET /agents/{id}/configuration` → `{maxRetentionDays:90}`. Stores transcript + token/feedback metadata; **no** discovery-state fields. |

> **Cross-agent finding conflict (resolved).** `convo-state` reported memory as *stateless* (a "BANANA42 codeword" recall failed with conv-id only); `studio-native` reported memory *works* (a pronoun-coreference recall succeeded). Resolution: **memory carries context natively** — the pronoun test is dispositive (the referent could only resolve from turn-1 context), and convo-state's codeword failure was the **grounding gate suppressing an off-corpus secret**, not absent memory. Both agents independently saw the off-corpus refusal. A clean confirming test (open item): an *in-corpus* conv-id-only recall with `getRankingInfo`/memory toggled.

## Bottom line
Agent Studio natively gives a **single agent** with a multi-step tool/search loop, declarative retrieval config, NeuralSearch, and an MCP toggle. It does **not** give multi-agent handoff, a team/orchestrator, server-side memory, or a structured query-understanding API.

**Genuinely native-replaceable:** `brain.expandedQuery` (the agent + NeuralSearch already do this — highest-cost, highest-risk piece). **Optional wins:** native conversation IDs for free persistence (additive, safe); and — A/B-gated — leaning on native memory instead of manual `messages[]` replay (tradeoff: less context control + possible grounding suppression).

**Stays custom because no native primitive exists:** `brain`'s structured signals (intent/entities/Onion), `baton`/`orchestrate` multi-agent routing, and the `discovery` Onion state machine + dossier. **This is the legitimate answer to "why is the coordinator custom"** — Agent Studio's "orchestrator" is a *classifier + client-side routing*, which is exactly what `brain`+`baton` already are.

## Migration plan (proposed)
1. **Drop `expandedQuery`** — send the raw user turn to the agent; let NeuralSearch + the agent's tool loop handle retrieval. Recover the one vocabulary-win via the index `synonyms` map. Keep at most a thin multi-turn coreference rewrite ("what about pricing?" → "Algolia pricing").
2. **Adopt native conversation IDs** (additive, safe) — pass `alg_cnv_*` / `alg_msg_*` for free transcript persistence/observability. No behavior change; keep replaying `messages[]`.
2b. **(Optional, A/B only) lean on native memory** — pass a stable conversation `id` and stop manually replaying `messages[]` (memory is on by default). Tradeoff: less control over exactly what context is carried, and our grounding instructions can suppress recalled context (seen live). Our current explicit replay is safer + portable — only switch if an A/B shows native memory matches it.
3. **Keep** `discovery`, `baton`/`orchestrate`, and `brain`'s intent/entities/Onion — re-scope `brain` to: optional coref rewrite + Onion discovery strategy. Drop intent/entities only if nothing downstream consumes them once `expandedQuery` is gone (the judge's Coverage dim reads `brain.entities` — see Impact).

## Validate BEFORE deleting code (honest caveats)
- **Prove the semantic layer fires:** re-run the A/B with `getRankingInfo:true` and inspect `keywordScore`/`semanticScore`/`neuralScore` on raw NL queries. (Not yet captured.)
- **Authoritative quality check:** run raw-turn vs rewrite through the judge harness (`lab/judge/`) on the locked 24-Q set — the A/B was 4 pairs, not a scored eval.
- `.env.local` read was permission-denied for the controller; agents probed via one-off scripts (since removed).
- The "single agent with several source-scoped index tools could self-route, removing `baton`" idea trades determinism for nativeness — **A/B on answer quality, do not assume.**

## Impact on the judge "Confidence" spec (2026-06-27)
The judge's **Coverage** dimension sources its checklist from `dossier.signals` + `brain.entities`. Both **stay custom** per this research (intent/entities/Onion are non-native), so the judge spec's Coverage wiring is **unaffected**. Only `expandedQuery` is dropped — which the judge never used.
