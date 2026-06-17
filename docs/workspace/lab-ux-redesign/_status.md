# Lab UX Redesign — build status

**Source of truth:** `docs/design/adr-001-lab-ux-redesign.md`
**Started:** 2026-06-17

---

## ▶ RESUME (next session) — start here

**Done & committed (green: tsc + 58 web tests):** D3 grouped source pills (`b3b5bff`),
D1 lane rail (`dbb98fa`), ADR-001 (`45a1eb6`), on `main`. Tree clean. **Not pushed**
(needs Arijit OK).

**D2 — analysis drawer + lane score pills — DONE (UNCOMMITTED, green: tsc + 68 web tests).**
What shipped:
- `lib/score.ts` — `scoreTone` (≥7.5/≥5 thresholds) + `laneTone` (gate-tripped → forced weak)
  + `LaneScore` type. +5 unit tests.
- `AnalysisData.laneScores: Record<panelId, LaneScore>` added; `toAnalysisData` now surfaces
  BOTH ② mirror and ③ tuned scores (errored panels omitted). +2 analysis tests.
- **`AnalysisPanel` → `AnalysisDrawer`** (renamed file; types moved in). Right slide-out
  `role=dialog` `aria-modal`, backdrop, Esc-to-close, focus-in + restore + Tab trap
  (dependency-free). Same idle/streaming/judging/done/error states. +5 drawer tests.
- `ColumnHeader` gains optional `score?`+`onOpenAnalysis?` → always-visible `.lane-score`
  pill (numeral + gate-aware tone; doubles as the per-lane ⚖ trigger). +4 header tests.
- `AgentColumn` threads `score`/`onOpenAnalysis`. `App` holds drawer open state, header
  `.verdict-chip` (③ headline, gate-aware), threads `laneScores[id]` to each lane.
- CSS: dropped `.lab__main` 60/40 split (`.lab__panels` full height); added `.drawer*`
  (full-screen sheet <768px), `.lane-score*`, `.verdict-chip*`, `.lab__qbar-row`,
  `.lane__head-actions`; removed dead `.analysis`/`.analysis__head/title/mock` + mobile refs.
- Esc/focus/Tab-trap behaviour is browser-proven at Step 10 (static-markup tests cover
  the render branches, matching D1/D3 verification style).

**D4 — composer + follow-up + multi-turn surface — DONE (UNCOMMITTED, green: tsc + 80 web tests).**
What shipped:
- **`QueryBar` → `Composer`** (renamed). Persistent input that sends each turn to ALL lanes.
  `hero={!hasRun}` → centered ChatGPT-style hero (title + big input + Sample Questions);
  docked slim bottom bar after the first turn ("Ask a follow-up — goes to all systems…",
  "Send"). Clears on submit; refocuses on dock. Engine already threads (ADR read-receipt) —
  pure surfacing, confirmed live (multi-turn proof below).
- `lib/followup.ts` — `detectFollowUp` (pure, conservative): a follow-up exists only when the
  answer's FINAL sentence ends with '?'; quick-reply chips only from a clean trailing "A or B
  [or C]" enumeration (filler-stripped), else []. +8 unit tests.
- **`FollowUpCallout`** — elevated 🤔 accented block (label + question + optional chips that
  call the shared `submit` → goes to all lanes). Rendered in `AgentColumn` only on the latest
  settled, non-error assistant turn. +4 render tests.
- App: `.lab--hero` toggles the hero/docked layout; topbar (comparison key + verdict chip)
  shows only after first run; `onReply={submit}` threaded to lanes.
- CSS: `.composer*` (hero fills+centers via `.lab--hero .lab__main{display:none}`; docked
  bottom bar), `.lab__topbar`, `.followup*`; mobile padding for topbar/composer.

