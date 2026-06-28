# Judge "Confidence" Refactor — Design Spec

_Date: 2026-06-27 · Branch: `refactor/2x2-answer-quality-lab` · Status: DESIGN (awaiting Arijit review)_

## 1. Summary

We are **not building a new judge.** AC2 already has a mature answer-quality
judge engine (`@lab/judge` core + `liveJudge.ts`) that the web UI uses: a
3-lens adversarial panel (skeptic / referee / advocate), a grounding hard-gate,
multi-round zero-flicker aggregation, and live + batch tiers. A second, weaker
judge (`judgeReference.ts`: single-call, 5-criterion, % -of-RC2-gold) was built
in Phase 1 for the replay gym and **duplicates and disagrees with** the mature
engine.

This refactor **consolidates onto the mature engine** and makes three changes:

1. **Refactor the rubric** from 3 dimensions (Grounding / Confidence / Breadth&depth)
   to **4** (Grounding / Coverage / Depth / Relevance), with **Coverage driven by
   the discovery brain's extracted entities**.
2. **Add RC2 as a layer on the same engine** — a calibration anchor (both tiers)
   plus an offline win/tie/loss yardstick (gym only).
3. **Retire `judgeReference.ts`** and its single-call helpers; rewire the replay
   gym to the mature engine.

Plus a naming cleanup (the composite is **"Confidence"** end-to-end; the
per-claim signal is renamed `confidence` → `certainty`) and a **validity gate**
(human-calibration before we trust the score).

## 2. Goals / Non-goals

**Goals**
- Every answer gets a multi-dimensional **Confidence** score (4 dims → composite).
- Score is computed **asynchronously** — it never delays the answer from rendering.
- RC2 is the quality bar: AC2 measured *against RC2 quality*, able to land below /
  at / above it.
- One judge methodology, one set of dimension names, one composite name — top to bottom.
- The judge is **validated against human judgment** before its scores steer anything.

**Non-goals (this spec)**
- Pixel-level UI design of the drawer (contract defined here; visual design deferred
  per Arijit — "we'll come to the UI later").
- Changing the answer-generation pipeline (agents, retrieval) — judge only.
- Reopening equal-weight aggregation (settled by Arijit 2026-06-18).

## 3. Locked decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | Consolidate onto the mature engine; **retire `judgeReference.ts`** | One methodology; kill the duplicate that disagrees |
| D2 | **4 dimensions**: Grounding, Coverage, Depth, Relevance | Splits old fused "breadth&depth"; drops "decisiveness"; adds situational relevance |
| D3 | Drop the old **decisiveness dimension** (today mislabeled "Answer confidence"); its over-refusal signal folds into Coverage. NB: this is a *scored dimension* being removed — unrelated to D7, which names the *composite* "Confidence". | A refused-but-answerable question = uncovered entities |
| D4 | **3 lenses** (skeptic gating / referee / advocate), **one call per lens** scoring all 4 dims | ~3 calls/round, not 12; perspective diversity at temp 0 |
| D5 | **Coverage checklist = existing `dossier.signals` + `brain.entities`** (no new extraction; only wiring into the artifact) | Makes "did it address every parameter" mechanical, not vague |
| D6 | **Equal-weight mean** of 4 dims; **Grounding hard-gate** caps composite on verified recurring violation | Existing, proven; 110%-grounded made mechanical |
| D7 | Composite = **"Confidence"** everywhere (UI + API + code + logs); per-claim `confidence` → **`certainty`** | One name top-to-bottom; no two-meanings collision |
| D8 | RC2 = **calibration anchor (both tiers)** + **win/tie/loss yardstick (gym only)** | AC2 can match *or beat* the bar; live stays absolute so RC2 never blocks a user |
| D9 | Judge runs **async**; answer and score travel on separate SSE events | Judge latency/crash never affects the answer |
| D10 | **Validity gate first**: human-ranked calibration set; tune rubric until judge agrees | An unvalidated judge that steers Phase 2 is the project's biggest risk |
| D11 | **Live = 3 lenses, 1 round**; one-config dial to drop to skeptic(+referee) if cost bites | Proven latency (~15–20s); lever kept |

## 4. The 4 dimensions

