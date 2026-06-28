# Autonomous Honing Methodology — goal → decompose → loop → done

_Author: 2026-06-28. A repeatable process for handing a goal to Claude and having it
autonomously build, test, judge, fix, and re-test a system to a quality bar — without
babysitting. Grounded in Anthropic's published agent patterns (see References)._

> **One-line:** give a goal + an eval, and an **evaluator-optimizer loop** (judge ⇄
> fix) wrapped in **orchestrator-workers** (decompose → fan out) drives the system to
> the bar, **routing** cheap work to cheap models, running on **shadow** copies, and
> stopping at the goal or the budget. You stay in the loop at milestones, not per step.

---

## 1. When to use this

Use it when the work is: (a) **measurable** (there's an eval that scores "better"),
(b) **iterative** (fix → re-test → repeat is the natural shape), and (c) **bounded**
(a clear done-condition exists). Prompt-honing, RAG-answer tuning, agent-quality
loops, config optimization, migration sweeps all fit.

Do **not** use it when there's no trustworthy eval (you'd optimize to a bad target —
see §8) or when the task is a one-shot with no iteration.

## 2. Mental model — Anthropic's named patterns, composed

This methodology is not novel; it's a composition of four patterns from Anthropic's
*Building Effective Agents*:

| Pattern | Role here |
|---|---|
| **Evaluator-optimizer** | the core loop: one step generates, another (the judge) evaluates + feeds back, repeat until the bar is met. |
| **Orchestrator-workers** | decompose the goal into independent units (agents, questions, files) and fan workers across them; synthesize. |
| **Routing** | classify each sub-step by difficulty and send it to the cheapest capable model (Haiku for mechanical, Opus for judgment). |
| **Autonomous loop** | the whole thing runs unattended across context windows, on env feedback, until a stop condition. |

Anthropic's **core principle** governs all of it: *start simple, add complexity only
when an eval shows it helps.* Don't build the full gym for a 3-question check.

## 3. The operating contract (what the human provides)

For any goal, the human supplies five things; Claude does the rest.

1. **Goal** — one line. *"Get all 4 specialists + coordinator to ≥X quality, grounded, warm baton working."*
2. **Overview** — constraints + what "done" means.
3. **The eval** — the question bank + judge + thresholds. **This is the contract** — the loop optimizes to exactly this, so it must encode what you actually care about (see §8).
4. **Autonomy level** — what runs free vs what needs a gate (default: free on shadows, gated on promote-to-live and on spend over budget).
5. **Budget + stop condition** — token cap and "stop when all pass, or after N rounds with no gain."

## 4. The loop

```
DECOMPOSE   split the goal into independent units (per-agent, per-question, per-file)
  └─ for each unit, run the evaluator-optimizer cycle:
       GENERATE   produce the artifact / run the system           (cheap model)
       EVALUATE   judge it against the eval (score + per-dim gaps) (mid model)
       DIAGNOSE   for each FAIL, name the mechanism                (capable model)
       PATCH      draft the minimal change to fix that mechanism   (capable model)
       APPLY      snapshot → push to a SHADOW copy of the unit
       RE-EVAL    re-run the eval; keep-if-better, else roll back  (autocorrect rule)
       └─ repeat until the unit passes the bar OR N rounds yield no gain
SYNTHESIZE  once units pass, run the END-TO-END eval (integration, e.g. warm baton),
            judge the whole flow, and loop the whole thing if E2E regresses
PROMOTE     (gated) replay the winning changes onto the live system in one batch
```

The **keep-if-better** rule is essential: a patch is kept only if it measurably beats
the prior best **without regressing** a hard floor (e.g. grounding). On a tie within
noise, roll back — noise is not signal. (This is the `autocorrect-loop` skill.)

## 5. Model routing (the cost lever)

Anthropic's routing guidance: *easy/common → smaller, cost-efficient models; hard/
unusual → more capable.* Map each loop stage to the cheapest model that can do it.
Pricing (authoritative, per 1M tokens):

| Stage | Model | ID | $/1M in·out | Why |
|---|---|---|---|---|
| Run the system / fire a query | **Haiku 4.5** | `claude-haiku-4-5` | $1 · $5 | mechanical, no judgment |
| Parse / classify transcripts | **Haiku 4.5** | `claude-haiku-4-5` | $1 · $5 | structured extraction |
| Judge an answer | **Sonnet 4.6** | `claude-sonnet-4-6` | $3 · $15 | reasoning, but bounded by a rubric |
| Diagnose a failure / draft a patch | **Opus 4.8** | `claude-opus-4-8` | $5 · $25 | the hard creative judgment — where quality is won |
| Adversarial verify a fix | **Sonnet 4.6** | `claude-sonnet-4-6` | $3 · $15 | bounded skeptical check |
| The hardest synthesis / final judge | **Opus 4.8** (or **Fable 5** `claude-fable-5` $10·$50 for max capability) | — | only when correctness dominates cost |

In the `Workflow` tool this is one knob per stage: `agent(prompt, {model, effort})`.
Use `effort: 'low'` for the cheap mechanical stages, higher only for diagnose/judge.
**Default to omitting `model`** (inherit the session model) unless you're confident a
tier fits — over-routing to Haiku on a judgment stage costs more in re-work than it saves.

## 6. Context engineering for the long-horizon run

Anthropic's three levers for keeping an agent coherent past one context window — use
all three:

1. **State file on disk (structured note-taking).** A `state.json` (or `.md`) holding:
   the goal, done-criteria, per-unit current scores, what's been tried (and rejected,
   so dead ends aren't retried), and the next action. This is what makes the loop
   **resumable** and survives `/clear` or a crash. The loop reads it first every wake.
