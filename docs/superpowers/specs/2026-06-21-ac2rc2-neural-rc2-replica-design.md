# AC2-RC2 — Neural RC2-Replica on Algolia, Scored Against a Captured RC2 Gold Standard

_Design spec. Brainstormed + locked 2026-06-20/21 with Arijit via `superpowers:brainstorming`. Next step after sign-off: `superpowers:writing-plans` (scoped to Phase 0 + Phase 1 first — this is a phased program, not one plan)._

---

## 1. Goal & success bar

Rebuild the **quality, depth, grounding, and engagement of RC2** — Arijit's all-custom POC that everyone loves in demos — but earned on **full Algolia infrastructure** (Algolia neural search + Agent Studio agents + Algolia coordination + APIs/SDK), and add the **grading layer RC2 lacks**.

- **RC2 is the *quality* floor, not the infrastructure floor.** RC2's answers are amazing but custom (Supabase-then-Redis state, direct-LLM hub, custom orchestration). They are NOT earned on Algolia's stack. AC2-RC2 must reproduce that quality on the stack.
- **Success = BEAT RC2**, not just match it — on depth, accuracy, grounded truthfulness, validation, and on-the-ground reality. RC2 is the floor; the ceiling is higher and the loop chases it.
- **Keyword search is dropped.** The product leads with **neural / natural-language / semantic** search — Algolia's leadership story. The old keyword×architecture 2×2 is gone.
- **The contest = neural single-agent vs. neural multi-agent.** Prove whether the multi-agent baton-transfer + specialist deep-dive actually beats a single agent on quality — proof RC2 never had.
- **Domain-first.** Prove the engine in RC2's own domain (Algolia knowledge) first, where it is directly comparable to the RC2 gold standard. The GTM application — the same engine pointed at a per-company audit corpus, fronted by a chat surface (e.g. Telegram) an AE talks to ("tell me about PetSmart") — is the **destination it generalizes to**, not the first build.

### The "everything Algolia" rule (decided: Algolia core + thin glue)
Retrieval = Algolia neural. All agents = Agent Studio. All content = Algolia-indexed. **Custom code is allowed only as thin orchestration wiring** — a coded coordinator that owns the discovery state machine, the baton routing, and the grounding audit, and calls Agent Studio agents. No custom retrieval, no custom LLM agents, no custom knowledge store. (RC2 is already a hybrid — neural retrieval + Agent Studio specialists — so the gap to "all Algolia" is narrow: move the hub into Agent Studio and decide where the discovery/coordination logic lives.)

---

## 2. The measurement system (the heart of the project)

### 2.1 Reference-based grading
RC2's captured answer **is the answer key.** The judge reads RC2's gold answer and AC2's answer and renders one comparison: did AC2 cover what RC2 covered, as deep, adding nothing unsupported — *fell short / matched / exceeded* the floor. The loop's job is "close the gap to gold, then beat it." (Chosen over absolute-rubric grading because RC2 *is* the floor, and an absolute scale gives no anchor — "is a 7 good?")

