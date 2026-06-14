---
name: autocorrect-loop
description: Use when you want to iteratively and automatically optimize a system's config or prompt against an eval metric — keeping only changes that measurably improve quality without regressing grounding — e.g. auto-tuning a RAG agent's system prompt, with a held-out overfit guard and noise-safe keep/rollback decisions.
---

# Autocorrect Loop

## Overview
An eval-driven optimization loop (Karpathy "AutoResearch" style): **evaluate → diagnose the weakest dimension → propose a config change → re-evaluate → keep it only if it measurably improved, else roll back.** Grounding is a hard constraint (a change that introduces a hallucination is always rejected). An overfit guard validates wins on a held-out split. It runs on the **ai-judge** skill as its fitness signal.

**Noise-safe by construction:** a change is kept only if it beats the incumbent by MORE than the measured noise floor (`minImprovement`). A difference the metric can't distinguish from noise is treated as "no change" — so the loop can never act on a wrong/noisy measurement.

**REQUIRED BACKGROUND:** Use the `ai-judge` skill — it produces the metrics this loop consumes.

## Install (any project)
```bash
cp -R eval-loop/packages/autocorrect  <project>/packages/autocorrect   # depends on judge
cp -R eval-loop/packages/judge        <project>/packages/judge          # the fitness signal
```
TypeScript ESM source (import `@lab/autocorrect` via `tsx`/ts-node ESM or your build). Exact types (`AutocorrectSeams`, `ScoredPanelAnswer`, `WeakDimension`, `RoundResult`, `LoopConfig`, `KeepDecision`) are in `packages/autocorrect/src/types.ts` + `src/orchestrator.ts` — read for field-level detail.

## When to Use
- Auto-tuning a system prompt / config against a question set.
- Any "try a change, measure, keep-if-better" optimization where regressions (especially grounding) must be caught.
- After you have a baseline and a judge that gives a **reproducible** score (flicker breaks the loop — see ai-judge zero-flicker).

Not for: one-off manual prompt edits, or optimizing a metric you can't measure reproducibly.

## The portability seams (this is the whole integration)
The loop core is app-agnostic — it knows nothing about your system. You inject three functions (`AutocorrectSeams<C>`, where `C` is your opaque config type, e.g. a prompt string):

```ts
interface AutocorrectSeams<C> {
  deploy(config: C): Promise<void>;                    // make this config live
  evaluate(split: "dev" | "held-out"): Promise<ScoredPanelAnswer[]>; // run + judge the LIVE config
  propose(current: C, weakest: WeakDimension[], history: RoundResult[]): Promise<C>; // next candidate
  log?(msg: string): void;
}
```
- `deploy` — apply a config (e.g. PATCH a prompt to your agent, write a settings file).
- `evaluate` — run your system on the split and judge it (use ai-judge), returning one `ScoredPanelAnswer` per answer (`meanScore`, `gated`, `borderline`, `dimensionMeans`).
- `propose` — usually an LLM call: "here's the current config + its weakest dimensions + judge rationales — rewrite it to fix the weak part WITHOUT weakening grounding."

**Panels:** `evaluate` returns one `ScoredPanelAnswer` per (panel, question). `cfg.oursPanelId` / `cfg.floorPanelId` must match the `panelId` values your `evaluate` emits — "ours" is the system being optimized, "floor" is the fixed baseline to beat. If the floor is fixed, measure it once and merge it into every `evaluate` result rather than re-running it (saves ~half the compute).

## Run it
```ts
import { runAutocorrect } from "@lab/autocorrect";

const res = await runAutocorrect({
  seams,
  baseline: { id: "v0", config: currentPromptText },
  cfg: {
    oursPanelId: "ours", floorPanelId: "floor", // panel ids in your ScoredPanelAnswer
    targetMargin: 1.0,        // win = beat the floor by +1.0 on held-out...
    sustainRounds: 2,         // ...for 2 consecutive validated rounds
    maxRounds: 6, patience: 2,
    minImprovement: 0.3,      // = your MEASURED judge noise floor (critical)
  },
});
res.best.config;   // the winning config (live)
res.stopReason;    // "won" | "max-rounds" | "patience-exhausted"
res.history;       // per-round trajectory of the LIVE system
```

## The keep / rollback rule (decideKeep), in order
1. **Grounding regressed?** (new reproducible gate trip) → **reject**, always — even if the score went up.
2. **Gain < `minImprovement`?** → **reject** (within noise; keep incumbent).
3. **Improved on dev but regressed on held-out?** → **reject** (overfit).
4. Else → **keep** (candidate becomes the live incumbent).

On reject the loop re-deploys the incumbent, so the live system always = the best kept config.

## Setting `minImprovement` (do not skip)
Measure your judge's noise first: judge the same fixed answers twice, take the max score delta. Set `minImprovement` at or above that. If you skip this, the loop will "keep" noise. (For the reference Gemini setup the floor was ~0.3.)

## Quick reference
| Piece | What |
|---|---|
| `runAutocorrect(input)` | the loop |
| `AutocorrectSeams<C>` | the 3 functions you implement |
| `decideKeep / shouldStop / isWin / diagnoseWeakest` | pure decision core (unit-testable without I/O) |
| `summarizeSplit(answers, split)` | reduce judged answers → per-panel metrics |

## Common mistakes
- **Noisy judge.** If the gate flickers, keep/rollback is random. Fix the judge first (ai-judge zero-flicker) — this is non-negotiable.
- **`minImprovement` too low / zero.** The loop keeps noise. Set it from a measured noise floor.
- **No held-out split.** You'll overfit the dev set. Provide held-out answers; an empty held-out split is treated as "not validated" (no false win).
- **`evaluate` re-runs a fixed floor every round.** If your floor (baseline to beat) is fixed, measure it once and reuse it — saves half the compute.
