/**
 * ConfidenceChip — the per-answer **Confidence** surface.
 *
 * The composite judge score (0–10) shown ON each panel's answer. It fills in
 * asynchronously: the answer renders first, the judge resolves a few seconds
 * later, so the chip starts in a "scoring…" state and then shows the number.
 * Clicking a scored chip opens the JudgeDrawer for THAT panel (the full 4-dim
 * breakdown). When the grounding gate trips, the chip carries a "⚠ N flagged"
 * tail and forces a weak tone — a high-but-ungrounded answer never reads green.
 *
 * Naming: the composite is "Confidence" end-to-end (spec 2026-06-27 D7). The
 * underlying field stays `composite` on the verdict; only the user-facing label
 * says "Confidence".
 *
 * Visual grammar reuses the lab's shared score tone (lib/score) and the same
 * traffic-light idiom as the JudgeDrawer bars, so a 7.4 reads identically on the
 * chip and in the drawer.
 *
 * States (driven by props, parent owns lifecycle):
 *   scoring  — judge in flight; non-clickable "Confidence · scoring…"
 *   scored   — has a verdict; clickable "Confidence N.N" (+ "⚠ N flagged")
 *   (absent) — render nothing before the answer is done (parent gates this)
 */
import { scoreTone, laneTone } from '../lib/score';
import type { PanelJudgeResult } from '../types/chat';

export interface ConfidenceChipProps {
  /** The panel's judge verdict, once it resolves. Undefined while scoring. */
  verdict?: PanelJudgeResult;
  /** True while the judge is running for this panel (shows the scoring state). */
  scoring?: boolean;
  /** Whether this panel is the round's best answer (adds a ★). */
  isWinner?: boolean;
  /** Click a scored chip → open the judge drawer for this panel. */
  onOpenJudge?: () => void;
  /** 'inline' = compact header pill · 'block' = the under-answer surface. */
  variant?: 'inline' | 'block';
}

/**
 * The per-answer Confidence chip. Renders the "scoring…" placeholder while the
 * judge is in flight, then the clickable composite once a verdict lands.
 */
export function ConfidenceChip({
  verdict,
  scoring = false,
  isWinner = false,
  onOpenJudge,
  variant = 'block',
}: ConfidenceChipProps) {
  const variantCls = `confchip--${variant}`;

  // ── Scoring (no verdict yet) — a quiet, non-interactive placeholder. ──────
  if (!verdict) {
    if (!scoring) return null;
    return (
      <span
        className={`confchip confchip--scoring ${variantCls}`}
        aria-live="polite"
        aria-label="Confidence score in progress"
      >
        <span className="confchip__icon" aria-hidden="true">⚖</span>
        <span className="confchip__label">Confidence</span>
        <span className="confchip__scoring">
          scoring
          <span className="confchip__dots" aria-hidden="true">
            <span className="dot" /><span className="dot" /><span className="dot" />
          </span>
        </span>
      </span>
    );
  }

  // ── Scored — the clickable composite. ─────────────────────────────────────
  const gateTripped = verdict.gateTripped;
  const tone = laneTone({
    score: verdict.composite,
    gateTripped,
    borderline: verdict.borderline,
  });
  void scoreTone; // tone derives via laneTone (gate-aware); keep import meaningful
  const flaggedCount = verdict.flaggedClaims.length;

  const title = gateTripped
    ? `Confidence ${verdict.composite.toFixed(1)} / 10 — grounding floor tripped (${flaggedCount} flagged). Click for the full breakdown.`
    : `Confidence ${verdict.composite.toFixed(1)} / 10 — click for the 4-dimension breakdown.`;

  return (
    <button
      type="button"
      className={`confchip confchip--scored ${variantCls} ${tone}`}
      onClick={onOpenJudge}
      disabled={!onOpenJudge}
      title={title}
      aria-label={`Confidence ${verdict.composite.toFixed(1)} out of 10. Open the judge breakdown.`}
    >
      {isWinner && <span className="confchip__star" aria-hidden="true">★</span>}
      <span className="confchip__icon" aria-hidden="true">⚖</span>
      <span className="confchip__label">Confidence</span>
      <span className="confchip__num">{verdict.composite.toFixed(1)}</span>
      {gateTripped && flaggedCount > 0 && (
        <span className="confchip__flagged" aria-label={`${flaggedCount} flagged claim${flaggedCount !== 1 ? 's' : ''}`}>
          ⚠ {flaggedCount} flagged
        </span>
      )}
    </button>
  );
}
