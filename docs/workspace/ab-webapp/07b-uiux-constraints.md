# Step 7.5 — UI/UX Constraints (for THIS page)

> **Vault SOP note:** `Standards/UIUXDesignSOP/index.md` is on Google Drive CloudStorage and is **sandbox-blocked** in this environment (`EPERM` / "Operation not permitted") — confirmed via Read and `cat`. Constraints below are taken from the rules embedded in the frontend-builder workflow (emphasis tiers, components, responsive, a11y, dark mode, anti-generic-AI) plus the Algolia design tokens. If the vault becomes readable, reconcile against the live SOP before shipping.

## Emphasis tiers (applied to Step 2 assignments)
- Exactly **one Hero**: the query bar. The four lanes are co-equal Primary by design (fairness of the A/B) — this is intentional and not tier inflation.
- Status badges, lane headers, citations = Secondary. Timestamps/latency/queryID/char-count/footer = Supporting (muted, `--fs-caption`, `--fg3`).

## Component constraints (for the elements chosen in Steps 3–6)
- Query bar = single text input + primary send button + example chips; Enter submits, Shift+Enter not needed (single-line). Reuse `.panel__searchbar` styling language (focus ring `0 0 0 3px rgba(0,61,255,.15)`).
- Status = `.pill` variants (`is-success` answering, `is-warn` streaming, `is-danger` unavailable/401).
- Buttons = `.btn--primary` (send), `.btn--secondary` (export/reset). Min height 44px touch target on mobile.
- Every lane must implement all four states: empty, loading/streaming, error, refusal (refusal ≠ error visually).

## Responsive breakpoints (required)
- **375px:** single lane visible + a tab/segmented switcher to change lanes; query bar full-width; touch targets ≥44px.
- **768px:** 2×2 grid of lanes.
- **1024px:** 4 lanes side-by-side (may scroll horizontally if cramped) OR 2×2 — prefer 4-up with min-column-width guard.
- **1280px+:** 4 lanes comfortably side-by-side. Max content width not capped (comparison wants the full viewport).
- Keyword table/hit rows reflow (stack) inside a narrow lane.

## Accessibility (WCAG 2.2 AA)
- Every interactive element labelled (`aria-label` on icon buttons, lane tabs, send).
- Color never the sole indicator: status pills carry text ("Unavailable", "Streaming") + icon, not just color; refusal/error differ by icon+label, not hue alone.
- Keyboard: query bar autofocus; Tab order = query bar → send → lanes → export; lane tabs operable by keyboard; visible focus rings (`--border-focus`).
- Streaming answer region: `aria-live="polite"` so screen readers get updates without spam.
- Contrast: use token fg/bg pairs (all AA against white); avoid `--fg4` for body text (placeholder/disabled only).
- Touch targets ≥44px on mobile.

## Dark mode
- Tokens are currently **light-only** (mirrors the algolia.com console). **Scope decision:** ship a polished light theme; do NOT hardcode hex anywhere (use CSS variables only) so a dark token set can be layered later without touching components. This is a deliberate, flagged scope cut — not an oversight.

## Anti-generic-AI
- Clear POV: Algolia Nebula Blue + Sora + dashboard console language; per-lane accent stripes give the comparison a distinctive identity.
- Distinctive element: the sticky hero query bar that visibly fans out into 4 labelled lanes; grounded-refusal cards as a first-class, branded state.
- Must read as "designed," not "default Tailwind gray."

## Conflicts raised (now, not after coding)
1. **Dark mode** requested by the workflow checklist vs light-only tokens → resolved by the scope cut above (variables-only, dark deferrable). Surfaced for Arijit's awareness.
2. **5 chunks on desktop** slightly over the "≤5" comfort guideline → accepted: 4-way simultaneity is the core requirement; load is reduced responsively instead.
