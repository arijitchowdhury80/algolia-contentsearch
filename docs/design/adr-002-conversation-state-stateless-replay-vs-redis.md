# ADR-002 — Conversation state: stateless replay + dossier, not a Redis store

**Status:** Accepted (2026-06-28) · **Decision owner:** Arijit · **Drafted by:** Claude (co-founder partner)
**Relates to:** Backlog B (`docs/research/2026-06-27-coordinator-algolia-native-findings.md`), rc2 reference architecture.

---

## Context

rc2 (the reference codebase) is a **stateful** coordinator: it persists the conversation + discovery dossier in **Redis**, keyed by session. AC2 deliberately did **not** port Redis — it is **stateless**: the client carries history and replays it as `messages[]` on each Agent Studio completion, and transcripts/scores are written to disk files (`store.ts`). The question raised: isn't resending context every turn wasteful, and was rc2's Redis architecture better?

Backlog B (2026-06-28) tested whether Agent Studio's **native** conversation memory could carry context turn-to-turn (which would remove the need to replay at all). It **cannot** via the server-side completions API — a same-conversation-id recall returns "you have not asked me a previous question" across all variants (client id / +5s persistence delay + message ids / server-returned id). The API exposes only an `alg_msg_*` id, never an `alg_cnv_*` conversation handle. (Probe: `lab/server/src/experiments/nativeMemoryProbe.ts`.)

## The misconception this ADR resolves

**Redis vs. `messages[]` replay is NOT a token-consumption tradeoff.** The LLM is stateless — at inference it must see the prior turns inside its context window regardless of where they are stored. Either the client resends them (replay) or the provider injects them (native memory); in both cases the model **processes the same history as input tokens**. Redis is a **storage layer** (where state lives between requests); replay is a **wire format** (how state enters the prompt). They are orthogonal. rc2's Redis was for **persistence/scale**, never for token savings.

Token bloat from long conversations is solved by **neither** — it is solved by carrying a **compact structured dossier** (`{industry, stack, scale, pain…}`, a few hundred tokens that don't grow) instead of the raw transcript. Both rc2 and AC2 already have this (`discovery.ts`). That — not the storage choice — is the token-efficient pattern.

## Decision

1. **AC2 stays stateless: `messages[]` replay + the compact dossier.** No Redis.
2. **Native Agent Studio memory is NOT used** as a context carrier (proven non-functional via completions; Backlog B).
3. **Token efficiency is owned by the dossier** (compact structured state), not by the storage layer or by raw-transcript replay.
4. **If/when a production multi-turn product needs persistence**, prefer (a) the dossier for context cost + (b) Agent Studio's **native transcript store** (`GET /agents/{id}/conversations`, 90-day retention — confirmed live) read-back-and-replay, over standing up Redis. Re-open only if a concrete requirement (cross-instance long sessions, server-side recall) demands a dedicated store.

## Rationale (rc2 Redis vs AC2 stateless)

| | rc2 (Redis store) | AC2 (stateless replay + dossier) |
|---|---|---|
| Token cost to the model | same | same |
| Conversation persistence | yes (restarts, multi-instance) | no (client carries it) |
| Infra to run/maintain | a Redis | none |
| Horizontal scaling | needs the shared store | trivial (any instance) |
| Reproducible eval | harder (stateful) | easy (stateless) |

- **For AC2 as an eval lab (its current purpose):** questions are judged independently and reproducibly; turns are short (opener + one generated follow-up) and `orchestrate` mostly runs empty history, so context bloat is not even a live problem. Stateless replay + dossier is **strictly better** — Redis would be pure overhead.
- **For a future production chat product:** persistence is needed, but via the dossier + Algolia's native transcript store, not necessarily Redis.

## Consequences

- Cross-turn context depends on the **caller threading history** into `messages[]` (today `orchestrate` passes `[]`; the multi-turn path in `answer.ts` carries turn-1 into turn-2). The **discovery Onion state (dossier) stays custom** regardless — native memory is a transcript store, not a state engine.
- No memory infra to operate. The findings doc's "lean on native memory instead of replay" option is **closed** (Backlog B negative).

## Alternatives considered

- **Redis (rc2 parity):** rejected for the lab — adds a stateful component + infra with no token benefit and worse reproducibility.
- **Native Agent Studio memory:** rejected — does not carry context via the completions API (Backlog B).
- **Raw full-transcript replay without a dossier:** rejected — unbounded token growth; the dossier exists precisely to avoid it.
