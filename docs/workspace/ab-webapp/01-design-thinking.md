# Design Thinking — A/B Comparison Webapp (Task 15)

> Much of the *what* is pre-locked (overview §7c: Algolia-branded, single query bar, 4-column ablation, dashboard UI kit). This doc records the *why* and the component plan, and re-checks the locked decisions against UX reality rather than re-litigating them.

## Step 1 — Mental Model

**Dominant metaphor: a head-to-head lab bench / diff view.** This is NOT a consumer chat app. The user is an Algolia SME running a quality evaluation: type ONE question, watch four systems answer it *simultaneously*, judge which is better. The closest familiar model is a side-by-side diff or an A/B test console — chat threads live *inside* each lane, but the frame is comparison.

- **User expects to see:** one input that drives everything; four labelled lanes responding to the same query in parallel; a clear `Index | Agent` identity on each lane; the contrast between a plain ranked list (old world) and grounded generated answers (new world).
- **What would confuse them:** four separate input boxes (implies four conversations); a single merged answer feed (defeats comparison); lanes that look identical so you can't tell which system is which; a grounded *refusal* styled like an error (refusal is the thesis, not a failure).

## Step 2 — Information Architecture (emphasis tiers)

| Element | Tier | Treatment |
|---|---|---|
| The single query bar | **Hero** (1 per page) | Largest, sticky at top, brand-accented, autofocus |
| The 4 column answer areas | **Primary** | Equal-weight grid, the main canvas |
| Column header `Index \| Agent` + accent + status badge | Secondary | Present, identifies the lane, subordinate to content |
| Source citations / keyword hit rows | Secondary | Scannable, supports the answer |
| Timestamps, latency, queryID, char count, footer, export | Supporting | Smallest, muted |

No tier inflation: only one Hero (the query bar). The four lanes are deliberately co-equal Primary — that equality *is* the fairness of the A/B.

## Step 3 — Interaction Flow

**3 most common actions (must be 1–2 clicks / effortless):**
1. Ask a query → type + Enter (fans out to all 4 lanes at once).
2. Ask a follow-up → type + Enter (appends to every lane's thread; multi-turn).
3. Read/compare answers → scroll within a lane (no action needed; autoscroll on stream).

**Happy path:**
1. Land → empty state, query bar focused, a few example-query chips.
2. Type a question → Enter.
3. All 4 lanes fire: keyword lane shows a ranked list immediately; agent lanes stream tokens live.
4. User compares side-by-side; optionally asks a follow-up (history preserved per lane).
5. (Eval tie-in) Export the transcript as JSON for the judge/human panel.

**No dead ends:** after an answer, the query bar stays ready for the next turn; example chips remain reachable via a reset.

**States per lane:**
- **Empty:** before first query — muted placeholder ("Answers will appear here").
- **Loading/streaming:** agent lanes show a streaming caret + the partial answer; keyword lane shows a brief skeleton.
- **Error:** col 2 Beta returns 401 — render a calm "Provider unavailable (401)" notice with the reason, never a crash or blank.
- **Refusal:** grounded refusal gets its own *trustworthy* styling (info-blue, shield/route tone) — distinct from error red.

## Step 4 — Cognitive Load Budget

Visible chunks on desktop: query bar (1) + 4 lanes (4) = **5 chunks — exactly at the limit.** This is intrinsic to the task: simultaneous 4-way comparison cannot be collapsed on desktop without destroying the purpose. Reduction is therefore **responsive, not desktop:**
- **≥1280px / 1024px:** all 4 lanes side-by-side (the point).
- **768px (tablet):** 2×2 grid (2 chunks per row).
- **375px (mobile):** single lane + a column-switcher tab bar (one lane at a time; query still fans out to all in the background).

Within a lane, only the latest exchange is emphasized; older turns scroll up — keeps per-lane load low.

## Step 5 — Emotional Journey

Curiosity ("how differently will these answer?") → Clarity (the contrast is visible at a glance) → Conviction (our tuned agent answers well *or* refuses cleanly where the others hallucinate/dump links). The **refusal styling carries the emotional weight of the whole thesis**: it must read as *"this system is trustworthy and won't make things up,"* not *"this system is broken."* The keyword lane's bare link-list vs the agent lanes' grounded prose is the second emotional beat — old world vs new.

## Step 6 — Design Pre-Mortem

**Tigers (real UI risks) → mitigation:**
- *Looks "generic AI" (gray, no identity).* → Algolia Sora + Nebula Blue tokens, dashboard kit, per-lane accent colors, branded header. A distinctive sticky hero query bar.
- *Information overload on first view.* → Empty state with guidance + example chips; strong lane labels; color-coded lane accents so identity is instant.
- *4 chat lanes break on mobile.* → Responsive reflow: 2×2 at 768, single-lane + tab switcher at 375.
- *Streaming jank / scroll fighting.* → Append-only render; autoscroll-to-bottom only when already near bottom; `aria-live="polite"` on the streaming region.
- *Refusal mistaken for error.* → Two separate visual languages (info-blue refusal card vs danger-red error card), each with its own icon + label.
- *Fails a11y (contrast, keyboard, labels).* → All controls labelled; query bar keyboard-first; lane tabs are real buttons; AA contrast from tokens; visible focus rings; 44px touch targets.
- *Dark mode breaks.* → Tokens are currently light-only; scope: ship polished light mode (matches algolia.com console), and ensure no hardcoded hex so a dark theme can be layered later. (Flagged in constraints.)

**Elephants (unspoken concerns):**
- *Nobody tested on a real user.* → Arijit (the SME) is the user and reviews in-browser at Step 10.
- *Spec was wrong.* → The 4-column model is recon-verified; col 2 known-broken (401) is handled, not hidden.
- *Loads/streams too slowly.* → Browser-direct, no backend hop; 4 parallel fetches kick off together; keyword lane returns near-instant to give immediate feedback while agents stream.

## Component & Hook Plan

```
App.tsx                      — shell; holds query + 4 lane threads; fan-out handler; export
config/columns.ts            — the 4 ColumnConfig defs built from import.meta.env
components/
  AppHeader.tsx              — Algolia brand bar + title + Export transcript
  QueryBar.tsx               — HERO single input + send + example chips + reset
  ColumnGrid.tsx             — responsive 4→2×2→1 grid + mobile tab switcher
  ColumnHeader.tsx           — Index|Agent label, accent stripe, status badge
  AgentColumn.tsx            — chat thread (cols 2–4) via useAgentColumn
  KeywordColumn.tsx          — ranked results list (col 1) via useKeywordColumn
  ChatMessage.tsx            — user/assistant bubble; streaming caret; sources; refusal/error variants
  SourceList.tsx             — citation chips → real links
  ResultHit.tsx              — keyword hit row (title, url, snippet, ranking #)
hooks/
  useAgentColumn.ts          — wraps callCompletions + buildConversationHistory; per-lane streaming state
  useKeywordColumn.ts        — wraps keywordSearch (algoliasearch client)
  useComparison.ts           — orchestrates fan-out: one submit → all lanes; owns shared query + per-lane threads
styles/ab.css                — comparison-grid + chat-bubble + lane styles layered on dashboard.css
```

Refusal detection (Stage-1, no custom auditor per decision #6/#10): a lane answer is flagged `refused` heuristically from the agent's own grounded-refusal phrasing (it's enforced in the agent prompt) — lightweight string signal only, NOT a re-implemented auditor. Sources come straight from `ParsedCompletion.hits`.
