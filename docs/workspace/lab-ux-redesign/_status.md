# Lab UX Redesign — build status

**Source of truth:** `docs/design/adr-001-lab-ux-redesign.md`
**Started:** 2026-06-17

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