| Dim | Question | Input it reads | Notes |
|---|---|---|---|
| **Grounding** | Every factual claim traceable to a retrieved source? No hallucination. | answer + AC2's own sources | Scored dim **and** hard gate (dual role) |
| **Coverage** | Did it address every part of the question — the discovery signals (industry / product / concepts / role / pain / use-case / stack / scale)? | answer + **`dossier.signals` + `brain.entities`** | Checklist per turn (all already extracted); absorbs over-refusal signal |
| **Depth** | For what it covered, did it go deep — mechanism, specific settings/names, numbers, trade-offs? | answer + sources | Depth must come from sources, not padding |
| **Relevance** | Did it answer *this* user's situation, not a generic version? | answer + user input | Situational fit |

All four are 1–10, equal weight.

### 4.1 Grounding's two roles
1. **Scored dimension** — contributes to the mean like the others.
2. **Hard gate** — a verified grounding violation that *recurs across rounds*
   (claim-recurrence gate, `claimGate.ts`) **caps** the composite (today: cap = 3)
   regardless of the other three. A beautiful answer with one fabricated fact is
   not high-Confidence. `unverifiable` (thin-source) flags lower the grounding
   dimension but do **not** trip the gate (unchanged from today).

## 5. Architecture

**One engine, two tiers.** Worker (the agent) ≠ judge, always.

```
                       ┌─────────────────────────────────────────┐
   answer + sources    │  per LENS (skeptic / referee / advocate) │
   + brain entities ──▶│  ONE llm call → {4 dim scores,           │
   + RC2 anchors       │                  grounding violations}   │
                       └─────────────────────────────────────────┘
                                          │  (×3 lenses, in parallel)
                                          ▼
                       per-dimension score = mean across lenses
                                          │
                                          ▼
                       Confidence (composite) = mean of 4 dims
                                          │
                                          ▼
                       GROUNDING GATE (claim-recurrence) caps if tripped
```

### 5.1 Cost per answer

| Tier | Judge calls | + synth rationale | Total |
|---|---|---|---|
| **Live** (1 round) | 3 (one per lens) | 1 | ~4, parallel, ~15–20s, async |
| **Gym/batch** (N rounds) | 3 × N | 1 | 3N + 1 (offline; latency irrelevant) |

