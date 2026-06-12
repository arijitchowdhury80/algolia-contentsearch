# Status — Task 15: A/B Comparison Webapp UI

Feature: Stage-1 webapp UI (single query bar → 4-column A/B comparison).
Started: 2026-06-10. Skill: frontend-builder.

## Checklist
- [x] Step 0  — Workspace + references read (tokens, dashboard.css, lib interfaces, env vars)
- [x] Step 1–6 — Design thinking → `01-design-thinking.md`
- [x] Step 7  — Aesthetic selection (theme-dashboard, pre-locked by overview §7c) → `07-aesthetic.md`
- [x] Step 7.5 — UI/UX constraints → `07b-uiux-constraints.md` (vault SOP sandbox-blocked; used embedded rules)
- [x] Step 8  — Build components + hooks (config/columns, hooks useComparison/useKeywordColumn/useAgentColumn, 11 components inc. Markdown, ab.css)
- [x] Step 9  — UIUX checkpoint (tiers, responsive, a11y labels/aria-live, no hardcoded hex, anti-generic Algolia identity)
- [x] Step 10 — Browser test: all 4 lanes fan out + stream; keyword list; Beta 401 → clean error card; refusal/answer states; 375/768/1440 verified; tab switcher works; export wired. Zero console errors.
- [x] Step 11 — verification done (27 tests pass, tsc clean, build OK). ui-validator SKIPPED (vault SOP sandbox-blocked). record-knowledge dev-log entry written.

## Post-review fixes (Arijit feedback this session)
- Beta 401: error frame in 200 stream now surfaces as "Unavailable" + diagnostic card (was mislabeled "Answered").
- Markdown: added dependency-free renderer; FIXED infinite-recursion bug (code-in-bold) that hung the page — caught by new Markdown.test.tsx (10 tests). Renders live during streaming.
- Clarity: per-lane App (+READ-ONLY badge) / Index / Engine / mono pipeline line + numbered titles ①–④ + comparison-key strip explaining ①v④ / ②v③ / ③v④.

## OPEN FLAG for Arijit
- Added `components/Markdown.tsx` (~110 lines, 0 deps) — display glue, not native-Algolia. Justified by "this is a quality-comparison tool, answers must be readable." Veto if it crosses the minimise-custom-code line; fallback = render raw text.

## Key facts (carried for compaction survival)
- Libs ready: `lib/agentStudioClient.callCompletions(config,req,onText)`, `lib/keywordSearch.keywordSearch(client,index,query)`, `lib/conversation.buildConversationHistory(messages)`. Types in `types/chat.ts` (Message, Source, ColumnId='keyword'|'beta'|'mirror'|'tuned').
- Env (web/.env.local, all VITE_*): OURS_APP_ID, OURS_SEARCH_KEY, AGENT_MIRROR_ID, INDEX_MIRROR, AGENT_TUNED_ID, INDEX_TUNED, INCUMBENT_APP_ID, INCUMBENT_SEARCH_KEY, INCUMBENT_INDEX, BETA_AGENT_ID.
- Styles: `styles/tokens.css` (Nebula Blue #003DFF, Sora), `styles/dashboard.css` (sidebar/topbar/panel/table/chip/pill kit). Add `styles/ab.css` for the comparison grid.
- Col 2 (Beta `ebff018c`) provider returns 401 — must render as a clean "unavailable" state, not a crash.
- Deps locked to algoliasearch + react only (decision #10). No new runtime deps.
