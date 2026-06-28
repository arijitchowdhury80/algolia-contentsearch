# Lessons Log — Fix-and-Learn

Project-specific issues hit during build, their **root cause**, the **fix**, and the **prevention heuristic** for next time. Append-only. This is the project arm of the always-on Fix-and-Learn Loop (mechanism: `~/.claude/docs/fix-and-learn-loop.md`).

**Read this before re-debugging anything in this repo.** If you hit an issue that's already here, apply the recorded fix instead of rediscovering it.

---

## 2026-06-19 — 2×2 lab UI redesign + perf/streaming diagnosis

### UI shipped logic-complete but visually a skeleton
- **Symptom:** Components rendered with zero styling (matrix/pcell/drawer had no CSS); "all suites green" had been reported as done.
- **Root cause:** Green test suites prove *logic*, not *visuals*. `vite build` never fails on missing CSS — there's no compile-time signal for an unstyled component.
- **Fix:** Built the full stylesheet; verified every state with live browser screenshots.
- **Evidence:** Browser screenshots of hero / answering / judged / declined / drawer / mobile.
- **Prevention (future me):** For any UI work, a green test suite is NOT done. Always screenshot-verify each state in the browser before claiming complete. Tests can't see "blank".

### "Changes don't show up" — stale dev server on a renamed folder
- **Symptom:** Edits had no effect; the dev server / page looked frozen; the project dir appeared to "vanish".
- **Root cause:** Dropbox did a folder-takeover and renamed `~/AI-Development` → `~/AI-Development-OLD`, then started a fresh (stale) `~/AI-Development`. The running `vite`/`tsx` processes still pointed at the now-gone original path, so file-watching/HMR silently broke.
- **Fix:** Found the real current files by `mtime` + `git status`; killed the stale servers (`ps aux | grep vite`); restarted from the canonical dir; used absolute paths thereafter.
- **Evidence:** `ps aux` showed vite pointing at the gone path; `lab2x2.css` mtime + `git status` in `-OLD` confirmed it held the latest work.
- **Prevention (future me):** When edits don't show, FIRST confirm which directory the dev server actually serves (`ps aux | grep vite`) and that it matches where you're editing. Beware cloud-sync (Dropbox/Drive) silently taking over a working folder. Commit early so the canonical copy is unambiguous.

### "Streaming isn't happening"
- **Symptom:** Panels sat on a frozen "Answering…" for 15–72s, then the whole answer popped in at once.
- **Root cause:** `lab/server/src/answer.ts` is non-streamed by design — it `await`s the *full* Agent Studio completion, then emits one `event: panel` SSE block. Confirmed by `firstTokenMs === totalMs` on every panel (the field is hardcoded equal) and the comment "equals totalMs for non-streamed paths". The upstream Agent Studio body *does* stream (ai-sdk-4), but `agentRunner` buffers it whole before returning.
- **Fix (pending backend):** thread a per-token callback from `agentRunner` → SSE `delta` event → frontend render. Frontend mitigation shipped now: an alive waiting state (ticking elapsed timer + context hint) so the wait isn't a frozen screen.
- **Evidence:** Network trace of `POST /api/answer` — `content-type: text/event-stream`, but each `panel` event carries the complete answer with `firstTokenMs===totalMs`.
- **Prevention (future me):** When "streaming doesn't work", inspect the actual SSE payload + the timing fields + the server's `await` pattern BEFORE touching the frontend. `firstTokenMs===totalMs` is the tell for "buffered, not streamed".

### "It suddenly got slow" blamed on the frontend
- **Symptom:** User saw 20s–72s answers and suspected the just-made frontend changes broke performance.
- **Root cause:** Answer latency is 100% backend — `/api/answer` and `/api/judge` go to the VPS, which calls Agent Studio + Gemini. Slowness = multi-agent chains (sequential LLM calls) + newly-enabled neural + likely Gemini throttling. Frontend (CSS/layout) cannot affect generation time.
- **Fix:** Localized the problem with a network trace; explained the real cause; listed backend levers (parallelize specialists, cap hops, trim sources, progressive judge).
- **Evidence:** Network trace — every answer/judge call hits `judge.contentengagement.info`; per-panel times P1 15.5s / P4 72s.
- **Prevention (future me):** Before accepting blame for a regression, localize it to the right layer with evidence (network trace / logs). A pure CSS/layout change cannot slow backend generation — say so and prove it.

### "Every answer scores 3.0"
- **Symptom:** Live judge kept returning 3.0 for sound answers.
- **Root cause:** Not a bug — the live judge hard-caps any answer with ≥1 "unsupported" claim at 3.0, and it over-flags because it only sees the *thin* live source snippets the panels pass it. The grounding gate is working as designed on thin data.
- **Fix:** Explained; authoritative scores require the batch judge over full retrieved sources.
- **Prevention (future me):** Distinguish "a gate working as designed on degraded input" from "a bug". Don't quote live-panel scores as the authoritative verdict — that's what the batch judge is for.

