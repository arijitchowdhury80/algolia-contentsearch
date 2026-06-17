# ADR-001 — Answer-Quality Lab UX redesign

**Status:** Accepted (2026-06-17) · **Supersedes:** the original 3-column + bottom-40%-analysis layout
**Decision owner:** Arijit · **Drafted by:** Claude (co-founder partner)

---

## Context

The lab today is a **single-turn comparison tool**: one query fans out to 3 fixed
columns (① Current Website Search · ② Ask AI floor · ③ Our System), with an
"Analysis & Synthesis" panel pinned to the bottom 40% of the screen. Four UX
problems surfaced, the last of which is the master constraint:

1. **Analysis panel eats real estate.** The bottom 40% is permanently consumed
   even when there is nothing to show; the answers (the hero) are cramped.
2. **Sources are a flat numbered list.** `[1] [2] [3]…` stacked vertically —
   eats premium vertical space, no grouping, no focus.
3. **The follow-up question gets lost.** The agent's two-way/clarifying question
   is rendered as prose *inside* the answer Markdown, so the engagement loop is
   invisible. There is no real conversation affordance.
4. **Scalability (the master constraint).** Phases 2–3 add more panels
   (multi-agent A2A variants). "3 equal columns" becomes unreadable slivers at
   N=5–6. **How we scale to N panels dictates the whole layout** — it forces the
   answer to problem #1.

## Decisions

Four forks, each chosen by Arijit on 2026-06-17, with the UX precedent behind each.

### D1 — Panels: full-height **horizontal-scroll lane rail**
Fixed-width cards (~380px), full viewport height, scroll horizontally when they
exceed the screen. Scales to any N, keeps every lane readable, and tells the
①→②→③→④ "each system improves" story left-to-right.
*Precedent:* Kanban / Trello / GitHub Projects boards.
*Rejected:* select-to-compare (hides the full field), pinned-baseline (less
general), wrap grid (breaks side-by-side alignment, the whole point).

### D2 — Analysis: **right-side drawer + always-visible scores in lanes**
Each lane header shows its score pill (the verdict headline) at all times. The
full judges / config-diff / synthesis detail opens in a pull-out **right drawer**
on demand. Frees the bottom 40% entirely → lanes get full height.
*Precedent:* progressive disclosure — Linear issue detail, Figma inspect, VS Code panels.

