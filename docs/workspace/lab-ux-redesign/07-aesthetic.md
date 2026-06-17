# Aesthetic selection

**Decision: extend the existing Algolia brand system. No new theme.**

This is a redesign of an existing, shipped UI — not a greenfield page. The lab
already has a coherent design system in `web/src/styles/tokens.css`:
- **Type:** Sora (display + body), JetBrains Mono (code/IDs)
- **Primary:** Nebula Blue `#003DFF`; accents cyan/purple/pink/coral/yellow/green
- **Surfaces:** light only (`--bg-page` #fff, `--bg-canvas` gray-050, `--bg-card`)
- **Spacing:** 4px grid (`--s-*`); **motion:** `--ease-out`, `--dur-fast/base/slow`

Closest catalog aesthetic is `theme-professional` (Inter/Geist, balanced), but the
lab already overrides that with the Algolia brand (Sora/Nebula). **Introducing a new
theme skill would break brand consistency.** So: reuse tokens, add only new *layout*
namespaces (`.rail`, `.composer`, `.drawer`, `.srcpills`, `.followup`) built from
existing tokens — never raw hex.

**Dark mode:** N/A. tokens.css defines a light surface only; the lab has no dark
variant and none is in scope. The workflow's dark-mode gate is marked N/A (reason on
record here), not failed.
