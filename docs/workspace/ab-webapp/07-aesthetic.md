# Step 7 — Aesthetic Selection

**Chosen: `theme-dashboard` (app-console).** Pre-locked by overview §7c ("port the dashboard UI kit — app-console style fits the chat + A/B better than the marketing kit") and already materialized in `web/src/styles/dashboard.css` + `tokens.css`.

**Why it fits:**
- The page is an internal evaluation console (data-dense, multi-lane, status badges, monitoring feel) — exactly the dashboard kit's territory, not a marketing landing page.
- Tokens are already Algolia-branded: Nebula Blue `#003DFF`, Sora typeface (300/400/600 only, no italics), slate-cool neutrals, crisp low-spread shadows. This satisfies brand compliance and the anti-generic-AI requirement out of the box.
- The kit already ships the primitives we reuse: `.panel`, `.tb` (top bar), `.chip`, `.pill` (status), `.btn`, table styles — so the comparison grid layers cleanly on top.

**What I add (not in the base kit):** the 4-column comparison grid, chat bubbles, the hero query bar, lane accent stripes, refusal/error message variants, and the mobile lane-switcher — all in a new `styles/ab.css`, using only existing CSS variables (no raw hex).

No need to load other theme skills — the dashboard tokens are present and sufficient.
