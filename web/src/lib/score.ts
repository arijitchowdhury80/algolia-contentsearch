/**
 * score — shared score→tone mapping for the lab's verdict surfaces.
 * Pure. Used by lane score pills (ColumnHeader) and the analysis drawer so a
 * 6.8 reads the same colour everywhere. Colour is NEVER the only signal — the
 * numeral always rides alongside (a11y / SOP emphasis-tiers).
 */
export type ScoreTone = 'is-strong' | 'is-mid' | 'is-weak';

/** ≥7.5 strong · ≥5 mid · else weak. */
export function scoreTone(score: number): ScoreTone {
  if (score >= 7.5) return 'is-strong';
  if (score >= 5) return 'is-mid';
  return 'is-weak';
}

/** A lane's live verdict headline: score + grounding state. */
export interface LaneScore {
  /** Synthesized 0–10 score (post grounding gate). */
  score: number;
  gateTripped: boolean;
  borderline: boolean;
}

/**
 * Tone for a lane pill. A tripped grounding gate forces 'is-weak' regardless of
 * the number — a high-but-ungrounded answer must never read green.
 */
export function laneTone(s: LaneScore): ScoreTone {
  if (s.gateTripped) return 'is-weak';
  return scoreTone(s.score);
}
