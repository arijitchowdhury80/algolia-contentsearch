/**
 * deriveWinnerId — the SINGLE "Best answer" winner across the 2×2, or null when
 * there isn't a clear one. One source of truth for both the tile crown (PanelCell)
 * and the winner glow (Matrix), so they never disagree.
 *
 * Rules (honest, not vanity):
 *  - effective score clamps a gate-tripped (flagged) answer to ≤3 — a flagged
 *    answer can't win.
 *  - NO winner if the top answer is itself gate-tripped → nothing is genuinely
 *    good this round, so we crown nobody (fixes "all four say Best answer at 3.0").
 *  - NO winner on a top tie (within 0.1) → no clear best.
 */
import type { PanelId, PanelJudgeResult } from '../types/chat';

const PANEL_IDS: PanelId[] = ['P1', 'P2', 'P3', 'P4'];

export function deriveWinnerId(
  judges: Partial<Record<PanelId, PanelJudgeResult>>,
): PanelId | null {
  const eff = (j: PanelJudgeResult) => (j.gateTripped ? Math.min(j.composite, 3) : j.composite);
  const ranked = PANEL_IDS
    .map((id) => ({ id, j: judges[id] }))
    .filter((x): x is { id: PanelId; j: PanelJudgeResult } => !!x.j)
    .map((x) => ({ id: x.id, score: eff(x.j), gated: x.j.gateTripped }))
    .sort((a, b) => b.score - a.score);

  const top = ranked[0];
  if (!top) return null;
  if (top.gated) return null;                                  // no genuinely-good answer to crown
  if (ranked[1] && top.score - ranked[1].score < 0.1) return null; // top tie → no clear winner
  return top.id;
}