2. **Sub-agent context isolation.** Each GENERATE/JUDGE/DIAGNOSE runs in a fresh
   sub-agent that does the heavy reading (full transcripts, hits) and returns a small
   structured verdict (~1–2k tokens) to the orchestrator. The orchestrator never holds
   the raw transcripts — only the verdicts. (This is exactly what the `Workflow` tool
   does: sub-agent tool output stays out of the main context.)
3. **Compaction.** For the orchestrator's own growing history, compact at logical
   breakpoints (start max-recall, tune for precision). The `/persist` → `/compact`
   discipline already does this.

## 7. How to run it

- **`Workflow` tool** encodes the deterministic loop (DECOMPOSE → per-unit cycle →
  SYNTHESIZE) — loops, thresholds, fan-out, model routing, budget. It's the
  orchestrator-workers engine. Author one Workflow per phase; read each result before
  the next phase so you stay in the loop.
- **`/loop` (self-paced)** is the driver that re-enters across time/context windows
  when the work spans more than one session — it fires the next iteration, which reads
  `state.json` and continues. Use a long fallback interval; the harness re-invokes on
  background-task completion anyway.
- **Stop condition** lives in the loop: `while (units_failing AND rounds_without_gain < K AND budget.remaining() > floor)`.
  No silent infinite loops; `log()` what was dropped if a cap bites.

## 8. The trust gate — calibrate the judge first (non-negotiable)

**The judge is the loop's fitness function.** If it's not trusted, the loop is
**Goodhart's law in action**: it produces artifacts that game the judge, not artifacts
that are actually better. Before any autonomous honing:

- **Calibrate** — have the human rank ~20 answer pairs; confirm the judge's ordering
  matches (Spearman / agreement). Only then is "the judge says better" trustworthy.
  (This project: `npm run calibrate`; closes P2b.)
- **Run the judge at `rounds≥3`** for calibration AND for every honing iteration. A
  single round is single-shot-LLM-noise-dominated — the same code can swing Spearman
  ±0.25 run-to-run and produce phantom FAIL verdicts. The multi-round claim-recurrence
  gate damps this, but only at rounds≥3. Never read a single-round score as signal.
- If you must start before calibration, run the judge as **indicative** and insert
  **human spot-check gates** every N iterations — the loop pauses and shows the diffs +
  score deltas for approval. Slower, but it stops a drifting target.

A loop with an uncalibrated, ungated judge is the single most expensive failure mode —
it spends real tokens optimizing toward the wrong thing and *looks* like progress.

## 9. Autonomy boundaries

"No babysitting" must not mean "wake up to a broken shared system." Draw the line at
reversibility:

- **Free (no gate):** generate, judge, diagnose, draft patches, run the eval — all on
  **shadow copies** of the units. Nothing live is touched.
- **Gated (one approval, batched):** **promote** the winning change to the live/shared
  system; **spend** beyond the budget; **ship/merge.**

Run the entire loop on shadows; collect the winners; promote them in one reviewed batch.
That's full autonomy on the expensive part and one human checkpoint on the irreversible part.

## 10. Worked instantiation — this project (Algolia AC2)

| Methodology slot | This project |
|---|---|
| Units | the 4 source specialists + the coordinator + the warm-baton flow |
| GENERATE | fire the question bank at a (shadow) Agent Studio agent — `run_baton.mjs` |
| Eval | `support/technical/academy/marketer_question_bank.json` + the 4-dim judge (`@lab/judge`) |
| Judge model | Sonnet (live/batch); calibrate vs Arijit (P2b) before trusting it autonomously |
| DIAGNOSE/PATCH | Opus — read the failing transcripts, name the mechanism, edit `instructions_*.md` |
| keep-if-better | re-run the bank; keep the prompt only if composite ↑ and grounding floor held |
| Shadow | a cloned `ac2-*-shadow` agent per specialist; live `ac2-*-neural` is the gated promote target |
| State | `scripts/setup/honed/state.json` — per-agent scores, prompts tried, next action |
| E2E | warm-baton multi-turn across coordinator→specialist, judged end-to-end |
| Stop | all 5 units ≥ bar, or K rounds no gain, or budget hit |

## 11. Anti-patterns (named, so future-me spots them fast)

- **Optimizing against an uncalibrated judge** → Goodhart. Calibrate or gate (§8).
- **Honing on the live shared system** → irreversible blast radius. Use shadows (§9).
- **Over-routing to cheap models on judgment stages** → garbage diagnoses, more re-work than the saving. Route by difficulty, not by reflex (§5).
- **No state file** → the loop re-tries dead ends and can't resume after a context reset (§6).
- **Tie-chasing** → keeping a patch that's within noise. Keep only on a real, floor-preserving gain (§4).
- **Building the full gym before a 3-question check proves the path** → violates start-simple. Scale the harness to the ask.

## References

- Anthropic, *Building Effective Agents* — prompt chaining, routing, parallelization, orchestrator-workers, evaluator-optimizer, autonomous agents; "route easy/common to smaller models"; "start simple, add complexity only when it helps."
- Anthropic, *Effective Context Engineering for AI Agents* — compaction, structured note-taking (memory files), sub-agent context isolation for long-horizon coherence.
- Local: `~/.claude/CLAUDE.md` (Fix-and-Learn loop), `docs/sop/lessons-log.md`, the `autocorrect-loop` + `ai-judge` skills, the `Workflow` tool, the `/loop` skill.