### 2.2 Capture → replay → measure
- **Capture is human-driven.** Arijit runs RC2 engagements by hand (human intelligence/touch). We instrument RC2 (~1–2h: wrap the SSE emit, persist events) to export each engagement as a **gold engagement record**.
- **Gold becomes a fixed replay script.** Per scenario we store the **driving sequence** (the user's ordered turns) + RC2's full per-turn output (answer, sources/grounding, baton/specialist events, the follow-up RC2 proposed).
- **AC2 measurement is automated replay.** Feed AC2 the *same* driving sequence regardless of what follow-up AC2 itself would propose, so turns line up 1:1. The human is in the loop **only once** (RC2 capture); AC2 eval is fully unattended — which is what lets the self-improvement loop run.
- **Gold is a blessed single sample, not a distribution.** RC2 runs at temp > 0, so a captured engagement is *one* good run **Arijit reviewed and blessed at capture time**, not RC2's expected behavior. That is fine — the reference is "a run we judged excellent," and Arijit's in-the-loop blessing at capture is what certifies it. We do not re-sample RC2 per scenario for v1.

### 2.3 The divergence rule
Because AC2 proposes different follow-ups than RC2, letting AC2 drive freely forks the conversation and breaks turn-for-turn comparison. So the **driving sequence is fixed from the gold capture.** AC2's *own* proposed follow-up is graded separately (criterion #5) but does **not** steer the path.

### 2.4 The gold scenario set
**Seed = RC2's existing "V3" suite** (`e2e/v3-questions.spec.ts`) — already the furniture we need:
- 8 scenarios: 4 verticals (Retail, CPG, FinServ, Healthcare) × 2 tiers (Q1 discovery-only; Q2 → specialist handoff).
- Each ships with `question` + ordered `followUps[]` (the replay script) + `expectsHandoff` + `handoffTarget` (Elena/Bruno).
- Q1s are 2-turn discovery; Q2s are 3-turn ending in an Elena (implementation) or Bruno (architecture) deep-dive.

Run these against RC2, capture the full engagements → the v1 gold corpus. **Expand to 50–100 later**, reusing the 4-vertical × depth-tier template (this also creates the train/held-out split — see §4).

---

## 3. The judge (crystallized)

### 3.1 What was wrong (from the current `lab/judge` code)
The existing judge was built for a different job: it scores **in a vacuum** (no slot for a reference answer), grounds against the **candidate's own thin sources** (cause of the all-3.0 collapse), judges **one answer, not an engagement**, and uses three **temperaments** (skeptic/referee/advocate) that add spread without measuring distinct things. It must be reframed to **reference-based, engagement-level, gold-anchored.**

### 3.2 The seven criteria (the verifier spec)
Each AC2 turn is graded *against RC2's gold answer for that turn*:
1. **Coverage vs gold** — did AC2 say what RC2 said? (the core comparison). **Every coverage miss is tagged retrieval-gap vs generation-gap** (see §3.5) so the loop never chases what prompts can't fix.
2. **Depth vs gold** — as deep, or shallower?
3. **On-point for this user** — used the stated situation (scale/role/stack/pain), not a generic answer?
4. **Right expert** — produced the deep-dive the *correct* specialist would (graded by whether the answer matches the gold's expert deep-dive, **not** by agent name)?
5. **Good next question** — AC2's discovery follow-up peels the onion as well as RC2's?
6. **Grounded** — added nothing RC2 / the sources didn't support. **Hard floor; truthfulness is non-negotiable.**
7. **Voice** — human, leaning-in, conversational, with personality (not a robot). Measured **vs. RC2's actual voice**, never as abstract "liveliness."

### 3.3 Headline & gating
- Per scenario: a single **"% of the RC2 floor"** number; **exceeding (>100%) is real and rewarded** (RC2 is the floor, not the ceiling).
- **Grounding (#6) is a hard floor implemented as a code-based check where possible** (cheaper, reproducible, un-gameable by padding) — not a judge vibe.
- **Voice (#7) is partly code-based**: port RC2's `validateMaverickVoice` gate (forbidden phrases, doc-bot-opener detection, word ceiling, required citation + customer/product anchor). This removes the softest, most game-able dimension from pure-LLM judgment. **Note:** `validateMaverickVoice` is Maverick-specific; Elena and Bruno have distinct voices, so the code-gate needs **per-persona variants** (or it gates Maverick turns only and the LLM judge covers specialist voice). Decide at build time in Phase 1.

### 3.4 Anti-reward-hacking discipline (from the research, `docs/research/2026-06-21-loop-driven-eval-driven-methodology.md`)
- **Validate the judge against Arijit BEFORE it drives any loop** — spot-check 30–50 cases, require ~80% human agreement. Until then the judge can only *suggest*. Arijit's gut on those cases certifies the verifier.
  - **Sample-size resolution (closes the "8 scenarios ≈ 24 turns < 30–50" gap):** validation is **per-criterion, not per-turn.** The 8-scenario gold yields ~24 turns × 7 criteria ≈ 168 individual criterion-judgments; sample 30–50 of *those* for human agreement. This clears the research bar **without** pulling the Phase-3 gold expansion forward. Phase 1.5 (validate) stays where it is; Phase 3's expansion is for the **loop's held-out split**, not for judge validation.
- **Cross-provider judge for the reward role** to kill self-preference bias — *contradicts the current same-provider rule* ([[feedback-llm-provider-policy]]); resolve per role (consistency for reporting, cross-provider for reward). **→ ADR.**
- Isolated judge per dimension; an explicit **"Unknown / insufficient evidence"** out; **grade outputs, not paths**; two-sided eval (answerable + bait/refusal); **read the transcripts** periodically.
- Reproducibility (zero-flicker, [[feedback-zero-flicker-judge]]): structured comparison + temp-0 + claim-recurrence so the verdict is stable.
- The old V3 binary rubric is **dropped from the verdict** (it was RC2's self-grading scaffold; RC2 is now the reference). Kept only as a throwaway sanity check during pipeline bring-up.

### 3.5 Retrieval-gap vs generation-gap diagnostic (closes the coverage/grounding tension)
Coverage (#1) and grounding (#6) can pull against each other: RC2 used a different retrieval setup, so a gold fact may simply be **absent from AC2's retrieved sources**. Penalizing AC2's coverage for that would punish it for being *correctly* grounded, and — worse — would send the prompt-loop chasing a gap no prompt can close.

So every coverage miss carries a **mechanical tag**:
- **generation-gap** — the gold's claim *is* supported in AC2's retrieved source set for that turn, but the answer didn't surface it. **Fixable by prompts.**
- **retrieval-gap** — the claim is *absent* from AC2's retrieved sources entirely. **Not fixable by prompts.**

The check is code, not vibe: does AC2's retrieved-source set for the turn contain support for the missed gold claim? **Loop rule (see §4):** the prompt-loop acts **only on generation-gaps**; retrieval-gaps are logged and **escalated to the human-gated retrieval/coordination queue** (neural params, charter scoping, query expansion). This keeps the loop honest, prevents thrashing, and is the operational form of "grade outputs, not paths."

---

## 4. The self-improvement loop

- **Build the gym before you train.** A loop can only improve what it can run and score. Stand up the runnable (skeleton) agents + replay harness + validated judge + captured gold *first*. Skeleton quality is fine — bad on purpose; the loop makes it good, so don't hand-tune prompts up front.
- **One iteration:** AI rewrites a prompt → replay the gold scripts through AC2 → judge scores "% of floor" → **keep** only if it beats the **aggregate** past the judge's noise floor **AND** regresses **no** scenario (hard no-regression) → else **rollback**. Loop-until-dry (stop after K rounds with no improvement).
- **What it tunes — prompts first:** Maverick/Elena/Bruno instructions + the discovery/follow-up prompts (Karpathy/Cherny: "write the loop, let it write the prompt"). **Coordination + retrieval params stay human-gated**, opened deliberately later.
- **The loop acts only on generation-gaps (§3.5).** Coverage misses tagged *retrieval-gap* are excluded from the loop's reward signal and routed to the human-gated retrieval/coordination queue — the loop cannot close them with a prompt edit, so it must not be scored on them.
- **Scope limit (research-backed):** loop to *refine* within validated-judge territory; do **NOT** loop *architecture decisions* on a soft LLM-judge signal until the judge is human-validated and the held-out set is stable across ≥1 model-version change.
- **Overfit guard:** v1 goal is to prove the mechanism on the 8 scenarios; expanding to 50–100 creates a **train / held-out split** (loop never sees held-out) that makes the gains trustworthy. Two-sided set (answerable + bait/refusal).
- **Division of labor:** Arijit sets the dials — the gold scenarios, the metric, the definition of done (e.g. "aggregate ≥ 100% of floor, nothing below 90%"). The loop runs free inside them.

---

## 5. The engine / agent architecture

### 5.1 Orchestration = RC2-shape routing (NOT fan-out)
Maverick (generalist hub) runs discovery, locks 3–4 Onion signals, **classifies the need**, and **baton-transfers to the ONE fitting specialist** for a deep-dive, which yields back. The current `multiAgent.ts` parallel fan-out + synthesize is **wrong for this design** and is replaced by single-specialist routing.

- **Single-agent panel** = Maverick alone (neural retrieval, no handoff).
- **Multi-agent panel** = Maverick → baton → specialist deep-dive. The deep-dive is the multi panel's answer, so the contest compares single-answer vs. expert-deep-dive honestly.
- Baton mechanism ported from RC2: intent classification → handoff proposal with consent UI ("bringing in Elena…") → specialist deep-dive scoped to its charter → yield back.

### 5.2 v1 cast = RC2's lens-cast (personas ported verbatim from `config/system/PERSONAS.md`)
- **Maverick (Hub / AE)** — *"Value First. Solution Second. Receipt Always."* Vibrant, witty, spicy, value-selling; runs the Onion Protocol; banned from code; broad-but-shallow value/proof. **Personality retained (explicit requirement).**
- **Elena (SE / implementation)** — *"Build the Value. Validate the Tech. Anchor the Win."* Vision → implementation (+React/Node) → SEE proof → war-stories.
- **Bruno (SA / architecture)** — *"No Fluff. Just Physics. Scale or Fail."* Binary verdict → blueprint → roadmap → benchmarks → risk map.
- Global protocols ported: SEE framework (Statement-Example-Evidence), Quote-First vision, mandatory source linking, strict markdown, zero-greeting.

### 5.3 Specialists = persona-lens + source charter
A specialist's depth comes from a **narrow charter + a lens + deep retrieval within it + a specialized output format** — not from owning one data source. Cut by **lens (the user's need)**, with sources as charters feeding the lens. Data is cordoned by the `source` facet allowlist (proven AC2 filter-string scoping).

**v1 charter matrix over the 9 sources** (counts from the live index):

| Source (count) | Maverick · AE/value | Elena · SE/impl | Bruno · SA/arch |
|---|---|---|---|
| Website (397) | ✅ | — | — |
| Blog (923) | ✅ | — | — |
| Resources (268) | ✅ | ✅ | — |
| Customer Stories (79) | ✅ | ✅ | — |
| Academy (139) | — | ✅ | — |
| Developers (282) | — | ✅ | ✅ |
| Documentation (4177) | high-level only | ✅ | ✅ |
| Support (1691) | — | ✅ (how-to/war-stories) | ✅ (scale pitfalls) |
| Other (63) | ✅ | — | — |

Boundaries mirror RC2's charters (Maverick disallowed deep tech docs/support/code; Bruno disallowed marketing/blog).

### 5.4 Finer specialists = a measured hypothesis (not assumed)
v1 ships RC2's 3-cast (matches the gold, hits the floor). Whether a finer roster (e.g. a dedicated Support/Troubleshooting or Academy lens) **beats** the 3-cast is then settled **by the judge**, not by assumption — data-driven ([[feedback-data-driven-decisions]]).

### 5.5 Discovery (the Onion Protocol, ported from RC2)
Signal extraction (the "brain": one LLM call → intent + entities + expanded query + proposed discovery question), the 8 Onion signals (Stack/Scale/Role/Pain/Industry/Product/Feature/Solution), the discovery analyzer (qualification rules), the discovery question bank, the **F-044 short-turn rule** (a short reply enriches the dossier but doesn't reset the topic), asked-signals no-repeat, ≤4 discovery turns before handoff.

### 5.6 Streaming
Real token streaming: read `res.body` incrementally → `onToken` → SSE `delta` → frontend. Replaces today's `agentRunner.ts` `await res.text()` buffering (which makes the demo feel dead). Folded into the build, not deferred.

---

## 6. Data flow (one engagement)

```
User turn (from replay script during eval; live in product)
  → Brain: intent + entities + expanded neural query + proposed discovery question
  → Maverick: neural retrieval scoped to its charter → value answer + (if unqualified) one discovery question
  → [multi only] when need classified + 3–4 signals locked:
        baton proposal → consent → specialist (Elena|Bruno) deep-dive scoped to its charter → yield back
  → SSE: dossier update + per-panel answer (streamed) + each panel's proposed follow-up
  → (eval) Judge: AC2 turn vs RC2 gold turn → 7 criteria → "% of floor"
```

---

## 7. Build sequencing (phased — each phase its own plan)

- **Phase 0 — Capture the gold.** Instrument RC2 (persist SSE per turn), run the 8 V3 scenarios by hand, export gold engagement records. *Precondition for everything.*
- **Phase 1 — Build the gym.** Neural indices (single + multi); RC2-cast agents on Agent Studio (Maverick/Elena/Bruno + charters); thin coordinator (discovery state machine + baton routing + grounding audit); replay harness; reference-based engagement-level judge; streaming. Skeleton quality.
- **Phase 1.5 — Validate the judge** against Arijit (30–50 cases, ~80% agreement). Gate: no looping until this passes.
- **Phase 2 — The loop.** Refine prompts toward and past the floor; no-regression keep/rollback.
- **Phase 3 — Scale & test hypotheses.** Expand gold to 50–100 (train/held-out); test whether finer specialists beat the 3-cast; discovery-aware scoring.
- **Later — GTM.** Per-company audit corpus + chat (Telegram) surface.

---

## 8. Error handling

- Brain fails → fall back to the raw user query (no crash).
- Per-panel / per-specialist failure is isolated (one panel erroring doesn't fail the engagement).
- Missing follow-up → drop that chip, don't fabricate.
- Judge "Unknown" out prevents confident-but-wrong verdicts on thin evidence.
- Grounding hard-floor caps any turn that asserts unsupported claims, regardless of other criteria.

---

## 9. Testing

- **Pure-logic units:** brain parse, F-044 rule, dossier accumulate + no-repeat, signal→filter mapping, follow-up on-topic + no-repeat, charter allowlist scoping, judge comparison parse, grounding code-check, voice code-gate, **retrieval-gap vs generation-gap classifier (§3.5)** — given a missed gold claim + AC2's retrieved source set, returns the correct tag.
- **Judge reproducibility:** same inputs → same verdict (temp-0 + recurrence), asserted across rounds.
- **Replay harness:** deterministic gold replay; turn alignment 1:1.
- Existing `lab/judge` / `lab/server` / `web` suites stay green where reused.
- **Risk surface:** passing the held-out eval proves the loop improved the *measured proxy*, not deployed runtime correctness. Ongoing proof = transcript reads + periodic human spot-checks.

---

## 10. Open decisions / ADRs to record

1. **Cross-provider judge for the reward role** vs. the same-provider consistency rule. (Recommend: same-provider for reporting, cross-provider for reward.)
2. **Definition of done thresholds** — aggregate "% of floor" target and per-scenario floor (e.g. ≥100% / ≥90%).
2b. **Aggregation function for "% of floor"** (PARKED until Phase 2 kickoff; decide before the loop runs, since the weighting is literally what the loop will optimize — Goodhart). How the 6 non-grounding criteria collapse into one number. *Default to revisit:* grounding (#6) stays a hard gate; "% of floor" = **unweighted mean of the other criteria scored as ratio-to-gold**, with voice (#7) carried mostly by its code-gate. Do not finalize the weights without real per-scenario data.
3. **LLM provider** — OpenAI (billing-blocked) vs. Gemini (current) for agents and for the judge.
4. **Naming** — "AC2-RC2" vs. "RC4" (undecided).
5. **Maverick's home** — fully in Agent Studio vs. coordinator-hosted hub prompt (the one remaining "everything Algolia" nuance).
6. **Product surface / UI — NOT yet designed (own beat).** The "two panes": the *proof* view (neural single vs. multi, scored vs. gold) and the *experience* view (the RC2-grade single engagement people fall in love with). Needs its own brainstorm/plan; out of scope for Phase 0/1 (which are headless capture + gym).

---

## Appendix — source references
- RC2 engine: `~/Dropbox/AI-Development/RAG/AlgoliaRAG-Google/rc2-algolia/lib/search/*`, personas `config/system/PERSONAS.md`, gold scenarios `e2e/v3-questions.spec.ts`, voice gate `lib/search/persona_loader.ts`.
- AC2 current engine: `lab/server/src/*` (answer, agentRunner, multiAgent, panels), `lab/judge/src/*`, `web/src/*`.
- Methodology research (cited): `docs/research/2026-06-21-loop-driven-eval-driven-methodology.md`.
- Build home: app `0EXRPAXB56`, indices `AC2_WWW_*`, agents `ac2-*` ([[project-build-home-central-app]]).
