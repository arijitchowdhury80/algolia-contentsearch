# UX Design v1 — Answer-Quality Lab (first pass, for iteration)

> First-pass experience design. Opinionated starting point to react to and iterate.
> Build vehicle later = `frontend-builder` (design-thinking) / optionally formalize via `ui-architect`.
> Reuses existing assets: resizable lanes, pinnable analysis rail, SSE streaming, timing.

## North star
Make the proof **visible and defensible in one screen**, and make the **multi-agent orchestration the wow**. Show, don't tell ([[feedback-show-dont-tell]]): every claim backed by real evidence (sources, flagged claims, the actual config diff, which specialist fired) — never vanity labels.

## The core idea — the 2×2 IS the interface
The experiment is a 2×2. So the hero visual is a **2×2 matrix scoreboard** that tells you who won and by how much at a glance, sitting above the four readable answers, with a drill-down rail for *why*. Five layers, progressive disclosure:

- **Layer 0 — Question.** Input + pick-from-set + Run-all-4.
- **Layer 1 — The Matrix.** 2×2 scoreboard: composite score per cell, winner glow, the three deltas (neural lift, multi lift, compound). The headline.
- **Layer 2 — The Answer Lanes.** The four actual answers (streaming, resizable, focus/collapse). The substance.
- **Layer 3 — The Analysis Rail.** Why a cell won: 3-dim judge breakdown, grounding evidence (flagged claims / clean), sources, and the keyword-vs-neural config diff. The proof.
- **Layer 4 — The Orchestration view.** Maverick → specialists, parallel fan-out + synthesis. The wow (multi-agent panels only).
- **Separate — Leaderboard.** Batch aggregate over the whole question set: proof at scale.

## Layout — main "Arena" (Live mode)
```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Algolia Answer-Quality Lab        [ Live ▸ ] [ Leaderboard ]      ⚙ config  ⓘ    │
├──────────────────────────────────────────────────────────────────────────────┤
│ Ask: ┌──────────────────────────────────────────────┐ [▶ Run all 4]  ↻ set    │
│      │ How do I add typo tolerance to my search?     │                         │
│      └──────────────────────────────────────────────┘                         │
├──────────────────────────────────────────────────────────────────────────────┤
│ THE MATRIX                         Keyword          Neural                     │
│                                 ┌────────────┐  ┌────────────┐                 │
│                    Single agent │ 6.4  ▁▃▂   │  │ 7.1  ▂▅▃   │   ◂ click a     │
│                                 │ P1         │  │ P2         │     row/col to   │
│                                 └────────────┘  └────────────┘     isolate one │
│                                 ┌────────────┐  ╔════════════╗     variable    │
│                     Multi-agent │ 7.0  ▂▄▄   │  ║ 8.3 ★▃▆▆   ║                 │
│                                 │ P3         │  ║ P4         ║                 │
│                                 └────────────┘  ╚════════════╝                 │
│   neural lift +0.9 →   ·   multi lift +1.2 ↓   ·   compound P1→P4 +1.9          │
└──────────────────────────────────────────────────────────────────────────────┘
```
Clicking the **Neural** column header (or **Multi** row) dims the rest and tells that one story — "watch what neural alone does" — the demo's isolate-a-variable move.

## Layout — lanes + rail
```
┌ P4 · Multi · Neural · 8.3 ★ ──────────────┐  ┌ ANALYSIS RAIL ─────── 📌 ┐
│ Typo tolerance is configured via the      │  │ Showing: P4  ▾           │
│ typoTolerance setting ... [streams]        │  │ ──────────────────────  │
│                                            │  │ Grounding   ▆▆▆   9.0   │
│ ⌁ Maverick → Technical ✓  (others idle)    │  │ Confidence  ▆▆▅   8.0   │
│ ⏱ 4.2s   📎 5 sources   ✅ grounded         │  │ Breadth     ▆▆▆   8.0   │
│ [ Sources ] [ Trace ] [ Why it won ]       │  │ Composite         8.3   │
└────────────────────────────────────────────┘  │ ──────────────────────  │
┌ P1 6.4 ▸ ┐┌ P2 7.1 ▸ ┐┌ P3 7.0 ▸ ┐ (slim,    │ ✅ 0 unsupported claims  │
└──────────┘└──────────┘└──────────┘  click     │ 📎 /doc/typo-tolerance   │
                                       to focus) │ 📎 /doc/.../typos        │
                                                 │ ⚙ vs P3: mode = neural   │
                                                 └──────────────────────────┘
```
Default: the focused/winning lane is expanded; the other three collapse to slim score bars you click to swap in. The rail follows the focused panel (or a clicked claim).

