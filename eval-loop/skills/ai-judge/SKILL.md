---
name: ai-judge
description: Use when you need to score, grade, or compare LLM-generated answers or content for quality AND grounding (catching hallucination / unsupported claims) with a reproducible, provider-agnostic judge — e.g. evaluating RAG answers, A/B-comparing prompts, or building an eval harness that must give the same verdict twice.
---

# AI Judge

## Overview
A provider-agnostic LLM-as-judge. It scores one answer with a **blind 3-persona panel** (Skeptic / Referee / Advocate) on a weighted rubric, reconciles them into one consensus quality score, and applies a **zero-flicker grounding gate**: an answer that states facts its sources don't support is capped, no matter how well it reads. "Zero-flicker" = the same answer gets the *same* pass/fail verdict every run (proven: 0 gate flips across repeated runs).

**The only seam to the outside world is one injected function**, `LlmComplete`. No vendor SDK is imported anywhere in the package — you bring the model.

## When to Use
- Scoring RAG / agent answers for quality + hallucination.
- A/B comparing two prompts or systems on the same questions.
- Any eval harness that must be **reproducible** (same input → same verdict).
- As the fitness signal for the **autocorrect-loop** skill.

Not for: free-form creative grading with no sources (turn the gate off), or mechanical checks a regex can do.

## Install (any project)
The package is **near-zero-dependency** (no SDK, only `node:` built-ins). Copy it in:
```bash
cp -R eval-loop/packages/judge  <your-project>/packages/judge
# package.json declares: "exports": { ".": "./src/index.ts" }, "type": "module"
```
It ships as **TypeScript ESM source** (no build artifact) — import `@lab/judge` via a TS-aware runtime (`tsx`, ts-node ESM) or add it to your build. Runtime dependency = the one LLM function YOU provide; dev deps (tsx/vitest/typescript) are only for its own tests.

**Exact types** (`Artifact`, `LlmComplete`, `LlmCompleteOptions`, `RoundAggregate`, rubric/gate config) live in `packages/judge/src/types.ts` — read it for field-level detail.

## Core usage (3 steps)

**1. Write one adapter** for whatever model the project uses (this is the entire integration surface). `LlmComplete` is `(prompt: string, opts?: {temperature?, maxTokens?, system?, tag?}) => Promise<string>` — it returns the model's raw text. The HTTP specifics (endpoint, auth headers, request/response shape) come from **your model provider's API reference**, not from here — the judge only needs a function that returns text. (Building a Claude adapter? consult the `claude-api` skill / Anthropic Messages API.)
```ts
import type { LlmComplete } from "@lab/judge";
export function makeMyLlm(apiKey: string): LlmComplete {
  return async (prompt, opts) => {
    const res = await fetch(MY_LLM_URL, {
      method: "POST",
      body: JSON.stringify({ prompt, temperature: opts?.temperature ?? 0 }),
    });
    return extractText(await res.json()); // return the model's text
  };
}
```

**2. Wrap what you're scoring as an `Artifact`:**
```ts
const artifact = {
  type: "rag-answer",
  prompt: "the user's question",
  content: "the answer text to score",
  sources: [{ id: "S1", text: "retrieved doc text the answer may use" }],
  expectedBehavior: "answer",          // or "refuse" for out-of-scope prompts
  // notApplicableDimensions: ["engagement"], // drop rubric dims that don't apply
};
```

**3. Judge it** (multi-round for a stable verdict):
```ts
import { judgeArtifactMultiRound, DEFAULT_JUDGE_CONFIG } from "@lab/judge";

const r = await judgeArtifactMultiRound(artifact, DEFAULT_JUDGE_CONFIG, makeMyLlm(key), /*rounds*/ 5);
r.aggregate.finalScore        // 0-10, capped if grounding gate tripped
r.aggregate.meanPreGateScore  // stable quality score (the loop optimizes this)
r.aggregate.gateTripped       // true = reproducible grounding violation
r.aggregate.dimensionMeans    // per-rubric-dimension means (what's weak)
```

## Zero-flicker: the two rules that make verdicts reproducible
1. **Judge at temperature 0.** Diversity comes from the 3 personas, not random sampling. (`DEFAULT_JUDGES` ship at temp 0.)
2. **Gate on claim recurrence, not a confidence vote.** Across rounds, the gate trips only when the *same* unsupported claim recurs in a supermajority — a one-off flag is treated as noise. This is why the same answer scores the same twice; a confidence-threshold vote flickered ±5 points.

To prove it in your project: judge the same fixed answer twice and assert `gateTripped` is identical and `finalScore` deltas are tiny.

## Swapping the rubric / personas
`DEFAULT_JUDGE_CONFIG` = `{ rubric, judges, synthesis, gate }`. Pass your own:
- `rubric`: dimensions + weights for YOUR domain (the default is Algolia-answer-shaped).
- `gate`: `groundingGateEnabled: false` to score pure quality (no sources).
- `judges`: keep the 3 personas; change personas, not temperatures (keep 0).

## Quick reference
| Need | Call |
|---|---|
| Score one answer, stable verdict | `judgeArtifactMultiRound(artifact, cfg, llm, rounds)` |
| Single round (cheap) | `judgeArtifact(artifact, cfg, llm)` |
| Just the claim-gate logic | `evaluateClaimGate(perRoundViolations, DEFAULT_CLAIM_GATE)` |
| Default config to start from | `DEFAULT_JUDGE_CONFIG` |

## Common mistakes
- **Nonzero temperature on judges** → reintroduces flicker. Keep 0.
- **Forgetting `sources`** with the gate on → everything looks ungrounded. Provide the sources the answer was allowed to use, or turn the gate off.
- **Treating `finalScore` as the optimization target.** Optimize `meanPreGateScore` (quality) and keep `gateTripped === false` as a hard constraint — that's what autocorrect-loop does.
- **One round.** Use ≥3 (default 5) so the claim-recurrence gate has rounds to vote over.
