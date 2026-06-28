# 2×2 Answer-Quality Lab — premium redesign (design thinking, compact)

Driven by Arijit's critique (2026-06-19): "stale, industrial, no class, school project." Wants glassmorphism, gradient, depth/shadow, tiles, polish, fluid/resizable panels, fit-to-viewport with per-panel scroll, time in header, declutter.

## 1. Mental model
**Comparison cockpit / scoreboard.** Four systems answer one question; you scan scores at a glance, then read/compare answers, then drill into *why* (judge drawer). Premium analytics-tool feel — think a high-end monitoring dashboard, not a form.

## 2. Information architecture (emphasis tiers)
- **Hero:** the four composite scores (the verdict, per panel) + winner glow.
- **Primary:** the four answers (readable, side-by-side, each scrolls).
- **Secondary:** sources used; cross-panel deltas; grounding status.
- **Supporting:** index name, timing, judge meta, pipeline/config (→ judge drawer, not on the tile).

Tier fixes from current: timing+grounding were Supporting noise in a chip row → fold into the **header** beside the score. The italic "proves" footer + row sub-labels = Supporting clutter → **remove** (move "proves"/config into the judge drawer's "how it answered").

## 3. Interaction
Top actions: (1) ask a question, (2) read+compare the 4 answers, (3) click a score → judge drawer. Add: drag dividers to resize panels; each panel scrolls internally. Happy path: ask → 4 tiles stream → scores land + winner glows → click score → drawer. No page scroll.

## 4. Cognitive load
Chunks: 4 answer tiles + scoreboard frame = 5 (at budget). Declutter each tile: header (identity·score·time·grounding) → answer → source pills. Kill the separate chip row + footer line (−2 chunks of noise per tile).

## 5. Emotional journey
Land → "this is a serious, premium instrument" (confidence). Scores land → "clear verdict" (clarity). Drill → "I can see *why*, with evidence" (trust). Carried by: glass tiles + depth, the gradient-lit scoreboard, the winner glow.

## 6. Pre-mortem
- **Glass invisible on flat white** → add a subtle Algolia gradient-mesh canvas (Nebula blue + accent blobs, low opacity) behind frosted tiles so the glass reads. Mitigation built into the aesthetic.
- **Contrast on translucent panels** → keep tile fill ≥85% opaque white + dark ink text → AA holds.
- **Resizable complexity / runaway drag** → clamp ratios (e.g. 0.25–0.75); pointer-capture; keyboard-resizable later.
- **Long answers** → per-panel `overflow:auto`, momentum scroll, fade mask at edges.
- **Mobile (375px)** → stack to 1 column, drop gutters, page scroll on small screens (fit-to-viewport is desktop-first).

## 7. Aesthetic — "Algolia Premium Glass" (light)
Closest canned = `theme-dashboard` (glass panels + modular grid + depth) **adapted to Algolia's LIGHT brand** (dark would break brand). Built on the existing `tokens.css` Algolia design system (Nebula Blue #003DFF, Sora, accent blobs, shadow scale).

- **Canvas:** soft gradient-mesh (Nebula-blue → cyan/purple/coral blobs, ~6–10% opacity, blurred) over `--bg-canvas`. This is what makes glass legible + gives "class."
- **Tiles:** frosted glass — `backdrop-filter: blur()`, ~88% white fill, hairline top highlight, layered `--shadow-lg`, `--radius-xl`. Per-panel accent = a soft gradient top-edge + glow.
- **Scoreboard:** big composite numbers in Sora, gradient-tinted by tone; winner tile gets an accent gradient ring + lift.
- **Row/col axis labels:** enlarged KEYWORD/NEURAL (no sub-label), uppercase, tracked, muted.
- **Motion:** subtle lift on hover, gradient shimmer on the winner, smooth resize.
- **Layout:** 100vh shell, no page scroll; CSS-grid 2×2 with draggable vertical + horizontal gutters; each tile body scrolls.

## UIUX constraints applied
Emphasis tiers (above) · AA contrast (dark ink on ≥88% tiles) · keyboard + visible focus on score/resize/actions · touch targets ≥44px on actions · responsive 375/768/1024/1280 (stack on <760px) · color never sole indicator (score has number + tone + label) · distinctive POV (gradient-mesh + glass = clearly "designed").
