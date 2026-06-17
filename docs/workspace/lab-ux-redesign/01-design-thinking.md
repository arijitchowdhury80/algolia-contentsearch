# Design thinking (condensed → ADR-001)

Design-thinking was completed during the UX-research conversation (2026-06-17) and
locked in `docs/design/adr-001-lab-ux-redesign.md`. This file maps that work onto
the frontend-builder's six questions — it does not re-derive it.

### 1. Mental model
**"Side-by-side comparison bench + chat."** The user is a benchmarker running one
conversation against N systems and reading verdicts. They expect: parallel lanes
they can scan left-to-right, a clear winner signal, and a way to keep talking.
Confusion risk: making it feel like one chat (it's N), or hiding the verdict.

### 2. Information architecture (emphasis tiers)
| Element | Tier |
|---|---|
| The N lane answers (the comparison itself) | **Hero** (the rail) |
| Per-lane score pill + the composer | **Primary** |
| Follow-up callout (engagement loop) | **Primary** when present |
| Grouped source pills | **Secondary** (collapsed; detail on demand) |
| Full judges / config-diff / synthesis | **Secondary** (in drawer, on demand) |
| Lane metadata (index/engine), header chrome | **Supporting** |
Tier-inflation fixed: analysis detail demoted from permanent bottom-40% → on-demand drawer.

### 3. Interaction flow
Top-3 actions (must be 1–2 clicks): **(a)** ask/follow-up (composer, always present),
**(b)** open analysis (verdict chip / lane ⚖), **(c)** expand a source group (pill click).
Happy path: type query → lanes stream → scores appear in headers → (optional) open
drawer for why → (optional) answer a follow-up → next turn threads in all lanes.
No dead ends: after an answer, the composer invites the next turn.
States: **empty** = centered hero composer + empty lane cards; **loading** = streaming
caret per lane, "judging…" in drawer trigger; **error** = per-lane error bubble +
drawer error ("backend on :8787?").

### 4. Cognitive load budget
Simultaneous chunks at rest: rail (1) + composer (1) + verdict chip (1) = **3**. Each
lane is one chunk but they're a scannable set, not independent widgets. Drawer (+1
when open) and source popovers (+1 transient) are **on-demand**, not resident → stays
within budget. This is the whole point of D2/D3: move detail off the resting screen.

### 5. Emotional journey
Curiosity (ask) → focus (watch lanes diverge) → **confidence** (clear verdict pill:
who won, by how much) → engagement (follow-up invites another turn). The score pill
and FollowUpCallout carry the emotional weight.

### 6. Pre-mortem
**Tigers:** (a) rail feels like infinite scroll with no end — mitigate with scroll
affordances (◀ ▶ fades) + fixed card width so count is legible; (b) drawer covers
lanes — mitigate: overlay, dismissible, lanes stay scrollable; (c) multi-turn
confuses "which lane am I talking to" — mitigate: composer label "goes to all
systems", shared user bubbles in every lane; (d) mobile: rail → existing 1-lane tab
switcher, drawer → full-screen sheet. (e) a11y: pills/chips/drawer need labels +
keyboard + focus traps.
**Elephants:** not user-tested (it's an internal sales/benchmark lab — acceptable);
spec risk low (decisions are Arijit's own, with precedent); perf fine (no new heavy deps).