## Layout — the Orchestration wow (multi-agent panels)
```
            ┌──────────┐
            │ MAVERICK │  entities: {feature: typo-tolerance} → route: Technical
            └────┬─────┘
      ┌──────────┼───────────┬───────────┐         (parallel fan-out)
      ▼          ▼           ▼           ▼
   ┌──────┐  ┌──────┐    ┌──────┐    ┌──────┐
   │Tech ✓│  │Mktr ·│    │Acad ·│    │Supp ·│
   └──┬───┘  └──────┘    └──────┘    └──────┘
      └──► 5 grounded docs ──► Maverick synthesizes ──► answer
```
Lights up live as it runs. This is the single most differentiated thing we show — it makes "multi-agent" tangible, not a label. Inline mini-version in the lane; full version in a drawer.

## Layout — Leaderboard (batch, authoritative)
```
┌ SCORECARD · 24 questions · batch (full sources) ───────────────────────┐
│                     Keyword     Neural      ▲ neural                    │
│           Single    6.1         6.9         +0.8                         │
│           Multi     6.8         8.0         +1.2                         │
│           ▲ multi   +0.7        +1.1                                     │
│  Verdict: neural > keyword everywhere · multi > single everywhere ·      │
│           best = Multi+Neural, +1.9 over the Single+Keyword baseline.    │
│  Grounding: all cells 100% clean.                                        │
│  per-question ▸ [Q1] [Q2] … (expand any row to see the 4 answers+scores) │
└──────────────────────────────────────────────────────────────────────────┘
```
Live = "proof for this question" (fast, thin-source-indicative). Leaderboard = "proof at scale" (authoritative). Same 2×2 grammar in both, so the mental model never changes.

## The narrative arc (what a viewer experiences)
1. Ask (or pick a question from the recreated set).
2. Run → matrix cells go "thinking"; four answers stream; multi-agent lanes show Maverick orchestrating.
3. Answers land → judge runs → matrix fills, winner glows, the three deltas appear.
4. Click the winner → rail shows *why* (dims, grounded sources, the config that drove it).
5. Toggle Leaderboard → the aggregate 2×2: the whole thesis, proven across the set.

## v1.1 — Axis swap + panel & judging specs (2026-06-18)

### Matrix axis SWAPPED (supersedes the orientation above)
Rows = retrieval (Keyword, Neural). Columns = architecture (Single, Multi).
**Canonical panel numbering (FINAL, row-major):** P1 = Single+Keyword · P2 = Multi+Keyword · P3 = Single+Neural · P4 = Multi+Neural → indices `SINGLE_KEYWORD` / `MULTI_KEYWORD` / `SINGLE_NEURAL` / `MULTI_NEURAL`.
```
THE MATRIX                    Single agent      Multi-agent
                            ┌──────────────┐  ┌──────────────┐
                    Keyword │ P1   6.4 ▁▃▂ │  │ P2   7.0 ▂▄▄ │   → multi lift (across a row)
                            └──────────────┘  └──────────────┘
                    Neural  │ P3   7.1 ▂▅▃ │  ║ P4 ★ 8.3 ▃▆▆ ║   ↓ neural lift (down a col)
                            └──────────────┘  ╚══════════════╝   ⤢ compound  P1 → P4
```
"Journey to the corner": right = add agents, down = add neural; bottom-right P4 = full power. The three deltas remain the argument — multi-lift (row), neural-lift (column), compound (diagonal).

### Panel spec (anatomy of one cell / lane)
**Identity (always visible):** `P# · Single|Multi · Keyword|Neural`, the index it hits, mode badge, agent-type badge.
**Lifecycle states:** idle → submitting → streaming (partial text + live elapsed) → answered → judging → judged (score badge; ★ if top) · plus **refused** (clean refusal = grounded-good, ✋ not ⚠) · error/timeout.
**Body:** streamed markdown answer with inline citations `[n]` linking to the source it used.
**Footer/status chips:**
- Multi-agent only: orchestration mini-trace (`Maverick → Technical ✓  Marketer ·`).
- Grounding chip: `✅ grounded (0 flagged)` / `⚠ n flagged`.
- `📎 n sources` · `⏱ firstToken / total`.
- Actions: `[Sources] [Trace]*(multi)* [Why it won]` → open the rail.
**Single vs Multi:** identical shell; single panel's "trace" = one search (query + hits); multi panel's trace = full Maverick orchestration. Everything else (model, grounding instructions, judge) is held constant — only architecture + retrieval vary.
**Panel data contract (consumed):**
- stream: answer tokens.
- on-complete: `{ answer, sources:[{title,url,source}], timing:{firstTokenMs,totalMs}, trace? }` where `trace = { entities, specialists:[{name,fired,hits}], synthesisMs }` (multi only).
- judge: `{ perJudge:[…], dims:{grounding,confidence,breadthDepth}, composite, flaggedClaims:[{text,votes}], winner }`.

