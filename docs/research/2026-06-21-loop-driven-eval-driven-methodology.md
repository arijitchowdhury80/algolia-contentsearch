# Loop-Driven / Eval-Driven / Verifier-Driven Agent Development — Research Synthesis

_Compiled 2026-06-21 for the AC2-RC2 build (neural RC2-replica on Algolia, scored against a captured RC2 gold standard, refined by self-improving loops). Every substantive claim is cited._

## The core idea
Instead of hand-tuning a solution, build an automated signal that scores any candidate output, then let an agentic loop generate candidates and keep whatever the signal rewards. **The signal is the product; the loop is just search against it.** Three names for the same shape at different altitudes: *eval-driven development* (software framing), *RL with verifiable rewards / RLVR* (model-training framing), *loop engineering* (practitioner framing, Boris Cherny).

## Why it works — Karpathy's verifiability thesis
- *"Traditional computers can easily automate what you can specify in code. LLMs can easily automate what you can verify."* — Sequoia AI Ascent ([mindstudio.ai](https://www.mindstudio.ai/blog/andrej-karpathy-verifiability-thesis-ai-superhuman-code-fails-car-wash))
- Domains with built-in verifiers (code runs/errors, math right/wrong) get the steepest gains; *"there's no unit test for common sense"* so soft domains stay undertrained ([mindstudio.ai](https://www.mindstudio.ai/blog/andrej-karpathy-verifiability-thesis-ai-superhuman-code-fails-car-wash)).
- 2025 consensus: the bottleneck "was never the optimization algorithm… it was always the reward signal" ([dailydoseofds](https://blog.dailydoseofds.com/p/how-top-ai-labs-are-building-rl-agents)).
- Software 3.0: prompts/context are the program; keep AI on a "tight leash" for generation, "make it easy/fast to win" for verification ([latent.space](https://www.latent.space/p/s3)).

## Boris Cherny / Anthropic
- *"I don't write the prompt anymore. Claude writes the prompt, and now I'm talking to that new Claude that is kind of coordinating."* ([letsdatascience](https://letsdatascience.com/news/engineers-embrace-loop-engineering-for-ai-agents-cb1a1d6a))
- *"My job is to write loops."* ([thenewstack.io/loop-engineering](https://thenewstack.io/loop-engineering/))
- BUT he loops the build of a *coding agent* — the most verifiable domain (code compiles, tests pass); every iteration runs real verification (plan-mode gates, the agent tests as a user, red-teamers, evals) ([pragmaticengineer](https://newsletter.pragmaticengineer.com/p/building-claude-code-with-boris-cherny)).
- Anthropic doctrine: *"Practice eval-driven development: build evals to define planned capabilities before agents can fulfill them, then iterate until the agent performs well."* and *"Evals get harder to build the longer you wait."* ([anthropic.com/engineering/demystifying-evals-for-ai-agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents))

## Preconditions for a loop to drive anything
1. **Cheap, fast, reproducible signal** — prefer code graders over LLM judges where the task allows (loop runs thousands of times).
2. **Signal must correlate with quality** — "if the eval correctly captures quality, improving the score improves the product"; else the loop optimizes a lie.
3. **Bypass-resistance** — "passing must genuinely require solving the problem, not exploiting loopholes." Reward hacking is the dominant failure mode.
4. **Held-out set** — "hacks often fail when the environment changes"; the only way to tell improvement from overfitting.
5. **Two-sided tasks** — test where a behavior should AND shouldn't occur (for RAG: bait refusals AND reward answerable ones).
6. **Read the transcripts** — the only way to know if the grader rejected a valid solution.
(all [anthropic.com](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents))

## When it FAILS
- **No verifiable signal** (taste/open-ended prose with no anchor).
- **Noisy/flickering reward** — an LLM judge that flips verdicts turns the loop into a random walk. (Hence: reproducible, temp-0, recurrence-gated judge.)
- **Sparse reward** — pass/fail on a long multi-step task gives no gradient. Fix: **partial credit** (an agent that nails discovery but flubs the deep dive is better than one that fails at turn 1).
- **Gameable reward** — reward hacking.

## Reward hacking / LLM-judge bias (the central danger)
The agent optimizes the *measure*, not the *target*. LLM-judge-specific biases: **position bias, verbosity bias (longer = "better"), self-preference (models score their own outputs higher)** ([adaline.ai](https://www.adaline.ai/blog/llm-as-a-judge-reliability-bias)). An agent looped against a verbose-biased judge learns to pad. Mitigations: calibrate judge vs human spot-checks; use a judge from a **different provider** than the generator; grade each dimension with an isolated judge; give the judge an explicit **"Unknown/insufficient evidence"** escape hatch.

## Verdict: build-then-loop vs loop-the-build
The real line is **verifiable-vs-not**, not build-vs-refine:
- Where the signal is cheap/automated/hard-to-game (code, schema-valid output, retrieval hit/miss, refusal-on-bait) → you can **loop the build itself** (proven: Claude Code, RLVR labs).
- Where the signal is an **LLM-judge over open-ended quality** (our case) → the loop is legitimate for **REFINING a running system**, but using that same noisy judge to **author architecture / decide what to build is aspirational, not proven.** The judge's biases + flicker mean it will happily optimize verbosity and call it progress.
- **"Build the gym before you train."** Loop-driving a build only becomes substantive *after* the verifier is validated on a held-out set.

## Practical steps for AC2-RC2
1. **Validate the judge against a human FIRST (the gating step).** Spot-check 30–50 cases; require ~80% agreement (calibrated-judge level). Until this passes, the judge can only *suggest*, not drive. ([galileo.ai](https://galileo.ai/blog/llm-as-a-judge-vs-human-evaluation), [adaline.ai](https://www.adaline.ai/blog/llm-as-a-judge-reliability-bias))
2. **Cross-provider judge for the REWARD role** to kill self-preference bias — tension with the current same-provider consistency rule ([[feedback-llm-provider-policy]]). Resolve per role: consistency for *reporting*, cross-provider for *reward*. (Needs an ADR.)
3. **Grade each dimension with an isolated judge.**
4. **Keep the hard grounding floor as a code-based grader where possible** — cheaper, reproducible, un-gameable by verbosity.
5. **Held-out set the loop never sees** + overfit guard; two-sided (answerable + bait/refusal).
6. **Give the judge an "Unknown" out.**
7. **Grade outputs, not paths** — let the agent find its own retrieval strategy.
8. **Scope what the loop drives:** refine prompts/config now (validated-judge territory); do NOT loop architecture choices until the judge is human-validated and the held-out gym is stable across ≥1 model-version change.

**Risk surface:** passing the held-out eval proves the loop improved the *measured proxy*, not runtime correctness of the deployed agent. Ongoing proof = reading transcripts + periodic human spot-checks.

## Primary sources
- Anthropic eval doc (best methodology source): https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
- Karpathy: https://www.latent.space/p/s3 ; https://www.mindstudio.ai/blog/andrej-karpathy-verifiability-thesis-ai-superhuman-code-fails-car-wash
- Cherny: https://newsletter.pragmaticengineer.com/p/building-claude-code-with-boris-cherny ; https://thenewstack.io/loop-engineering/
