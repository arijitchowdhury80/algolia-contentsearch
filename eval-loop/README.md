# eval-loop

A provider-agnostic toolkit for **LLM answer-quality evaluation and automatic improvement**, packaged as a Claude Code plugin with two skills. Extracted from the Algolia Answer-Quality Lab; reusable in any project.

## What's in the box

| Component | What it does |
|---|---|
| **`ai-judge` skill** + `packages/judge` | Score one answer with a blind 3-persona panel on a weighted rubric, with a **zero-flicker grounding gate** (same answer → same pass/fail verdict, every run). Catches hallucination / unsupported claims. |
| **`autocorrect-loop` skill** + `packages/autocorrect` | Iteratively optimize a system's config/prompt: evaluate → diagnose → propose → re-evaluate → **keep-if-better / rollback**, with grounding as a hard constraint, a held-out overfit guard, and noise-safe decisions. Runs on the judge as its fitness signal. |

Both packages are **near-zero-dependency** (no vendor SDK — only `node:` built-ins). Everything that touches the outside world is an **injected function**, so the same code ports to any LLM and any system under test.

## The one idea that makes it portable
Like the judge talks to any model through one injected `LlmComplete`, the loop drives any system through three injected seams: `deploy(config)`, `evaluate(split)`, `propose(...)`. The cores know nothing about Algolia, Gemini, or prompts — you supply the adapters.

## Install in another project
1. Copy the packages you need:
   ```bash
   cp -R eval-loop/packages/judge        <project>/packages/judge
   cp -R eval-loop/packages/autocorrect  <project>/packages/autocorrect   # depends on judge
   ```
2. Install the plugin so the skills are discoverable (or copy `skills/` into your agent's skills dir).
3. Write the adapters (one LLM function for the judge; three seams for the loop). The skills walk through this.

`packages/` here is a **snapshot** of the canonical sources in `lab/judge` and `lab/autocorrect`; refresh it with `./sync-packages.sh`.

## Quick start
- Scoring answers? → read the **ai-judge** skill (`skills/ai-judge/SKILL.md`).
- Auto-optimizing a system? → read the **autocorrect-loop** skill (`skills/autocorrect-loop/SKILL.md`). It requires the judge.

## Why "zero-flicker" matters
An optimization loop decides "keep or roll back" from the judge's score. If the judge gives the same answer different verdicts run-to-run, the loop chases noise — keeping bad changes and discarding good ones. This toolkit makes the grounding verdict **reproducible** (temperature-0 judging + claim-recurrence gate) and makes the loop **noise-safe** (it ignores any gain smaller than the measured noise floor). Together: the loop only ever acts on real signal.

## Provenance
Built and validated against a 27-question Algolia answer-quality set on Gemini 2.5 Pro. Judge stability proven empirically: 0 grounding-gate flips across repeated runs of identical answers. See `docs/experiment/` in the parent repo for the methodology and run logs.