### Scoring & judging spec
**Judge inputs (per panel, per question):** the question · the panel's answer · **the exact sources THAT panel retrieved** (grounding is judged against what this system actually found). Judge is **blind** to which cell it is (sees only question+answer+sources) → no architecture/retrieval bias.

**Dimensions (0–10 each):**
1. **Grounding** — *weight ×2 + hard floor.* Is every factual claim supported by the provided sources? Scored on citation coverage + source relevance + no contradiction. A correct **refusal** (not in sources → refuse + route) scores HIGH here. *(carry-over: grounding counts double — [[project-judging-multidimensional]])*
2. **Confidence** — *×1.* Decisive, clear, well-structured, appropriately certain; no hedging/vagueness. Grounded confidence, not bravado.
3. **Breadth & depth** — *×1.* Completeness + depth against the question, using available sources.

**Hard floor (the gate):** judges extract factual claims and flag unsupported ones. A claim is "unsupported" only by **supermajority (≥2 of 3 judges)** — the zero-flicker rule ([[feedback-grounding-supermajority-vote]], [[feedback-zero-flicker-judge]]). If ≥1 supermajority-unsupported claim → grounding capped ≤3 AND composite capped ≤4. Hallucination is disqualifying.

**Composite:** `(2·grounding + confidence + breadthDepth) / 4`, then apply the hard-floor cap. Per dimension = **mean of 3 judges**; temp-0 → same verdict twice.

**Why this is fair across keyword vs neural:** each cell is judged against its OWN retrieved sources, so a thin keyword retrieval shows up as **lower breadth/depth** (and lower confidence), NOT as grounding violations — as long as the agent only claims what it found. Neural's advantage surfaces as richer grounded coverage. That's exactly the effect the 2×2 should reveal.

**Live vs batch:**
- **Live** (Arena): fast model (gemini-2.5-flash), fewer judges/round, parallel, SSE-streamed (~20s). Uses the thin live sources → **indicative** (tends to cap good answers ~3.0). Labeled as such.
- **Batch** (Leaderboard): authoritative — gemini-2.5-pro, 3 judges, full sources. Drives the official 2×2.

