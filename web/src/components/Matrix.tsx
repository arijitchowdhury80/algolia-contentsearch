/**
 * Matrix — the 2×2 scoreboard grid (premium glass redesign).
 *
 *   Rows    = retrieval   (Keyword top, Neural bottom)
 *   Columns = architecture (Single left, Multi right)
 *   Row-major: P1 single·keyword · P2 multi·keyword · P3 single·neural · P4 multi·neural
 *
 * Matrix owns the grid shell, axis labels, and winner glow. Score/time/grounding
 * live INSIDE each PanelCell header. The plain-language verdict lives in App's
 * headline bar (the cryptic delta strip was removed). Four children, P1–P4 order.
 */
import { useMemo, type ReactNode } from 'react';
import type { PanelId, PanelJudgeResult } from '../types/chat';
import { PANEL_CONFIGS } from '../config/columns';

/** Lifecycle state for a single panel cell (kept for the host's convenience). */
export type PanelStatus =
  | 'idle' | 'submitting' | 'streaming' | 'answered' | 'judging' | 'judged' | 'refused' | 'error';

export interface MatrixProps {
  /** Per-panel judge results — present only for judged panels. Drives the winner glow. */
  panelJudge: Partial<Record<PanelId, PanelJudgeResult>>;
  /** Exactly four <PanelCell> elements in P1–P4 (row-major) order. */
  children: [ReactNode, ReactNode, ReactNode, ReactNode];
}

const PANEL_IDS: PanelId[] = ['P1', 'P2', 'P3', 'P4'];

/** Winner = highest composite; gate-tripped panels are clamped so they don't win. */
function deriveWinner(judges: Partial<Record<PanelId, PanelJudgeResult>>): PanelId | null {
  let best: PanelId | null = null;
  let bestScore = -1;
  for (const id of PANEL_IDS) {
    const j = judges[id];
    if (!j) continue;
    const effective = j.gateTripped ? Math.min(j.composite, 3) : j.composite;
    if (effective > bestScore) {
      bestScore = effective;
      best = id;
    }
  }
  return best;
}

interface CellWrapperProps {
  panelId: PanelId;
  isWinner: boolean;
  children: ReactNode;
}

function CellWrapper({ panelId, isWinner, children }: CellWrapperProps) {
  const cfg = PANEL_CONFIGS.find((p) => p.id === panelId)!;
  return (
    <div
      className={`matrix__cell${isWinner ? ' matrix__cell--winner' : ''}`}
      style={{ ['--cell-accent' as string]: `var(${cfg.accentVar})` }}
      data-panel={panelId}
    >
      <div className="matrix__cell-body">{children}</div>
    </div>
  );
}

export function Matrix({ panelJudge, children }: MatrixProps) {
  const [p1Child, p2Child, p3Child, p4Child] = children;
  const winner = useMemo(() => deriveWinner(panelJudge), [panelJudge]);

  return (
    <section className="matrix" aria-label="2×2 Answer-Quality scoreboard">
      <div className="matrix__grid" role="grid" aria-label="2×2 panel grid">
        <div className="matrix__corner" aria-hidden="true" />

        <div className="matrix__col-head" role="columnheader">
          <span className="matrix__col-label">Single agent</span>
        </div>
        <div className="matrix__col-head" role="columnheader">
          <span className="matrix__col-label">Multi-agent</span>
        </div>

        {/* Row 1 — Keyword */}
        <div className="matrix__row-head" role="rowheader" aria-label="Keyword retrieval">
          <span className="matrix__row-label">Keyword</span>
        </div>
        <div className="matrix__cell-slot" role="gridcell">
          <CellWrapper panelId="P1" isWinner={winner === 'P1'}>{p1Child}</CellWrapper>
        </div>
        <div className="matrix__cell-slot" role="gridcell">
          <CellWrapper panelId="P2" isWinner={winner === 'P2'}>{p2Child}</CellWrapper>
        </div>

        {/* Row 2 — Neural */}
        <div className="matrix__row-head" role="rowheader" aria-label="Neural retrieval">
          <span className="matrix__row-label">Neural</span>
        </div>
        <div className="matrix__cell-slot" role="gridcell">
          <CellWrapper panelId="P3" isWinner={winner === 'P3'}>{p3Child}</CellWrapper>
        </div>
        <div className="matrix__cell-slot" role="gridcell">
          <CellWrapper panelId="P4" isWinner={winner === 'P4'}>{p4Child}</CellWrapper>
        </div>
      </div>
    </section>
  );
}