### Popover pills not clickable / clipped
- **Symptom:** Source/category pills couldn't be opened; popover content was clipped or off-screen.
- **Root cause:** The tile has `overflow: hidden` (for internal scroll), which clipped the popover; bottom-anchored positioning math placed the panel above the viewport (`top` > viewport height).
- **Fix:** Render the popover via `createPortal` to `document.body` with `position: fixed`, and compute open-direction (up/down) against viewport bounds.
- **Prevention (future me):** Any popover/menu inside an `overflow:hidden` container must portal out to the body. Always check the computed position against the viewport, and flip open-direction near edges.

### Source pills all read "Other" (or showed provenance like "Agent"/"Coordinator")
- **Symptom:** Category grouping degenerated to a single "Other" bucket; earlier they showed agent provenance, not document categories.
- **Root cause:** The answer payload's sources carry `url: ""` and `source: <provenance>` (set in `toAnswerSources`), so the URL-based categorizer has nothing to bucket on.
- **Fix:** Interim — a single "N sources used" count chip. Real fix needs the backend to include each hit's URL/facet.
- **Prevention (future me):** When a UI grouping/derivation degenerates, inspect the data payload shape FIRST — the UI usually can't show what the data doesn't carry.

### Layout flip-flop → settled on viewport-fit
- **Symptom:** Big whitespace when one panel declined (short) next to a tall one; page-scroll vs equal-height kept trading one problem for another.
- **Root cause:** Content-height tiles + page scroll put the blank *beside* the short panel and made the page scroll; forced equal-height padded blanks. Neither suits an N-way comparison.
- **Fix:** Viewport-fit grid (`grid-template-rows: auto minmax(0,1fr) minmax(0,1fr)`) — the 2×2 fills the screen, each tile scrolls internally, the page never scrolls. All four verdicts always visible.
- **Prevention (future me):** For N-way side-by-side comparison, default to fit-to-viewport with per-panel internal scroll (the "cockpit" pattern). Pick layout from the use case (skim all at once), not by reacting to one symptom.

### Viewport-fit broke mobile
- **Symptom:** On 390px the stacked tiles clipped their content; the question bar overflowed (Send off-screen).
- **Root cause:** The desktop fit rules (`height:100%`, `overflow:hidden` on cells) were not reset in the stacked mobile breakpoint; the docked composer row didn't wrap.
- **Fix:** In `@media (max-width:900px)` reset `.matrix__cell { height:auto; overflow:visible }` and `flex-wrap` the composer row.
- **Prevention (future me):** Any desktop fit-to-viewport change must be explicitly neutralized in the stacked mobile breakpoint. Always re-test 375/390px right after a layout change.

### "Neural · enabling" badge shown even though neural answered
- **Symptom:** P3/P4 returned good neural answers (9.5/10) yet were tagged "Neural · enabling".
- **Root cause:** The badge was conservative — "unknown → show enabling". But `/health` (old backend) omits the neural field, so state was *unknown*, and "enabling" is itself a claim (that it's NOT ready) that can't be proven from absent data.
- **Fix:** Show "enabling" only when the backend *explicitly* reports the index isn't live; on unknown, show plain "Neural" (the panel's config — always true).
- **Prevention (future me):** Absence of data ≠ a negative state. Don't render a claim ("not ready") you can't prove. When uncertain, show the always-true neutral label, not an alarming guess.

### Blocked: SSH to shared infra + permission self-modification
- **Symptom:** Couldn't `ssh` to the VPS to redeploy; couldn't add the Bash allow-rule myself.
- **Root cause:** Auto-mode security classifier blocks remote shell to shared/production infra and blocks editing permission machinery — user intent can't clear that boundary.
- **Fix:** Surface to the user; they add the allow-rule or run the command. Don't retry variants.
- **Prevention (future me):** These actions require the user. Don't loop trying to self-grant — state the exact command and hand it over.

### Secrets dir not gitignored
- **Symptom:** `.secrets/` (VPS SSH private key) and `.claude/` were trackable.
- **Fix:** Added both to `.gitignore` before committing.
- **Prevention (future me):** Gitignore secret/credential directories BEFORE the first commit that could include them. Verify with `git check-ignore` before `git add`.

---

## 2026-06-19 — Pipeline measurement: the bottleneck is the follow-up LLM call, not retrieval

- **Symptom:** Panels feel slow (15–72s). Assumption was "multi-agent + neural is inherently slow."
- **Measured (bench_pipeline.ts — wraps the injectable runAgent + llm deps with timers, zero pipeline changes):**
  - single·keyword 9.2s = agent **1.0s** + follow-up **8.2s**
  - single·neural 11.0s = agent **0.5s** + follow-up **10.5s**
  - multi·keyword 27.1s = extract 6.7s + agent 0.7s + synthesize 4.4s + follow-up **15.2s**
  - multi·neural 25.7s = extract 4.9s + agent 0.9s + synthesize **11.1s** + follow-up 8.8s
