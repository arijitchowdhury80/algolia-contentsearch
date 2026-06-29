# Specialist Honing Gym — driver & runbook

Autonomous evaluator-optimizer that hones each Algolia specialist prompt on its **shadow**
agent, keeps only floor-preserving gains, and promotes winners to live in one **gated** batch.
Implements `docs/sop/autonomous-honing-methodology.md`.

## Pieces (all in `scripts/setup/honed/`)
| File | Role |
|---|---|
| `gym_state.json` | **Resumable state** (SOP §6/§10). Read FIRST every wake. Per-unit scores, tried/rejected, next action. |
| `gym.workflow.js` | **The executor** — a `Workflow` script. DECOMPOSE→per-unit evaluator-optimizer→synthesize. Run via the Workflow tool (needs opt-in). |
| `clone_shadow.mjs` | Make/refresh `ac2-<role>-shadow` (config-faithful clone of live). |
| `baton_eval.mjs` | **Eval primitive** — warm-baton one question → judge-ready request (answer + source **bodies**). Pipe into `judge:cli`. |
| `run_baton.mjs` | Full multi-turn warm-baton (eyeball pass; lossy sources). |
| `push_honed.mjs` | **Promote** a winning prompt to live (`push`) / snapshot / restore. The gated step. |
| `agent_admin.mjs` | `update <id> <file>` = PATCH+publish one agent. Used to deploy candidates to the shadow. |

## Loop (per SOP §4)
```
read gym_state.json → pick unit with status != done and not BLOCKED
BASELINE  measure shadow (ours) + live (floor) over the bank, split dev/held-out
for each round (≤ maxRoundsPerUnit):
  DIAGNOSE+PROPOSE  (Opus) read instructions + weakest dims + rationales → name mechanism, rewrite prompt
  APPLY             (Haiku) deploy candidate to the SHADOW only → re-eval dev+held-out
  KEEP/ROLLBACK     keep iff grounding held AND dev gain ≥ minImprovement AND held-out not regressed
  persist round → gym_state.json
SYNTHESIZE  full multi-turn warm-baton, judged, must not regress
PROMOTE     (GATED) push_honed push <live> <winner file>
```

## Hard invariants
- **Deploy → shadow only.** `deploy()`/apply must refuse any agent whose name ≠ `*-shadow`. Live `ac2-*-neural` is the **promote** target, nothing else writes it.
- **Judge is INDICATIVE until P2b.** Calibration (Spearman ≥ 0.7 vs Arijit's blind ranking) is **not done**. Per SOP §8, running the loop in *trust* mode against an uncalibrated judge = Goodhart. Until P2b: use `mode:'spotcheck'` (one round, human reviews the diff + delta) or `mode:'smoke'` (mechanics only).
- **Judge rounds ≥ 3** always (rounds<3 = noise).
- **Promote is gated** — one human approval, batched, via `push_honed`. Snapshot first (`push_honed.mjs snapshot`) so restore is one command.

## Run modes (args to gym.workflow.js)
- `{unit:'support', mode:'smoke'}` — stub proposer, proves the wiring, ~no propose spend.
- `{unit:'support', mode:'spotcheck'}` — ONE real round, returns for human review. **Default pre-P2b.**
- `{unit:'support', mode:'trust', maxRounds:4}` — full loop. **Only after P2b passes.**

## /loop driver
`/loop` re-enters across context windows. Each wake:
1. Read `gym_state.json`; if `blockers` non-empty (P2b), STOP and report — don't burn tokens optimizing toward an unproven judge.
2. Else pick the next unit (`status != done`), ensure its shadow exists (`clone_shadow.mjs <role>`), and run `gym.workflow.js {unit, mode}`.
3. Persist results to `gym_state.json` (the workflow's Bash agents do this).
4. In spotcheck mode, surface the kept/rejected diff + score delta and **pause for human** before the next round.
5. Stop when all units meet doneCriteria, or `patience`/`maxRounds` exhausted, or budget hit.

## Status (2026-06-29)
- ✅ Shadow capability built; `ac2-support-shadow` created (config-faithful clone).
- ✅ Eval path proven on the shadow: `baton_eval | judge:cli` (rounds=3) → SUP-1 composite 8.21, gate clean.
- ✅ Executor (`gym.workflow.js`), state, and this driver authored.
- ⛔ **BLOCKED on P2b** before any trust-mode run. Next: do P2b calibration (~45 min blind ranking), then `mode:'trust'`.