Each lens call returns **all 4 dims** (`prompt.ts`: "one entry per rubric
dimension id"). It is **not** 3×4 = 12 calls.

### 5.2 Components (units of work)

| Unit | File(s) | Change |
|---|---|---|
| Rubric (4 dims, RC2-anchored descriptions) | `lab/judge/src/rubric.ts` | **Replace** 3-dim with 4-dim; embed RC2 anchor exemplars in dim descriptions |
| Lenses (personas) | `rubric.ts` `DEFAULT_JUDGES` | Unchanged (skeptic/referee/advocate) |
| Per-lens scoring | `judge.ts`, `prompt.ts`, `parse.ts` | Prompt/parse now cover 4 dims; inject brain entities + RC2 anchors |
| Coverage input | artifact type + `orchestrate.ts` / `liveJudge.ts` wiring | **Thread existing** `dossier.signals` + `brain.entities` into the artifact. **No brain extraction change.** |
| Gate | `gate.ts`, `claimGate.ts` | Unchanged (grounding veto, zero-flicker) |
| Aggregation | `synthesis.ts`, `aggregate.ts` | Unchanged mean; now over 4 dims |
| Live entry | `liveJudge.ts` | Emit 4 dims; rename violation `confidence` → `certainty`; "Confidence" naming |
| Gym / replay | `lab/server/src/replay/*` | **Rewire** off `judgeReference` to mature engine; add RC2 win/tie/loss |
| RC2 anchors | `lab/replay/gold/*` (existing) | Source anchor exemplars from blessed gold |
| Calibration harness | new (`lab/judge/src/calibration.ts` + CLI) | Load human-ranked set; compute rank correlation vs judge |
| UI | `web/src/components/JudgeDrawer.tsx`, `web/src/types/chat.ts` | 4 dim bars; "Confidence"; `certainty`; gym RC2 view |
| SSE | answer service / `/api/answer` | Async `judge` event after answer (largely exists) |

### 5.3 RC2 layer (D8)

- **Calibration anchor (both tiers):** RC2's blessed answers define the *top of
  each scale* inside the rubric dimension descriptions ("a depth-9 answer looks
  like THIS"). Used to score **absolutely** — so AC2 can score below, at, or above
  RC2. RC2 anchors are *scale references only*; grounding still checks AC2's **own**
  retrieved sources (never RC2's).
- **Gym yardstick (offline only):** for each question, compute AC2 dim scores vs
  RC2 dim scores → per-question **win / tie / loss** + parity %. This is the
  "are we at RC2 quality yet?" verdict that drives Phase-2 tuning.
- **Live tier stays absolute** — no RC2 diff in the request path. RC2 never blocks
  a user.

### 5.4 Async flow (D9)

```
user asks
  └─ answer streams (SSE `delta` events) ───────────► rendered immediately
                                                      Confidence chip = "scoring…"
  └─ on answer-complete: fire judge (detached)
       └─ 3 lenses in parallel → consensus → gate
            └─ emit SSE `judge` event ──────────────► chip fills; click → drawer
```
The judge can crash and the answer is unaffected (per-panel error isolation
already exists in `liveJudge.ts`).

## 6. Data contract changes

```ts
// VerdictDims: 3-dim → 4-dim
interface VerdictDims {
  grounding: number;
  coverage: number;   // was: confidence
  depth: number;      // was: breadthDepth (split)
  relevance: number;  // new
}

// Per-claim signal renamed
interface VerdictViolation {
  claim: string;
  reason: string;
  certainty: number;  // RENAMED from `confidence`
}

// Artifact gains the coverage checklist source
interface Artifact {
  // …existing…
  extractedEntities?: {
    intent?: string;
    // from brain.entities (existing):
    brand?: string; industry?: string; product?: string; concepts?: string[];
    // from dossier.signals (existing 8 onion signals) — no new extraction:
    signals?: Partial<Record<
      "stack" | "scale" | "role" | "pain" | "industry" | "product" | "feature" | "solution",
      string
    >>;
  };
}

// Gym verdict gains RC2 comparison
interface GymTurnComparison {
  perDim: Record<keyof VerdictDims, { ac2: number; rc2: number }>;
  verdict: "win" | "tie" | "loss";
  parityPct: number; // AC2 composite / RC2 composite
}
```

Composite field stays `composite` / `synthesizedScore` in the engine; the
**UI label and all user-facing copy say "Confidence."**

## 7. Validity gate (D10) — first build step, non-negotiable

Before any score steers Phase 2 or ships to the UI as authoritative:
1. Arijit hand-ranks ~12 representative answers (better / same / worse — a ranking,
   not absolute numbers).
2. Run the (refactored) judge over the same set.
3. Compute **rank correlation** (Spearman) between judge and human.
4. Tune rubric/prompts until correlation clears an agreed bar (target ≥ 0.7;
   exact bar set with Arijit at calibration).
5. If it cannot match the human ranking, the rubric is wrong — **fix before
   proceeding.** No UI polish, no Phase-2 tuning until this passes.

## 8. Testing (TDD, 3-layer)

- **Rubric**: exactly 4 dims, equal weights, RC2 anchors present in descriptions.
- **Coverage**: entities threaded into prompt; a missing/unaddressed entity lowers
  Coverage; over-refusal on an answerable question lowers Coverage.
- **Naming**: violations expose `certainty`, never `confidence`; no `confidence`
  dim remains.
- **Gate (regression)**: grounding veto + claim-recurrence zero-flicker unchanged.
- **Gym**: win/tie/loss + parity computed correctly; RC2 anchors injected; grounding
  still checks AC2 sources, not RC2.
- **Calibration**: rank-correlation harness returns a number on a fixture set.
- **Regression**: existing suites updated for 4-dim + new names; replay rewired off
  `judgeReference` stays green.

## 9. Risks / open items

- **Coverage quality depends on the discovery layer's extraction quality.** Noisy
  signals → noisy Coverage. Mitigated by the calibration gate. **No new extraction
  needed** — every checklist item already exists in `dossier.signals` +
  `brain.entities`; the only work is threading them into the judge artifact.
- **RC2 gold sources ≠ AC2 sources.** Anchors must be used as *scale references*
  only; grounding must check AC2's own sources. Enforced in prompt construction +
  a test.
- **Retiring `judgeReference.ts` touches the replay harness** (E1–E3) and its
  tests — regression surface to manage during rewire.
- **Live-lens count** (D11): start at 3; revisit if volume cost is felt.

## 10. Out of scope / later
- Drawer visual design (bars, expanders, gym RC2 panel layout).
- Any change to retrieval/agents (Phase 2 lever, separate work).