- **Root cause:** The actual answer retrieval (Algolia Agent Studio) is FAST (0.5–1.0s). The wall-clock is almost all **Gemini 2.5-pro LLM calls**. The dominant one is `generateFollowUp` (the suggested next-question) — 8–15s — generated **synchronously after the answer**, blocking panel completion. `maverick:extract` (intent routing) adds another 5–7s. So "neural is slow" / "multi-agent is slow" was WRONG — it's the utility LLM calls.
- **Fix (backend, pending redeploy):** (1) make the follow-up NON-blocking (emit the answer, generate follow-up async or lazily) → single panels 9–11s → ~1s; (2) run `extract` + `follow-up` on **flash** not pro (utility calls don't need pro); (3) synthesize is the legitimate multi-agent cost (4–11s) — flash or stream it. Production runs panels in parallel, so wall-clock ≈ slowest panel + judge (~20s) — cutting the follow-up shrinks the slowest panel the most.
- **Evidence:** `lab/server/bench_pipeline.ts` output (logged 2026-06-19).
- **Prevention (future me):** Measure step-by-step before optimizing — the bottleneck was a non-essential feature (follow-up), not the thing everyone blamed (retrieval/neural/multi-agent). Wrap injectable deps with timers for a zero-touch profile. "We can only improve what we can measure."

---

## 2026-06-19 — OpenAI key "looks alive" (models 200) but completions 429 insufficient_quota

- **Symptom:** Asked to switch Gemini→GPT-5. `GET /v1/models` returned 200 and listed gpt-5/gpt-5.1/gpt-5-pro → looked ready. But every `/v1/chat/completions` returned `429 insufficient_quota`.
- **Root cause:** `/v1/models` (listing) does NOT consume quota and is allowed for any authenticated key, so a 200 there proves auth only — NOT that the account can run completions. The account has no billing/credits → completions are quota-blocked.
- **Fix:** Diagnosed via an actual completion (the existing `isOpenAIHealthy` probe does this correctly — it calls a real completion, so the live resolver safely stays on Gemini). Fixed the bogus default model `gpt-5.2` (doesn't exist) → `gpt-5` (verified available) so the switch is one-step-ready once billing is added.
- **Evidence:** `/tmp/bench_gpt5.log` — all 4 panels `OpenAI 429 insufficient_quota`; `/v1/models` 200 with gpt-5* present.
- **Prevention (future me):** To test if an OpenAI key is USABLE, probe with a real (tiny) completion, never `/v1/models`. A 200 on model-listing is necessary but not sufficient. Same for any API where read/list endpoints are free but write/compute endpoints are metered.

---

## 2026-06-28 — query rephrase before retrieval STRIPS skeptical framing → grounding violation

- **Symptom:** Backlog-A scored A/B (raw user turn vs `brain.expandedQuery`). Bait query 7.5 "...Lacoste 150% add-to-cart — can you **confirm the exact figure**?" scored RAW 10.0 (correctly refuses) but REWRITE 1.67 (grounding gate tripped). Across 30 questions the mean composite was flat (+0.24, within noise) but variance was high.
- **Root cause:** `runBrain` rephrases the turn into a "neural-search-friendly" retrieval query. On a SKEPTICAL/bait query it drops the skeptical clause and emits an ASSERTIVE query that *presupposes the fact* — "Algolia Lacoste case study 150% increase in add-to-cart rate". The agent then goes and confirms an unsupported stat → grounding violation. The rephrase converts "is X true?" into "tell me about X". This IS the documented false-refusal / off-topic-reweight bug, reproduced with a score.
- **Fix (recommended, gated on Arijit):** drop the full intent-rephrase; send the raw turn on turn 1; keep only a narrow turn-≥2 coreference rewrite. Gate 1 (getRankingInfo on raw NL → non-zero neuralScore/semanticScore) shows NeuralSearch needs no rewrite to fire its semantic layer, so the retrieval justification is gone too. Doc: `docs/experiment/2026-06-28-expandedquery-drop-validation.md`.
- **Evidence:** `docs/experiment/expandedquery-ab-results.json` (rows 7.5, 7.2; aggregate Δ+0.24). Gate-1 ranking probe on `AC2_WWW_SINGLE_NEURAL`.
- **Prevention (future me):** A pre-retrieval LLM rephrase is NOT neutral — it can rewrite the *intent*, not just the *vocabulary*. Anywhere a query is paraphrased before a grounded/refusal system, test the BAIT class specifically: a paraphrase that turns "can you confirm X?" into "X" silently defeats refusal. Also: when an A/B mean is within judge noise, read the rows — the mean hid a catastrophic-on-baits / helps-on-vague-openers split.
