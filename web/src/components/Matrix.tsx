/**
 * Matrix — the 2×2 scoreboard that IS the Answer-Quality Lab interface.
 *
 * Layout (v1.2 canonical, axis-swapped from v1.0):
 *   Rows    = retrieval   (Keyword top, Neural bottom)
 *   Columns = architecture (Single left, Multi right)
 *
 *   Row-major panel assignment (LOCKED):
 *     P1  top-left    · Single + Keyword  (baseline)
 *     P2  top-right   · Multi  + Keyword
 *     P3  bottom-left · Single + Neural
 *     P4  bottom-right· Multi  + Neural   (full power — ★ winner candidate)
 *
 * Composition:
 *   <Matrix> owns the grid shell, axis labels, delta strip, and compound badge.
 *   One <PanelCell> per cell is rendered as children — Matrix does NOT know
 *   about answer content; it only routes per-panel judge data to each cell's
 *   header (score pill + winner glow).
 *
 * Data flow:
 *   - `panelJudge`  — keyed by PanelId, set once judging completes per panel.
 *   - `panelStatus` — lifecycle state per panel (idle→streaming→judging→judged).
 *   - `onOpenJudge` — callback when a cell's score chip is clicked; parent mounts
 *     the JudgeDrawer with the relevant panel's verdict.
 *   - The compound/winner badge is derived from `panelJudge` after all 4 panels
 *     report; it is a persistent overlay on the winning cell's corner.
 */

import { useMemo, type ReactNode } from 'react';
import type { PanelId, PanelJudgeResult, CrossPanelDeltas } from '../types/chat';
import { PANEL_CONFIGS } from '../config/columns';
import { scoreTone } from '../lib/score';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Lifecycle state for a single panel cell. */
export type PanelStatus =
  | 'idle'
  | 'submitting'
  | 'streaming'
  | 'answered'
  | 'judging'
  | 'judged'
  | 'refused'
  | 'error';

export interface MatrixProps {
  /**
   * Per-panel judge results — present only for panels that have been judged.
   * The Matrix uses this to:
   *   • render the composite score pill in each cell header
   *   • derive the winner + compound badge
   *   • compute the three deltas (multi-lift / neural-lift / compound) when
   *     all 4 panels are scored
   */
  panelJudge: Partial<Record<PanelId, PanelJudgeResult>>;

  /**
   * Cross-panel deltas from the server — present when ≥2 panels are judged.
   * Falls back to client-side derivation when absent but all 4 are scored.
   */
  deltas?: CrossPanelDeltas;

  /** Lifecycle state for each panel, drives the status chip inside each cell. */
  panelStatus: Record<PanelId, PanelStatus>;

  /**
   * Children must be exactly 4 <PanelCell> elements in P1–P4 order (row-major).
   * Matrix injects the winner/score context via CSS custom props + class names —
   * it does NOT clone or mutate the children; each PanelCell receives its own
   * onOpenJudge / score props directly from App.tsx.
   */
  children: [ReactNode, ReactNode, ReactNode, ReactNode];