### D3 — Sources: **grouped collapsed pills**
Group by `source_type` → a row of pills with count badges
(`📄 Docs 4 · 📝 Blog 2 · 🎓 Academy 1`). Click a pill → popover listing that
group's titles + links. Port the Algolia-Central pattern, adapted to the lab's
**light theme**, built as a small **dependency-free** popover (no Radix — matches
the lab's plain-CSS, dependency-free stack).
*Source of pattern:* `AlgoliaRAG/Github/algolia-central` `ChatMessage.tsx`
(grouping by `source_type`, count badges, popover-on-click).

### D4 — Conversation: **full multi-turn now**
Lanes become chat threads; a persistent composer replaces the one-shot hero
search; multi-turn discovery across systems. (Pulls Phase-2 conversation work
forward — but see "Read-receipt finding": the engine already exists.)

## Conversation model — "shared turns, parallel threads"

The only model that keeps the comparison **fair**:

- The bottom composer sends **each turn to every active lane at once** — every
  system gets the identical conversation.
- Each lane keeps its **own thread**: shared user turns (right-aligned bubbles) +
  that system's responses. Each lane reads as a complete conversation.
- When **any** lane asks a follow-up, it renders the elevated **🤔 callout** with
  quick-reply chips. Clicking a chip / typing sends the reply to **all** lanes.
  Answering ③'s "ecommerce or docs?" also advances ② and ① — instructive, not a
  bug: you see how each system handles the same clarification.

**Edge cases resolved up front:**
- **① Website is not conversational.** Each turn re-runs the keyword search for
  that turn's query; the lane stacks per-turn result sets. No fake chat.
- **Verdict in multi-turn:** lane score pills + drawer reflect the **latest
  turn**. Per-turn verdict history is deferred (non-goal for now).

## Read-receipt finding — multi-turn is already wired

Per the protocol-read-receipt rule, before committing to D4 we verified the
Agent Studio contract:

- **Source:** `web/src/lib/agentStudioClient.ts:8-13, 166-189`
  > `Body: { messages: [...history, {role:'user', content}] }`
  > `const messages = [ ...(req.history ?? []), { role: 'user', content: req.query } ]; … body: JSON.stringify({ messages })`
- **Mapping:** the completions endpoint is **stateless and conversation-native**
  (standard `messages` array, AI-SDK v4 compat). Multi-turn = replay history each
  turn. **No session ID / threading API needed.**
- **Already plumbed:** `conversation.ts:17` (`buildConversationHistory`, last 16
  msgs) + `useAgentColumn.ts:111,122,133` (each lane already accumulates messages
  and replays history). Typing a second query in the top bar *already* threads.

**Consequence:** D4 carries far less build risk than first assumed. No new
protocol, no new state engine. The work is **UI surfacing**, dropping the build
from full-stack (`feature-builder`) to mostly frontend (`frontend-builder`).

## Component & CSS change map

| Area | Change |
|---|---|
| `ColumnGrid` → **`LaneRail`** | grid → horizontal-scroll flex; fixed-width (~380px) full-height cards |
| `QueryBar` → **`Composer`** | persistent bottom input; centered hero on empty state, docks on first turn; sends to all lanes (engine already threads) |
| `AnalysisPanel` → **`AnalysisDrawer`** + verdict chip | right slide-out; cards reflow vertically; trigger from header chip + per-lane ⚖ |
| `SourceList` → **`GroupedSources`** + tiny `Popover` | group by `source_type` → collapsed pills + count badges; click → light-theme popover (dependency-free) |
| **`FollowUpCallout`** (new) | distinct accented block + quick-reply chips that prefill/submit the composer |
| `ColumnHeader` | always-visible score pill + ⚖ drawer trigger |
| `useComparison` | single-shot fan-out → conversation store (turns[]) — mostly already present per the read-receipt |
| `AgentColumn` / `WebsiteColumn` | extend for multi-turn; website stacks per-turn searches (reuses existing capture endpoint) |
| `ab.css` | drop `.lab__analysis` 60/40 split; add `.rail`, `.composer`, `.drawer`, `.srcpills`, `.followup` |

**Responsive:** rail → existing one-lane tab switcher on mobile; drawer →
full-screen sheet; composer → sticky bottom. Brand unchanged (Sora, Nebula Blue
`#003DFF`, tokens.css).

## Wireframe (desktop, active state, drawer closed)

```
┌────────────────────────────────────────────────────────────┐
│ [logo] Answer-Quality Lab                  [Export] [Reset] │
├────────────────────────────────────────────────────────────┤
│ ✦ Sample questions   One conversation → N systems   [⚖ 7.9]│ ← verdict chip → drawer
├────────────────────────────────────────────────────────────┤
│◀ ┌─────────┐ ┌─────────┐ ┌──────────┐ ┌─────────┐ ▶       │
│  │①Website │ │②AskAI   │ │③Ours 7.9⬤│ │④Multi   │         │
│  │READ-ONLY│ │ 6.8 ⬤   │ │   [⚖]    │ │  …      │         │
│  │─────────│ │─────────│ │──────────│ │─────────│         │
│  │You: …   │ │You: …   │ │You: …    │ │You: …   │ ← shared │
│  │results  │ │answer   │ │answer    │ │answer   │   turns  │
│  │         │ │[📄4 📝2]│ │[📄3 🎓1] │ │[pills]  │ ← pills  │
│  │You: …   │ │You: …   │ │🤔 f/u    │ │…        │ ← turn 2 │
│  │results  │ │answer   │ │[chip][chip]│ │         │        │
│  └─────────┘ └─────────┘ └──────────┘ └─────────┘         │
│     ←———— full-height horizontal lane rail ————→           │
├────────────────────────────────────────────────────────────┤
│ 💬 [ Ask a follow-up — goes to all systems …… ]    [Send]  │ ← persistent composer
└────────────────────────────────────────────────────────────┘
```

## Non-goals / deferred

- Per-turn verdict history (only latest turn scored).
- Per-lane *divergent* conversations (model is deliberately shared-turn for fairness).
- Server-side mechanical grounding auditor (still Stage-2-gated per project CLAUDE.md).
- Pushing these commits to `main` (needs explicit Arijit OK).

## Validation plan

- `frontend-builder` build phase → `ui-validator` against UIUXDesignSOP.
- Pure-logic units for the new libs (grouping, conversation store) per the
  reliability SOP (`docs/sop/llm-harness-reliability.md`).
- Browser proof (Playwright/Chrome): rail scroll, drawer open/close, pill
  popover, follow-up callout + multi-turn thread — screenshots into
  `docs/workspace/lab-ux-redesign/`.