**Display (rail):** per-dim bars + composite (mean-of-3) · **flagged-claim card** showing the actual unsupported claim text + "2/3 judges" (show, don't tell — [[feedback-show-dont-tell]]) · hard-floor badge (✅ clean / 🚫 capped + reason) · the config diff that explains the cell.

> Build note: reconcile exact weights / cap values with the existing `lab/judge` implementation when we write the plan — this spec is the target.

## v1.2 — Canonical layout (Arijit's sketch + interactions)

**Layout = 2×2 panel grid + Judge drawer (supersedes the matrix-scoreboard-on-top concept).**
```
┌─────┬──────────────────────────┬──────────────────────────┬─ JUDGE (drawer) ─┐
│     │ Single Agent · score · t │ Multi Agent · score · t  │ slides in from   │
│  K  │ P1  answer…              │ P2  answer…              │ the right when a │
│  e  │  · src pills (dynamic) · │  · src pills (dynamic) · │ score is clicked │
│  y  ├──────────────────────────┼──────────────────────────┤ · pinnable       │
│  N  │ P3  answer…              │ P4  answer…              │ · foldable       │
│  e  │  · src pills (dynamic) · │  · src pills (dynamic) · │ shows the CLICKED │
│  u  │ Single Agent · score · t │ Multi Agent · score · t  │ panel's verdict   │
└─────┴──────────────────────────┴──────────────────────────┴──────────────────┘
```
- The 2×2 grid **is** the scoreboard — each panel header carries its own composite score + time; score+time **sandwich** the grid (keyword bars top, neural bars bottom). Rows = retrieval (left vertical labels), cols = architecture.
- **Source pills:** a dynamic row at the bottom of each panel — one pill per source the answer actually used (count varies by answer; not fixed). Click a pill → open/preview that source.
- **Score is the trigger:** click a panel's composite score → the **Judge drawer slides in from the right** showing THAT panel's judge breakdown (3-dim bars, composite, grounding/flagged-claim cards, "why"). **Pin** to keep it open; **fold** to collapse. Per-panel (which score you click decides what opens). This is the existing pinnable-rail pattern, score-triggered.

### Still to place (open)
- **Orchestration trace** (multi panels): now that the bottom row is all source pills, where does the Maverick→specialist trace live? Proposal: a small `⌁ trace` affordance in the multi-panel header/footer that expands inline or opens its own drawer. (Single panels: same affordance shows their one search.)
- **The deltas / comparison story** (multi-lift · neural-lift · compound): a per-panel drawer shows one panel at a time, but the 2×2 ARGUMENT is comparative. Where do the three deltas surface? Options: (a) small delta arrows drawn between panels on the grid; (b) the open drawer shows the clicked panel + its deltas vs the relevant siblings; (c) a separate compact "verdict" strip. Proposal: (b) + a persistent compound/winner badge on the grid.
- Source-pill click = open source vs inline preview.

## v1.3 — Judge panel content spec (one consistent panel, all 4)
Triggered by clicking a panel's score; slides in from the right; pinnable + foldable. Identical structure for every panel (single panels show "one search" where multi shows orchestration). Answers: what scored · why · is it grounded · how it compares.

Blocks, top → bottom:
1. **Identity + composite** — `P# · arch · retrieval`; big composite `/10`; ★ if winner; mode badge (**live = indicative** / **batch = authoritative**) + judge model + # judges + judge time; one-line plain-English verdict.
2. **Hard-floor status** — `✅ grounding floor passed` / `🚫 capped (reason)`.
3. **Dimensions (core)** — Grounding (**×2**), Confidence, Breadth&Depth: bar + **mean-of-3** + spread, each with a one-line rationale.
4. **Grounding detail** — claims supported / flagged counts; **flagged-claim cards** = the actual claim text + "unsupported (k/3 judges)". Show, don't tell.
5. **Sources used** — the pills expanded: title · url · source-type (optional claim→source citation mapping).
6. **Comparison (the 2×2 story, per panel)** — multi-lift (vs the single in its row), neural-lift (vs the keyword in its column), compound (vs P1). ← the deltas live here.
7. **▸ How it answered (expand)** — process + real config: multi = Maverick's entities + which specialists fired (parallel) + synthesis; single = its one search query + hits; plus the config diff (mode / index / key settings) that defines this cell.
8. **▸ Per-judge detail (expand)** — each of the 3 judges' per-dim scores + the supermajority vote on flagged claims. Proves reproducibility (zero-flicker).

### LEAN DEFAULT (revised — progressive disclosure)
Rule applied: a block is *always visible* only if valuable on EVERY answer; contextual value → conditional/expander; redundant-with-panel → cut/merge.
- **Always visible (3):** ① Composite+verdict+grounding-status · ②③ Dimensions (bar+number; rationale on hover) · ⑥ Comparison (the deltas).
- **Conditional:** ④ Grounding — NOT a standing block; the grounding badge in ① **expands into flagged-claim cards only when there's a violation**.
- **Cut/merge:** ⑤ Sources — pills already live on the panel; keep only the claim→source *mapping*, folded into grounding-on-violation / "how it answered".
- **Expanders:** ⑦ How it answered (trace+config) · ⑧ Per-judge detail.
- Resolves open items: deltas → block ⑥; trace → block ⑦ (in-drawer).

### Dual-layer judges — 3 DIVERSE perspectives (2026-06-18)
**Keep 3 judges only because they're diverse perspectives (not 3 identical samples).** Identical-at-temp-0 ≈ 1 judge → would collapse to 1. Diverse lenses catch what others miss AND make the supermajority gate meaningful.
- **🔍 Skeptic** (adversarial; strict on **grounding** — drives the hallucination gate) · **🛠 Practitioner** (would this help the asker?; **confidence/usefulness**) · **🎓 Expert** (complete/accurate/deep?; **breadth/depth**).
- Each judge scores the **same** rubric/dimensions through its lens; mean balances biases; supermajority (≥2/3) drives the grounding gate.
- **UI = one template + a judge selector.** Top of drawer, a labeled row of **avatar chips** (visible + appropriate, NOT bare emoji): `JUDGES: ◉ Synthesis 8.3 · ○ 🔍 Skeptic 7.9 · ○ 🛠 Practitioner 8.4 · ○ 🎓 Expert 8.1`. Each chip = icon + name + that judge's own score (so the spread is visible before clicking). Synthesis = highlighted home/default (Layer 2: composite + mean dims + comparison). Hover tooltip explains the lens ("Skeptic — assumes claims wrong until sourced; strict on grounding"). Selected = filled vs outline; a `‹ back to Synthesis` breadcrumb when inside a judge. Accessible: real text labels, keyboard-navigable, per-persona color accent.
- **Inline consensus marks** on each dimension bar show where all 3 judges landed + the mean (tight=agreement, spread=contested) — value of 3 perspectives visible without leaving synthesis. Click a judge chip → SAME template reloads to that judge's scores + rationale + its flagged claims (Layer 1).
- **Count tied to tier:** BATCH = 3 diverse judges (authoritative); LIVE = 1 judge (indicative, fast). Per-judge layer only exists in batch.

### Scoring rulings (recommended 2026-06-18 — pending final confirm)
1. **Blind judge, scored vs each panel's own retrieved sources.** Fair + credible. → adopt.
2. **Grounding = hard GATE, weight ×1 (NOT ×2). [CONFIRMED 2026-06-18]** Grounding is a floor everyone passes (110% grounded enforced); double-weighting lets that one parameter dominate the composite and flatten everything else. So: grounding disqualifies hallucination (cap-on-violation) but the composite is driven by the **differentiators (confidence + breadth/depth)**. Grounding shown for transparency at ×1. *(Differs from existing `lab/judge` ×2 — reconcile at build.)* Composite = gate × mean(grounding, confidence, breadthDepth) with grounding at ×1 (i.e., equal weight, not double).
3. **Live = indicative (labeled), batch = authoritative.** Keep two tiers; live must self-label indicative.

```
┌ JUDGE · P4 · Multi · Neural ───────────── 📌 ✕ ┐
│ COMPOSITE  8.3/10  ★    batch · pro · 3 judges  │
│ "Fully grounded, broad, decisive."              │
│ ✅ grounding floor passed                       │
│ ──────────────────────────────────────────────  │
│ DIMENSIONS                        (mean of 3)    │
│  Grounding ×2  ▆▆▆▆▆▆▆▆▆░ 9.0  ·8–10· every       │
│                                claim cited       │
│  Confidence    ▆▆▆▆▆▆▆▆░░ 8.0  ·7–9·  decisive    │
│  Breadth/Depth ▆▆▆▆▆▆▆▆░░ 8.0  ·8–9·  config+ex+  │
│                                       caveat     │
│ ──────────────────────────────────────────────  │
│ GROUNDING   6 claims · 6 supported · 0 flagged   │
│   (flagged → card: "claim…"  2/3 judges)         │
│ ──────────────────────────────────────────────  │
│ SOURCES (5)  • Typo Tolerance /doc/typo-toler…   │
│              • Configuring typos /doc/…/typos …  │
│ ──────────────────────────────────────────────  │
│ COMPARISON                                       │
│   multi-lift  vs P3  +1.2 ▲                       │
│   neural-lift vs P2  +1.3 ▲                       │
│   compound    vs P1  +1.9 ▲                       │
│ ──────────────────────────────────────────────  │
│ ▸ How it answered (trace · config)               │
│ ▸ Per-judge detail (3 judges)                    │
└──────────────────────────────────────────────────┘
```

## v1.4 — Leaderboard view (batch aggregate, authoritative) — 2026-06-18

Same 2×2 grammar as the Arena, aggregated across the whole question set; the official "proof at scale." Four layers:
1. **Aggregate 2×2 + verdict (headline)** — same grid (rows retrieval, cols architecture); each cell = **mean composite** across all questions; winner glows; the **three deltas** (neural-lift down cols, multi-lift across rows, compound P1→P4) stated as a one-line verdict; plus the **grounding headline** ("100% clean across N answers").
2. **WHY — dimension attribution** [first-class, recommended] — decomposes where each lift comes from (e.g., neural lift mostly breadth/depth → proves the retrieval mechanism). Turns the number into an argument.
3. **Per-question table** — rows = questions, cols = P1–P4 composites, winner per row, `⚠` on thin/contested; **click a row → the Arena 4-panel + judge drawer for that question** (reuses existing UI, no new machinery).
4. **Expanders (advanced)** — win-rate per cell, score distribution/spread, and **flagged/capped answers (red)** = the grounding trust audit (one click away even when 0).

Decisions (recommended, pending confirm): headline = **mean composite** (win-rate as secondary expander); keep **dimension attribution** first-class; per-question row **reuses the Arena view + judge drawer**.
Forward note: the Leaderboard is the metric the **autocorrect loop** optimizes; a **"compare two runs"** overlay (before/after a config change) is Phase 2, not now.

## Open design choices (to decide together)
- Matrix-on-top + focus-one-lane (my pick) vs always-show-all-4-full vs 2×2 grid of full cards.
- Orchestration: inline-mini + drawer (my pick) vs full-screen moment on every run.
- Rail vs bottom-drawer for analysis (rail = my pick; it's the existing pattern).
- How much config/grounding to show by default vs on click.