**Browser proof — DONE** (backend :8787 + vite :5173; Chrome 1440px + 390px). Screenshots in
this folder: `proof-01-hero` (centered composer) · `proof-02-docked-rail` (docked + full-height
rail + source pills) · `proof-03-score-pills` (② 9.9 green / ③ 1.5 red·gated + verdict chip) ·
`proof-04-drawer` (right analysis drawer: judges + config diff + synthesis) · `proof-05-followup-
multiturn` (③ turn-2 ends in a question → 🤔 callout; shared turn-2 in ② & ③) · `proof-06-pill-
popover` (D3 grouped-pill popover) · `proof-07-mobile` (tab switcher + wrapped topbar). **Esc-
close + focus-restore verified live** (focus returned to the ⚖ pill). Multi-turn verified live
(turn-2 fanned to all lanes; ③ recovered from the turn-1 false-refusal via history).

**ui-validator — DONE: 0 FAIL, 1 WARN** (sub-44px touch targets on secondary pills/chips —
matches existing pill density, mitigated by 44px mobile tabs). ⚠ Live vault SOP was unreadable
(`EPERM` on the Google-Drive mount) — validated against the skill checklist + tokens.css +
proofs; re-run against the SOP text when the mount is available. Fixed one `#fff`→`var(--fg-on-blue)`.

**REMAINING:** commit the D2+D4 batch as logical commits (still UNCOMMITTED on `main`), then
push — **push needs Arijit's explicit OK** (auto-mode blocks direct-to-main).

### Pre-existing issue noticed (NOT this work, out of scope)
The ① website weblist renders raw HTML entities in titles (`&rsquo;`, `&mdash;`). That's the
website-capture path from a prior session; flag for a later fix (decode entities in
`websiteClient`/`weblist` render).

---

## Progress tracker

- [x] Workspace + status
- [x] Design-thinking on disk (condensed → ADR) — `01-design-thinking.md`
- [ ] Aesthetic selection — `07-aesthetic.md` (extend existing Algolia brand system)
- [ ] UI/UX constraints from SOP — `07b-uiux-constraints.md`
- [ ] Read current source (ColumnGrid, AnalysisPanel, SourceList, QueryBar, ChatMessage, App, useComparison, AgentColumn, WebsiteColumn, ab.css)
- [x] D3 — GroupedSources lib + tests (grouping by source_type / URL inference) — `lib/sources.ts` (+15 unit tests)
- [x] D3 — Popover (dependency-free) + GroupedSources component (+ static-markup render tests); SourceList removed; CSS `.srcpills/.srcpill/.pop`. tsc + 58 web tests green. Browser-proof pending (batched at Step 10).
- [x] D4 — conversation store (multi-turn): confirmed already wired (ADR read-receipt); verified live (turn-2 fan-out)
- [x] D4 — Composer (persistent, hero→docked) + tests-via-logic; live-proven
- [x] D4 — FollowUpCallout + quick-reply chips (`lib/followup.ts` +8, callout +4); live-proven
- [x] D1 — LaneRail (horizontal-scroll; ColumnGrid→LaneRail, .grid*→.rail*; fixed-width clamp 340–400px, 3 fit + scroll for more; mobile tabs kept). Now full-height (D2 removed the bottom 40%).
- [x] D2 — AnalysisDrawer + lane score pills (both ② and ③) + verdict chip (`lib/score.ts` +5, drawer +5, header +4, analysis +2)
- [x] CSS — .rail / .composer / .drawer / .lane-score / .verdict-chip / .followup; dropped 60/40
- [x] Integrate in App (drawer state, hero/docked toggle, score threading, onReply)
- [x] Verify — tsc clean + 80 web tests green (was 58 at D1/D3)
- [x] ui-validator — 0 FAIL, 1 WARN (caveat: vault SOP unreadable here)
- [x] Browser proof — 7 screenshots (hero, docked rail, score pills, drawer, follow-up+multiturn, pill popover, mobile)
- [ ] **Commit the D2+D4 batch** (logical commits) — then **push (needs Arijit OK)**

## Notes / decisions during build

- Design-thinking NOT re-run (Arijit: complete in ADR + UX research). 01-design-thinking.md maps ADR → workflow's 6 questions.
- Aesthetic = extend existing brand system (tokens.css: Sora, Nebula Blue #003DFF). No new theme skill.
- No "dark mode" requirement: lab is light-theme only (tokens.css has no dark variant). Workflow's dark-mode gate marked N/A with reason.
- Last good state: 4 commits on main (94a1f8a..45a1eb6), tree clean, push pending Arijit OK.