  /** Called with the PanelId when the user clicks a cell's score chip. */
  onOpenJudge: (id: PanelId) => void;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const PANEL_IDS: PanelId[] = ['P1', 'P2', 'P3', 'P4'];

/** Derive the winner panel id from the judged set (highest composite, not gate-tripped first). */
function deriveWinner(judges: Partial<Record<PanelId, PanelJudgeResult>>): PanelId | null {
  let best: PanelId | null = null;
  let bestScore = -1;
  for (const id of PANEL_IDS) {
    const j = judges[id];
    if (!j) continue;
    // gate-tripped panels can still win if all gate-trip (unlikely but fair)
    const effective = j.gateTripped ? Math.min(j.composite, 3) : j.composite;
    if (effective > bestScore) {
      bestScore = effective;
      best = id;
    }
  }
  return best;
}

/** Signed delta label: "+1.2" / "−0.3" / "–" when undefined. */
function deltaLabel(v: number | undefined): string {
  if (v === undefined || v === null) return '–';
  if (v >= 0) return `+${v.toFixed(1)}`;
  return `−${Math.abs(v).toFixed(1)}`;
}

/** Class suffix for a signed delta value. */
function deltaClass(v: number | undefined): string {
  if (v === undefined || v === null) return '';
  return v >= 0 ? ' is-lift' : ' is-drop';
}

// ---------------------------------------------------------------------------
// Score pill — the always-visible composite chip in each cell header.
// ---------------------------------------------------------------------------

interface ScorePillProps {
  panelId: PanelId;
  verdict: PanelJudgeResult | undefined;
  status: PanelStatus;
  isWinner: boolean;
  onClick: () => void;
}

function ScorePill({ panelId, verdict, status, isWinner, onClick }: ScorePillProps) {
  if (!verdict) {
    // Show a status-driven placeholder while judging is in flight.
    const pending = status === 'judging' || status === 'answered';
    return (
      <span
        className={`matrix__score-pill matrix__score-pill--empty${pending ? ' is-pending' : ''}`}
        aria-label={
          pending
            ? `${panelId} judging in progress`
            : `${panelId} not yet judged`
        }
      >
        {pending ? <span className="matrix__spinner" aria-hidden="true" /> : '—'}
      </span>
    );
  }

  const tone = verdict.gateTripped ? 'is-weak' : scoreTone(verdict.composite);
  const gateSuffix = verdict.gateTripped
    ? ' · gated'
    : verdict.borderline
      ? ' · borderline'
      : '';

  return (
    <button
      type="button"
      className={`matrix__score-pill ${tone}${isWinner ? ' is-winner' : ''}`}
      onClick={onClick}
      title={`${panelId} composite ${verdict.composite.toFixed(1)}/10${gateSuffix} — click for judge analysis`}
      aria-label={`${panelId} scored ${verdict.composite.toFixed(1)} out of 10${gateSuffix}. Open judge analysis.`}
    >
      {isWinner && <span className="matrix__star" aria-hidden="true">★</span>}
      <span className="matrix__score-num">{verdict.composite.toFixed(1)}</span>
      <span className="matrix__score-unit">/10</span>
      <span className="matrix__score-icon" aria-hidden="true">⚖</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Timing chip — first-token / total latency shown in each cell header.
// ---------------------------------------------------------------------------

interface TimingChipProps {
  firstTokenMs?: number;
  totalMs?: number;
}

function TimingChip({ firstTokenMs, totalMs }: TimingChipProps) {
  if (!totalMs) return null;
  const first = firstTokenMs ? `${(firstTokenMs / 1000).toFixed(1)}s` : null;
  const total = `${(totalMs / 1000).toFixed(1)}s`;
  return (
    <span className="matrix__timing" title="First-token / total latency">
      <span className="matrix__timing-icon" aria-hidden="true">⏱</span>
      {first && first !== total ? `${first} / ${total}` : total}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Cell wrapper — injects winner glow, compound badge, and the score+time
// header bar that "sandwiches" the grid rows per v1.2 spec.
// ---------------------------------------------------------------------------

interface CellWrapperProps {
  panelId: PanelId;
  verdict: PanelJudgeResult | undefined;
  status: PanelStatus;
  isWinner: boolean;
  isCompound: boolean; // P4 = best of both axes, always gets the compound badge
  firstTokenMs?: number;
  totalMs?: number;
  onOpenJudge: () => void;
  children: ReactNode;
}

function CellWrapper({
  panelId,
  verdict,
  status,
  isWinner,
  isCompound,
  firstTokenMs,
  totalMs,
  onOpenJudge,
  children,
}: CellWrapperProps) {
  const cfg = PANEL_CONFIGS.find((p) => p.id === panelId)!;
  const winnerClass = isWinner ? ' matrix__cell--winner' : '';
  const judgedClass = verdict ? ' matrix__cell--judged' : '';

  return (
    <div
      className={`matrix__cell${winnerClass}${judgedClass}`}
      style={{ ['--cell-accent' as string]: `var(${cfg.accentVar})` }}
      data-panel={panelId}
    >
      {/* Cell header: score pill (left) + timing (right) — the scoreboard row */}
      <div className="matrix__cell-head">
        <ScorePill
          panelId={panelId}
          verdict={verdict}
          status={status}
          isWinner={isWinner}
          onClick={onOpenJudge}
        />
        <TimingChip firstTokenMs={firstTokenMs} totalMs={totalMs} />
        {/* Compound/winner badge — persistent corner badge on P4 or overall winner */}
        {isCompound && verdict && (
          <span
            className={`matrix__badge matrix__badge--compound${isWinner ? ' is-winner' : ''}`}
            aria-label="P4 — full power: Multi-agent + Neural (compound)"
            title="Compound: Multi-agent + Neural — the diagonal argument (P1 → P4)"
          >
            P1→P4
          </span>
        )}
      </div>

      {/* The PanelCell answer content */}
      <div className="matrix__cell-body">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Delta strip — the three comparative numbers below the grid.
// ---------------------------------------------------------------------------

interface DeltaStripProps {
  deltas: CrossPanelDeltas | undefined;
  allJudged: boolean;
}

function DeltaStrip({ deltas, allJudged }: DeltaStripProps) {
  if (!allJudged && !deltas) return null;

  const multiKeyword = deltas?.multiLift?.keyword;
  const multiNeural = deltas?.multiLift?.neural;
  const neuralSingle = deltas?.neuralLift?.single;
  const neuralMulti = deltas?.neuralLift?.multi;
  const compound = deltas?.compound;

  // Representative per-axis lift: average when both values present, else whichever exists
  const multiLift =
    multiKeyword !== undefined && multiNeural !== undefined
      ? (multiKeyword + multiNeural) / 2
      : (multiKeyword ?? multiNeural);
  const neuralLift =
    neuralSingle !== undefined && neuralMulti !== undefined
      ? (neuralSingle + neuralMulti) / 2
      : (neuralSingle ?? neuralMulti);

  return (
    <div className="matrix__deltas" role="region" aria-label="Cross-panel score deltas">
      <dl className="matrix__delta-list">
        <div className="matrix__delta-item">
          <dt className="matrix__delta-label">
            <span className="matrix__delta-arrow" aria-hidden="true">→</span>
            multi-lift
          </dt>
          <dd className={`matrix__delta-val${deltaClass(multiLift)}`}>
            {deltaLabel(multiLift)}
          </dd>
        </div>
        <span className="matrix__delta-sep" aria-hidden="true">·</span>
        <div className="matrix__delta-item">
          <dt className="matrix__delta-label">
            <span className="matrix__delta-arrow" aria-hidden="true">↓</span>
            neural-lift
          </dt>
          <dd className={`matrix__delta-val${deltaClass(neuralLift)}`}>
            {deltaLabel(neuralLift)}
          </dd>
        </div>
        <span className="matrix__delta-sep" aria-hidden="true">·</span>
        <div className="matrix__delta-item">
          <dt className="matrix__delta-label">
            <span className="matrix__delta-arrow" aria-hidden="true">⤢</span>
            compound P1→P4
          </dt>
          <dd className={`matrix__delta-val${deltaClass(compound)}`}>
            {deltaLabel(compound)}
          </dd>
        </div>
      </dl>
      {!allJudged && (
        <p className="matrix__deltas-pending" aria-live="polite">
          Deltas update as panels complete judging.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Matrix — the main export
// ---------------------------------------------------------------------------

/**
 * Matrix renders the 2×2 grid scoreboard.
 *
 * IMPORTANT: the four children must arrive in row-major order — P1, P2, P3, P4.
 * Matrix wraps each child in a CellWrapper that injects the winner glow, compound
 * badge, and score+time header. The children (PanelCell) are responsible for
 * their own answer content; Matrix is responsible for the grid shell and identity.
 *
 * CSS custom props set per cell:
 *   --cell-accent  → the panel's accent color var (from PANEL_CONFIGS.accentVar)
 * CSS classes on the cell div:
 *   matrix__cell--winner  → winner glow (box-shadow + border accent)
 *   matrix__cell--judged  → used by CSS to fade in the score header
 */
export function Matrix({
  panelJudge,
  deltas: serverDeltas,
  panelStatus,
  children,
  onOpenJudge,
}: MatrixProps) {
  const [p1Child, p2Child, p3Child, p4Child] = children;

  // Derive winner from judged panels.
  const winner = useMemo(() => deriveWinner(panelJudge), [panelJudge]);

  // All 4 panels judged — enables full delta strip + compound badge confidence.
  const allJudged = PANEL_IDS.every((id) => !!panelJudge[id]);

  // Client-side delta derivation (fallback when server deltas not yet available
  // but all 4 panels have composites).
  const deltas = useMemo<CrossPanelDeltas | undefined>(() => {
    if (serverDeltas) return serverDeltas;
    if (!allJudged) return undefined;
    const s = (id: PanelId) => panelJudge[id]!.composite;
    return {
      multiLift: {
        keyword: s('P2') - s('P1'),
        neural: s('P4') - s('P3'),
      },
      neuralLift: {
        single: s('P3') - s('P1'),
        multi: s('P4') - s('P2'),
      },
      compound: s('P4') - s('P1'),
    };
  }, [serverDeltas, allJudged, panelJudge]);

  // Timing helper — pulled from the judge result when available; otherwise the
  // PanelCell renders its own timing (this is just for the header chip).
  const timing = (_id: PanelId) => ({
    firstTokenMs: undefined as number | undefined,
    totalMs: undefined as number | undefined,
  });

  return (
    <section className="matrix" aria-label="2×2 Answer-Quality scoreboard">
      {/* ------------------------------------------------------------------ */}
      {/* Axis column headers (top) — architecture labels                    */}
      {/* ------------------------------------------------------------------ */}
      <div className="matrix__grid" role="grid" aria-label="2×2 panel grid">

        {/* Top-left corner spacer (row label column + header row) */}
        <div className="matrix__corner" aria-hidden="true" />

        {/* Column headers */}
        <div className="matrix__col-head" role="columnheader">
          <span className="matrix__col-label">Single agent</span>
          <span className="matrix__col-sub">one agent, one index</span>
        </div>
        <div className="matrix__col-head" role="columnheader">
          <span className="matrix__col-label">Multi-agent</span>
          <span className="matrix__col-sub">Maverick + source specialists</span>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Row 1 — Keyword                                                  */}
        {/* ---------------------------------------------------------------- */}
        <div className="matrix__row-head" role="rowheader" aria-label="Keyword retrieval">
          <span className="matrix__row-label">Keyword</span>
          <span className="matrix__row-sub">exact match · lexical</span>
        </div>

        {/* P1 — Single + Keyword */}
        <div className="matrix__cell-slot" role="gridcell">
          <CellWrapper
            panelId="P1"
            verdict={panelJudge['P1']}
            status={panelStatus['P1']}
            isWinner={winner === 'P1'}
            isCompound={false}
            {...timing('P1')}
            onOpenJudge={() => onOpenJudge('P1')}
          >
            {p1Child}
          </CellWrapper>
        </div>

        {/* P2 — Multi + Keyword */}
        <div className="matrix__cell-slot" role="gridcell">
          <CellWrapper
            panelId="P2"
            verdict={panelJudge['P2']}
            status={panelStatus['P2']}
            isWinner={winner === 'P2'}
            isCompound={false}
            {...timing('P2')}
            onOpenJudge={() => onOpenJudge('P2')}
          >
            {p2Child}
          </CellWrapper>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Row 2 — Neural                                                   */}
        {/* ---------------------------------------------------------------- */}
        <div className="matrix__row-head" role="rowheader" aria-label="Neural retrieval">
          <span className="matrix__row-label">Neural</span>
          <span className="matrix__row-sub">semantic · NeuralSearch</span>
        </div>

        {/* P3 — Single + Neural */}
        <div className="matrix__cell-slot" role="gridcell">
          <CellWrapper
            panelId="P3"
            verdict={panelJudge['P3']}
            status={panelStatus['P3']}
            isWinner={winner === 'P3'}
            isCompound={false}
            {...timing('P3')}
            onOpenJudge={() => onOpenJudge('P3')}
          >
            {p3Child}
          </CellWrapper>
        </div>

        {/* P4 — Multi + Neural (compound: full power) */}
        <div className="matrix__cell-slot" role="gridcell">
          <CellWrapper
            panelId="P4"
            verdict={panelJudge['P4']}
            status={panelStatus['P4']}
            isWinner={winner === 'P4'}
            isCompound={true}
            {...timing('P4')}
            onOpenJudge={() => onOpenJudge('P4')}
          >
            {p4Child}
          </CellWrapper>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Delta strip — the three comparative numbers                        */}
      {/* ------------------------------------------------------------------ */}
      <DeltaStrip deltas={deltas} allJudged={allJudged} />
    </section>
  );
}
