# Lab UX Redesign — build status

**Source of truth:** `docs/design/adr-001-lab-ux-redesign.md`
**Started:** 2026-06-17

---

## ▶ RESUME (next session) — start here

**Done & committed (green: tsc + 58 web tests):** D3 grouped source pills (`b3b5bff`),
D1 lane rail (`dbb98fa`), ADR-001 (`45a1eb6`), on `main`. Tree clean. **Not pushed**
(needs Arijit OK). Run order to resume: build **D2 → D4 → browser proof → ui-validator**.

**D2 — analysis drawer + lane score pills (do first):**
1. Read `web/src/hooks/useLiveJudge.ts`, `web/src/lib/judgeClient.ts`, `web/src/lib/analysis.ts`
   to find what per-panel scores exist. `AnalysisData` (AnalysisPanel.tsx) currently has a
   single `synthesizedScore` (for ③ tuned) + judges + configDiff + synthesis. For lane pills
   you need ② AND ③ scores — if only ③ is available, scope pills to what exists and note it.
2. Refactor `AnalysisPanel` → `AnalysisDrawer`: right slide-out `role=dialog`, Esc to close,
   focus trap + restore. Trigger from a header verdict chip + a per-lane ⚖ button.
3. App shell: drop `.lab__analysis` (bottom 40%); `.lab__main` becomes the rail at full height.
   Add `.drawer` CSS (right overlay, ~380–420px; full-screen sheet <768px).
4. Score pill into `ColumnHeader` (add optional `score?`+tone); thread from App `live.data`
   → `renderColumn` → AgentColumn → ColumnHeader (map panelId→score). Color tone + numeral
   (never color alone).

**D4 — composer + follow-up + multi-turn surface:**
- `QueryBar` → `Composer`: persistent bottom bar; centered hero when `!hasRun`, docked after.
  (`useComparison.submit()` already bumps seq → lanes already thread + replay history. No
  engine work — pure surfacing. Confirmed via ADR read-receipt.)
- `FollowUpCallout` + quick-reply chips: detect the agent's trailing question in an assistant
  message; render a distinct accented block below the answer (icon + "asking" text + chips
  that call `submit()`), NOT prose.

**Then:** consolidated browser proof (backend on :8787 + vite on :5175; Chrome/Playwright →
screenshots of rail scroll / pill popover / drawer / follow-up / multi-turn into this folder),
then `ui-validator`, then final tsc+tests, update this file, commit, Definition-of-Done.

---

## Progress tracker

- [x] Workspace + status
- [x] Design-thinking on disk (condensed → ADR) — `01-design-thinking.md`
- [ ] Aesthetic selection — `07-aesthetic.md` (extend existing Algolia brand system)
- [ ] UI/UX constraints from SOP — `07b-uiux-constraints.md`
- [ ] Read current source (ColumnGrid, AnalysisPanel, SourceList, QueryBar, ChatMessage, App, useComparison, AgentColumn, WebsiteColumn, ab.css)
- [x] D3 — GroupedSources lib + tests (grouping by source_type / URL inference) — `lib/sources.ts` (+15 unit tests)
- [x] D3 — Popover (dependency-free) + GroupedSources component (+ static-markup render tests); SourceList removed; CSS `.srcpills/.srcpill/.pop`. tsc + 58 web tests green. Browser-proof pending (batched at Step 10).
- [ ] D4 — conversation store (multi-turn) confirm/extend + tests
- [ ] D4 — Composer (persistent, hero→docked)
- [ ] D4 — FollowUpCallout + quick-reply chips
- [x] D1 — LaneRail (horizontal-scroll; ColumnGrid→LaneRail, .grid*→.rail*; fixed-width clamp 340–400px, 3 fit + scroll for more; mobile tabs kept). tsc + 58 tests green. (Full-height comes with D2 removing the bottom 40%.)
- [ ] D2 — AnalysisDrawer + lane score pills
- [ ] CSS — .rail / .composer / .drawer / .srcpills / .followup; drop 60/40
- [ ] Integrate in App
- [ ] Verify — tsc + all test suites green
- [ ] ui-validator
- [ ] Browser proof (rail scroll, drawer, pill popover, follow-up, multi-turn)

## Notes / decisions during build

- Design-thinking NOT re-run (Arijit: complete in ADR + UX research). 01-design-thinking.md maps ADR → workflow's 6 questions.
- Aesthetic = extend existing brand system (tokens.css: Sora, Nebula Blue #003DFF). No new theme skill.
- No "dark mode" requirement: lab is light-theme only (tokens.css has no dark variant). Workflow's dark-mode gate marked N/A with reason.
- Last good state: 4 commits on main (94a1f8a..45a1eb6), tree clean, push pending Arijit OK.
