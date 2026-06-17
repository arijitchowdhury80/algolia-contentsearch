# UI/UX constraints for this build

**SOP source note:** the vault `Standards/UIUXDesignSOP/index.md` is **unreadable**
from this environment (Google Drive `EPERM`). Falling back to the constraint set the
frontend-builder workflow enumerates (WCAG 2.2 AA + emphasis tiers + responsive
breakpoints) plus the lab's own established conventions in `ab.css`/`tokens.css`.
If/when the vault is reachable, re-check against the live SOP.

## Constraints that apply to THIS build

**Emphasis tiers (from `01-design-thinking.md` §2):** rail = Hero; composer +
score pills + follow-up callout = Primary; source pills + drawer detail = Secondary;
lane metadata/chrome = Supporting. No tier inflation — detail demoted to on-demand.

**Components:**
- Tokens only — no raw hex. Use `var(--algolia-blue)`, `var(--bg-card)`, `--s-*`,
  `--fs-*`, `--dur-*`, `--ease-out`. Match existing `ab.css` namespacing style.
- Every element needs empty / loading / error states (already modelled by
  `AnalysisState` and the lane status pills — extend, don't replace).

**Responsive breakpoints:**
- **375px (mobile):** rail → existing 1-lane segmented tab switcher (keep
  `.grid-tabs` behaviour, rename to lane-tabs); drawer → full-screen sheet;
  composer → sticky bottom, full width.
- **768px (tablet):** rail shows ~2 lanes + scroll; drawer = right panel ~360px.
- **1024px / 1280px+:** rail shows 3–4 lanes; drawer right panel ~380–420px.

**Accessibility (WCAG 2.2 AA):**
- Pills, chips, drawer toggle, composer send: real `<button>`/`<a>` with
  `aria-label`; source popover = `aria-expanded` + focus management; drawer =
  labelled dialog, `Esc` to close, focus trap while open, restore focus on close.
- Color never the sole signal: score pills pair color tone with the numeral;
  follow-up callout pairs accent with an icon + "asking" text.
- Touch targets ≥44px; visible focus rings (reuse existing focus style); contrast
  ≥4.5:1 text / 3:1 large.

**Anti-generic-AI:** retains the Algolia brand POV (Sora, Nebula Blue, accent
stripes, score tone colors). Distinctive elements: numbered-system glyphs (①②③),
accent stripe per lane, grounded score pills, the conversational follow-up callout.

**Dark mode:** N/A (light-only design system) — see `07-aesthetic.md`.

## Conflicts raised before coding
- None blocking. The only deviation from the catalog is "no new theme" (extend
  existing brand) — justified in `07-aesthetic.md`. Dark-mode gate is N/A, not failed.
