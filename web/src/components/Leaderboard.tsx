/**
 * Leaderboard — batch aggregate view for the 2×2 Answer-Quality Lab.
 *
 * Displayed via the top [Live | Leaderboard] toggle in App.tsx. Shows the
 * authoritative results (batch judge, full sources, gemini-2.5-pro, 3 judges)
 * over the entire v3 question set.
 *
 * Four layers, per UX v1.4:
 *   1. Aggregate 2×2 — mean composite per cell, winner glow, three deltas,
 *      grounding headline. Rows = retrieval, cols = architecture.
 *   2. Dimension attribution — where each lift comes from (grounding /
 *      coverage / depth / relevance). First-class, always visible.
 *   3. Per-question table — rows = questions, cols = P1–P4 composites,
 *      winner badge, thin/contested warnings. Click a row → onOpenQuestion(qid).
 *   4. Expanders — win-rate per cell, score distribution, flagged/capped audit.
 *
 * Data contract: LeaderboardData (below) — passed in from App.tsx which holds
 * the batch run transcript. An empty-state renders when data is null/undefined.
 *
 * This component is pure UI — no fetching, no side-effects beyond the one
 * callback prop. All computation is local to this file.
 */

import { useState, useMemo } from 'react';
import type { PanelId, VerdictDims } from '../types/chat';
import { scoreTone } from '../lib/score';
import { PANEL_CONFIGS } from '../config/columns';

// ---------------------------------------------------------------------------
// Data contracts (batch run transcript shape)
// ---------------------------------------------------------------------------

/** Per-panel judged result for one question. */
export interface LeaderboardPanelResult {
  panelId: PanelId;
  composite: number;
  preGateScore: number;
  gateTripped: boolean;
  borderline: boolean;
  dims: VerdictDims;
  flaggedCount: number;
}

/** One judged question entry. */
export interface LeaderboardQuestion {
  /** Stable question ID (e.g. "q01", "q-typo-tolerance"). */
  id: string;
  /** The full question prompt text. */
  prompt: string;
  /** Per-panel results. */
  panels: LeaderboardPanelResult[];
}

/** The full batch run payload — passed in from the host (App.tsx). */
export interface LeaderboardData {
  /** How many questions in this run. */
  questionCount: number;
  /** Timestamp the batch was completed (ms since epoch). */
  completedAt: number;
  /** All judged questions. */
  questions: LeaderboardQuestion[];
}

interface Props {
  data?: LeaderboardData | null;
  /** Called when the user clicks a per-question row — host re-opens the Arena
   *  with this question pre-loaded so they can see the 4 panels + judge drawer. */
  onOpenQuestion: (qid: string) => void;
}

// ---------------------------------------------------------------------------
// Panel ordering (row-major: P1 keyword-single, P2 keyword-multi,
//   P3 neural-single, P4 neural-multi)
// ---------------------------------------------------------------------------

const PANEL_IDS: PanelId[] = ['P1', 'P2', 'P3', 'P4'];

/** Accent CSS custom-prop → resolved hex isn't needed — we reuse the var. */
const PANEL_ACCENT: Record<PanelId, string> = {
  P1: '--accent-p1',
  P2: '--accent-p2',
  P3: '--accent-p3',
  P4: '--accent-p4',
};

// ---------------------------------------------------------------------------
// Aggregation helpers
// ---------------------------------------------------------------------------

interface CellStats {
  mean: number;
  winRate: number;       // fraction of questions this panel won (or tied-won)
  scores: number[];
  meanDims: VerdictDims;
  cleanCount: number;    // questions with 0 flagged claims
  cappedCount: number;   // questions where gateTripped
}

interface AggResult {
  cells: Record<PanelId, CellStats>;
  multiLiftKeyword: number | null;   // P2 − P1
  multiLiftNeural: number | null;    // P4 − P3
  neuralLiftSingle: number | null;   // P3 − P1
  neuralLiftMulti: number | null;    // P4 − P2
  compound: number | null;           // P4 − P1
  winnerId: PanelId | null;
  groundingHeadline: string;
}

function mean(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

function aggregate(data: LeaderboardData): AggResult {
  const scoresByPanel: Record<PanelId, number[]> = { P1: [], P2: [], P3: [], P4: [] };
  const dimsByPanel: Record<PanelId, VerdictDims[]> = { P1: [], P2: [], P3: [], P4: [] };
  const cleanByPanel: Record<PanelId, number> = { P1: 0, P2: 0, P3: 0, P4: 0 };
  const cappedByPanel: Record<PanelId, number> = { P1: 0, P2: 0, P3: 0, P4: 0 };
  const winsByPanel: Record<PanelId, number> = { P1: 0, P2: 0, P3: 0, P4: 0 };

  for (const q of data.questions) {
    // Collect per-panel
    for (const pr of q.panels) {
      const pid = pr.panelId as PanelId;
      if (!PANEL_IDS.includes(pid)) continue;
      scoresByPanel[pid].push(pr.composite);
      dimsByPanel[pid].push(pr.dims);
      if (pr.flaggedCount === 0) cleanByPanel[pid]++;
      if (pr.gateTripped) cappedByPanel[pid]++;
    }
    // Determine per-question winners (all panels with the highest score)
    const maxComposite = Math.max(...q.panels.map((p) => p.composite));
    for (const pr of q.panels) {
      if (pr.composite >= maxComposite - 0.001) {
        winsByPanel[pr.panelId as PanelId]++;
      }
    }
  }

  const n = data.questionCount || 1;

  const cells = {} as Record<PanelId, CellStats>;
  for (const pid of PANEL_IDS) {
    const scores = scoresByPanel[pid];
    const dimsArr = dimsByPanel[pid];
    cells[pid] = {
      mean: mean(scores),
      winRate: winsByPanel[pid] / n,
      scores,
      meanDims: {
        grounding: mean(dimsArr.map((d) => d.grounding)),
        coverage: mean(dimsArr.map((d) => d.coverage)),
        depth: mean(dimsArr.map((d) => d.depth)),
        relevance: mean(dimsArr.map((d) => d.relevance)),
      },
      cleanCount: cleanByPanel[pid],
      cappedCount: cappedByPanel[pid],
    };
  }

  // Deltas
  const m = (pid: PanelId) => cells[pid]?.mean ?? null;
  const multiLiftKeyword = m('P2') !== null && m('P1') !== null ? m('P2')! - m('P1')! : null;
  const multiLiftNeural = m('P4') !== null && m('P3') !== null ? m('P4')! - m('P3')! : null;
  const neuralLiftSingle = m('P3') !== null && m('P1') !== null ? m('P3')! - m('P1')! : null;
  const neuralLiftMulti = m('P4') !== null && m('P2') !== null ? m('P4')! - m('P2')! : null;
  const compound = m('P4') !== null && m('P1') !== null ? m('P4')! - m('P1')! : null;

  // Winner = highest mean composite
  let winnerId: PanelId | null = null;
  let winnerScore = -Infinity;
  for (const pid of PANEL_IDS) {
    if (cells[pid].mean > winnerScore) {
      winnerScore = cells[pid].mean;
      winnerId = pid;
    }
  }

  // Grounding headline
  const totalAnswers = data.questionCount * 4;
  const totalClean = PANEL_IDS.reduce((s, pid) => s + cells[pid].cleanCount, 0);
  const pct = totalAnswers > 0 ? Math.round((totalClean / totalAnswers) * 100) : 0;
  const groundingHeadline =
    pct === 100
      ? `100% clean across all ${totalAnswers} answers (${data.questionCount} questions × 4 panels)`
      : `${pct}% clean — ${totalAnswers - totalClean} flagged answer${totalAnswers - totalClean !== 1 ? 's' : ''} across ${totalAnswers} total`;

  return {
    cells,
    multiLiftKeyword,
    multiLiftNeural,
    neuralLiftSingle,
    neuralLiftMulti,
    compound,
    winnerId,
    groundingHeadline,
  };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** A horizontal score bar (reused from AnalysisRail idiom). */
function DimBar({
  label,
  score,
  sub,
}: {
  label: string;
  score: number;
  sub?: string;
}) {
  const pct = Math.max(0, Math.min(100, (score / 10) * 100));
  const tone = scoreTone(score);
  return (
    <div className="dimbar">
      <div className="dimbar__head">
        <span className="dimbar__label">{label}</span>
        <span className={`dimbar__val ${tone}`}>{score.toFixed(2)}</span>
      </div>
      <div
        className="dimbar__track"
        role="img"
        aria-label={`${label}: ${score.toFixed(2)} out of 10`}
      >
        <span className={`dimbar__fill ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      {sub ? <span className="dimbar__sub">{sub}</span> : null}
    </div>
  );
}

/** A signed delta badge — green for positive, red for negative. */
function DeltaBadge({
  value,
  label,
}: {
  value: number | null;
  label: string;
}) {
  if (value === null) return null;
  const sign = value >= 0 ? '+' : '';
  const tone = value >= 0 ? 'is-strong' : 'is-weak';
  return (
    <span className={`lb__delta ${tone}`} title={label}>
      {sign}{value.toFixed(2)}
    </span>
  );
}

/** Score distribution mini-chart (10 buckets: 0–1, 1–2, …, 9–10). */
function ScoreDistribution({ scores }: { scores: number[] }) {
  const buckets = Array.from({ length: 10 }, () => 0);
  for (const s of scores) {
    const b = Math.min(9, Math.floor(s));
    buckets[b]++;
  }
  const maxBucket = Math.max(...buckets, 1);
  return (
    <div className="lb__dist" aria-label="Score distribution">
      {buckets.map((count, i) => {
        const pct = (count / maxBucket) * 100;
        return (
          <div key={i} className="lb__dist-col" title={`${i}–${i + 1}: ${count} answers`}>
            <div
              className="lb__dist-bar"
              style={{ height: `${Math.max(2, pct)}%` }}
            />
            <span className="lb__dist-lbl">{i}</span>
          </div>
        );
      })}
    </div>
  );
}

/** The aggregate 2×2 matrix card. */
function AggregateMatrix({
  agg,
}: {
  agg: AggResult;
}) {
  const panelConfig = useMemo(
    () => Object.fromEntries(PANEL_CONFIGS.map((p) => [p.id, p])),
    [],
  );

  // Build verdict text from deltas
  const verdictParts: string[] = [];
  if (agg.neuralLiftSingle !== null) {
    verdictParts.push(
      `neural ${agg.neuralLiftSingle >= 0 ? '>' : '<'} keyword (single: ${agg.neuralLiftSingle >= 0 ? '+' : ''}${agg.neuralLiftSingle.toFixed(2)})`,
    );
  }
  if (agg.multiLiftKeyword !== null) {
    verdictParts.push(
      `multi ${agg.multiLiftKeyword >= 0 ? '>' : '<'} single (keyword: ${agg.multiLiftKeyword >= 0 ? '+' : ''}${agg.multiLiftKeyword.toFixed(2)})`,
    );
  }
  if (agg.compound !== null) {
    verdictParts.push(
      `best = P4 (Multi+Neural), ${agg.compound >= 0 ? '+' : ''}${agg.compound.toFixed(2)} over P1 baseline`,
    );
  }
  const verdictLine = verdictParts.join(' · ');

  return (
    <section className="arail__card lb__card--headline" aria-label="Aggregate 2x2 scorecard">
      <div className="arail__card-head">
        <h3 className="arail__card-title">2×2 Scorecard</h3>
        <span className="lb__badge lb__badge--batch">batch · authoritative</span>
      </div>

      {/* 2×2 matrix grid: rows = retrieval, cols = architecture */}
      <div className="lb__matrix" role="table" aria-label="2x2 aggregate scores">
        {/* Column headers */}
        <div className="lb__matrix-corner" role="columnheader" />
        <div className="lb__matrix-colhead" role="columnheader">Single agent</div>
        <div className="lb__matrix-colhead" role="columnheader">Multi-agent</div>
        {/* Row: Keyword */}
        <div className="lb__matrix-rowhead" role="rowheader">Keyword</div>
        {(['P1', 'P2'] as PanelId[]).map((pid) => {
          const cell = agg.cells[pid];
          const isWinner = agg.winnerId === pid;
          const tone = scoreTone(cell.mean);
          return (
            <div
              key={pid}
              className={`lb__cell ${isWinner ? 'lb__cell--winner' : ''}`}
              style={{ ['--cell-accent' as string]: `var(${PANEL_ACCENT[pid]})` }}
              role="cell"
              aria-label={`${panelConfig[pid]?.label ?? pid}: ${cell.mean.toFixed(2)}`}
            >
              <div className="lb__cell-id">{pid}</div>
              <div className={`lb__cell-score ${tone}`}>
                {cell.mean.toFixed(2)}
                {isWinner && <span className="lb__star" aria-label="winner">★</span>}
              </div>
              <div className="lb__cell-sub">/10</div>
            </div>
          );
        })}
        {/* Row: Neural */}
        <div className="lb__matrix-rowhead" role="rowheader">Neural</div>
        {(['P3', 'P4'] as PanelId[]).map((pid) => {
          const cell = agg.cells[pid];
          const isWinner = agg.winnerId === pid;
          const tone = scoreTone(cell.mean);
          return (
            <div
              key={pid}
              className={`lb__cell ${isWinner ? 'lb__cell--winner' : ''}`}
              style={{ ['--cell-accent' as string]: `var(${PANEL_ACCENT[pid]})` }}
              role="cell"
              aria-label={`${panelConfig[pid]?.label ?? pid}: ${cell.mean.toFixed(2)}`}
            >
              <div className="lb__cell-id">{pid}</div>
              <div className={`lb__cell-score ${tone}`}>
                {cell.mean.toFixed(2)}
                {isWinner && <span className="lb__star" aria-label="winner">★</span>}
              </div>
              <div className="lb__cell-sub">/10</div>
            </div>
          );
        })}
        {/* Delta row: multi-lift across rows */}
        <div className="lb__matrix-rowhead lb__matrix-rowhead--delta" role="rowheader">multi lift</div>
        <div className="lb__delta-cell" role="cell">
          <DeltaBadge value={agg.multiLiftKeyword} label="Multi lift (keyword row)" />
        </div>
        <div className="lb__delta-cell" role="cell">
          <DeltaBadge value={agg.multiLiftNeural} label="Multi lift (neural row)" />
        </div>
      </div>

      {/* Neural-lift column footer + compound */}
      <div className="lb__lifts">
        <div className="lb__lift-item">
          <span className="lb__lift-label">neural lift · single col</span>
          <DeltaBadge value={agg.neuralLiftSingle} label="Neural lift (single column)" />
        </div>
        <div className="lb__lift-item">
          <span className="lb__lift-label">neural lift · multi col</span>
          <DeltaBadge value={agg.neuralLiftMulti} label="Neural lift (multi column)" />
        </div>
        <div className="lb__lift-item lb__lift-item--compound">
          <span className="lb__lift-label">compound P1 → P4</span>
          <DeltaBadge value={agg.compound} label="Compound lift P1 to P4" />
        </div>
      </div>

      {/* One-line verdict */}
      {verdictLine && (
        <p className="lb__verdict">{verdictLine}</p>
      )}

      {/* Grounding headline */}
      <div className="lb__grounding-head">
        <span className="lb__grounding-icon" aria-hidden="true">
          {agg.groundingHeadline.startsWith('100%') ? '✅' : '⚠'}
        </span>
        <span className="lb__grounding-text">{agg.groundingHeadline}</span>
      </div>
    </section>
  );
}

/** Dimension attribution — decomposes where the lifts come from. */
function DimensionAttribution({ agg }: { agg: AggResult }) {
  // For each delta pair, compare the mean dims to find the biggest driver.
  const dimLabels: { key: keyof VerdictDims; label: string; sub?: string }[] = [
    { key: 'grounding', label: 'Grounding', sub: 'hard floor + scored' },
    { key: 'coverage', label: 'Coverage' },
    { key: 'depth', label: 'Depth' },
    { key: 'relevance', label: 'Relevance' },
  ];

  return (
    <section className="arail__card" aria-label="Dimension attribution">
      <div className="arail__card-head">
        <h3 className="arail__card-title">Dimension attribution</h3>
        <span className="analysis__card-sub">where each lift comes from</span>
      </div>
      <p className="lb__attr-intro">
        Mean dimension scores per cell — shows whether the lift is driven by
        Grounding (more relevant sources), Confidence (clearer answers), or
        Breadth&nbsp;&amp;&nbsp;Depth (more complete coverage).
      </p>

      <div className="lb__attr-grid">
        {PANEL_IDS.map((pid) => {
          const dims = agg.cells[pid].meanDims;
          const panelCfg = PANEL_CONFIGS.find((p) => p.id === pid);
          return (
            <div
              key={pid}
              className="lb__attr-panel"
              style={{ ['--cell-accent' as string]: `var(${PANEL_ACCENT[pid]})` }}
            >
              <div className="lb__attr-head">
                <span className="lb__attr-id">{pid}</span>
                <span className="lb__attr-label">{panelCfg?.arch === 'multi' ? 'Multi' : 'Single'} · {panelCfg?.retrieval === 'neural' ? 'Neural' : 'Keyword'}</span>
              </div>
              <div className="dimbars">
                {dimLabels.map(({ key, label, sub }) => (
                  <DimBar key={key} label={label} score={dims[key]} sub={sub} />
                ))}
              </div>
              <div className="lb__attr-mean">
                mean composite&nbsp;
                <span className={`lb__attr-mean-val ${scoreTone(agg.cells[pid].mean)}`}>
                  {agg.cells[pid].mean.toFixed(2)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Cross-cell delta breakdowns by dimension */}
      <div className="lb__attr-deltas">
        <h4 className="lb__attr-deltas-title">Dimension-level lifts</h4>
        <div className="lb__attr-delta-rows">
          {dimLabels.map(({ key, label }) => {
            const p1 = agg.cells['P1'].meanDims[key];
            const p2 = agg.cells['P2'].meanDims[key];
            const p3 = agg.cells['P3'].meanDims[key];
            const p4 = agg.cells['P4'].meanDims[key];
            const mlK = p2 - p1;
            const mlN = p4 - p3;
            const nlS = p3 - p1;
            const compound = p4 - p1;
            return (
              <div key={key} className="lb__attr-delta-row">
                <span className="lb__attr-delta-dim">{label}</span>
                <span className="lb__attr-delta-pair">
                  <span className="lb__attr-delta-lbl">multi·kw</span>
                  <DeltaBadge value={mlK} label={`Multi lift (keyword) for ${label}`} />
                </span>
                <span className="lb__attr-delta-pair">
                  <span className="lb__attr-delta-lbl">multi·neu</span>
                  <DeltaBadge value={mlN} label={`Multi lift (neural) for ${label}`} />
                </span>
                <span className="lb__attr-delta-pair">
                  <span className="lb__attr-delta-lbl">neural·single</span>
                  <DeltaBadge value={nlS} label={`Neural lift (single) for ${label}`} />
                </span>
                <span className="lb__attr-delta-pair lb__attr-delta-pair--compound">
                  <span className="lb__attr-delta-lbl">P1→P4</span>
                  <DeltaBadge value={compound} label={`Compound lift for ${label}`} />
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/** Per-question table row. */
function QuestionRow({
  question,
  onOpen,
}: {
  question: LeaderboardQuestion;
  onOpen: (qid: string) => void;
}) {
  // Find the winner(s) for this question
  const maxScore = Math.max(...question.panels.map((p) => p.composite));
  const panelMap = Object.fromEntries(question.panels.map((p) => [p.panelId, p]));

  // Is any panel contested (scores within 0.3 of each other)?
  const scores = question.panels.map((p) => p.composite);
  const spread = Math.max(...scores) - Math.min(...scores);
  const isContested = spread < 0.5 && scores.length >= 2;

  // Is any panel's result thin (gateTripped)?
  const hasCapped = question.panels.some((p) => p.gateTripped);

  return (
    <tr
      className="lb__qrow"
      onClick={() => onOpen(question.id)}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(question.id);
        }
      }}
      aria-label={`Open Arena for: ${question.prompt}`}
      role="button"
    >
      <td className="lb__qrow-prompt" title={question.prompt}>
        <span className="lb__qrow-text">{question.prompt}</span>
        {hasCapped && (
          <span className="lb__qrow-warn" title="One or more panels had the grounding gate tripped (capped score)">
            ⚠
          </span>
        )}
        {isContested && !hasCapped && (
          <span className="lb__qrow-contested" title="Scores are close — contested result">
            ~
          </span>
        )}
      </td>
      {PANEL_IDS.map((pid) => {
        const pr = panelMap[pid];
        if (!pr) {
          return (
            <td key={pid} className="lb__qrow-score lb__qrow-score--missing">
              —
            </td>
          );
        }
        const isWinner = pr.composite >= maxScore - 0.001;
        const tone = scoreTone(pr.composite);
        return (
          <td
            key={pid}
            className={`lb__qrow-score ${isWinner ? 'lb__qrow-score--winner' : ''}`}
          >
            <span className={`lb__qrow-num ${tone}`}>
              {pr.composite.toFixed(1)}
            </span>
            {pr.gateTripped && (
              <span className="lb__qrow-cap" title="Grounding gate tripped — capped">
                🚫
              </span>
            )}
            {isWinner && !pr.gateTripped && (
              <span className="lb__qrow-star" aria-hidden="true">★</span>
            )}
          </td>
        );
      })}
      <td className="lb__qrow-open" aria-hidden="true">›</td>
    </tr>
  );
}

/** Per-question table. */
function QuestionTable({
  questions,
  onOpenQuestion,
}: {
  questions: LeaderboardQuestion[];
  onOpenQuestion: (qid: string) => void;
}) {
  return (
    <section className="arail__card lb__card--table" aria-label="Per-question results">
      <div className="arail__card-head">
        <h3 className="arail__card-title">Per-question breakdown</h3>
        <span className="analysis__card-sub">click a row to open the Arena for that question</span>
      </div>
      <div className="lb__table-wrap">
        <table className="lb__table" aria-label="Per-question scores by panel">
          <thead>
            <tr className="lb__thead">
              <th scope="col" className="lb__th lb__th--question">Question</th>
              {PANEL_IDS.map((pid) => {
                const cfg = PANEL_CONFIGS.find((p) => p.id === pid);
                return (
                  <th
                    key={pid}
                    scope="col"
                    className="lb__th lb__th--panel"
                    style={{ ['--cell-accent' as string]: `var(${PANEL_ACCENT[pid]})` }}
                  >
                    <span className="lb__th-id">{pid}</span>
                    <span className="lb__th-sub">
                      {cfg?.arch === 'multi' ? 'Multi' : 'Single'}·{cfg?.retrieval === 'neural' ? 'N' : 'K'}
                    </span>
                  </th>
                );
              })}
              <th scope="col" className="lb__th lb__th--open" aria-label="Open" />
            </tr>
          </thead>
          <tbody>
            {questions.map((q) => (
              <QuestionRow key={q.id} question={q} onOpen={onOpenQuestion} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="lb__table-hint">
        ★ = winner · ⚠ = grounding gate tripped · ~ = contested (spread &lt; 0.5) · click any row to replay in the Arena
      </p>
    </section>
  );
}

/** Advanced expanders: win-rate, score distribution, flagged/capped audit. */
function AdvancedExpanders({ agg, data }: { agg: AggResult; data: LeaderboardData }) {
  const [openWinRate, setOpenWinRate] = useState(false);
  const [openDist, setOpenDist] = useState(false);
  const [openAudit, setOpenAudit] = useState(false);

  // Collect flagged/capped questions
  const flaggedRows = useMemo(() => {
    const rows: { q: LeaderboardQuestion; pr: LeaderboardPanelResult }[] = [];
    for (const q of data.questions) {
      for (const pr of q.panels) {
        if (pr.gateTripped || pr.flaggedCount > 0) {
          rows.push({ q, pr });
        }
      }
    }
    return rows;
  }, [data]);

  return (
    <section className="lb__advanced" aria-label="Advanced expanders">
      {/* Win-rate per cell */}
      <div className="lb__expander">
        <button
          type="button"
          className="lb__expander-toggle"
          aria-expanded={openWinRate}
          onClick={() => setOpenWinRate((o) => !o)}
        >
          <span className="lb__expander-icon" aria-hidden="true">{openWinRate ? '▾' : '▸'}</span>
          Win-rate per cell
          <span className="lb__expander-sub">% of questions each panel scored highest</span>
        </button>
        {openWinRate && (
          <div className="lb__expander-body">
            <div className="lb__winrate-grid">
              {PANEL_IDS.map((pid) => {
                const cell = agg.cells[pid];
                const pct = Math.round(cell.winRate * 100);
                const tone = pct >= 50 ? 'is-strong' : pct >= 25 ? 'is-mid' : 'is-weak';
                const cfg = PANEL_CONFIGS.find((p) => p.id === pid);
                return (
                  <div
                    key={pid}
                    className="lb__winrate-card"
                    style={{ ['--cell-accent' as string]: `var(${PANEL_ACCENT[pid]})` }}
                  >
                    <div className="lb__winrate-id">{pid}</div>
                    <div className={`lb__winrate-pct ${tone}`}>{pct}%</div>
                    <div className="lb__winrate-sub">
                      {cfg?.arch === 'multi' ? 'Multi' : 'Single'} · {cfg?.retrieval === 'neural' ? 'Neural' : 'Keyword'}
                    </div>
                    <div className="lb__winrate-n">
                      {Math.round(cell.winRate * data.questionCount)}/{data.questionCount} questions
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Score distribution */}
      <div className="lb__expander">
        <button
          type="button"
          className="lb__expander-toggle"
          aria-expanded={openDist}
          onClick={() => setOpenDist((o) => !o)}
        >
          <span className="lb__expander-icon" aria-hidden="true">{openDist ? '▾' : '▸'}</span>
          Score distribution
          <span className="lb__expander-sub">histogram of composite scores 0–10 per panel</span>
        </button>
        {openDist && (
          <div className="lb__expander-body lb__dist-wrap">
            {PANEL_IDS.map((pid) => {
              const cell = agg.cells[pid];
              const cfg = PANEL_CONFIGS.find((p) => p.id === pid);
              return (
                <div
                  key={pid}
                  className="lb__dist-panel"
                  style={{ ['--cell-accent' as string]: `var(${PANEL_ACCENT[pid]})` }}
                >
                  <div className="lb__dist-panel-head">
                    <span className="lb__dist-panel-id">{pid}</span>
                    <span className="lb__dist-panel-label">
                      {cfg?.arch === 'multi' ? 'Multi' : 'Single'}·{cfg?.retrieval === 'neural' ? 'N' : 'K'}
                    </span>
                    <span className={`lb__dist-panel-mean ${scoreTone(cell.mean)}`}>
                      avg {cell.mean.toFixed(2)}
                    </span>
                  </div>
                  <ScoreDistribution scores={cell.scores} />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Flagged / capped audit */}
      <div className="lb__expander">
        <button
          type="button"
          className={`lb__expander-toggle${flaggedRows.length > 0 ? ' lb__expander-toggle--warn' : ''}`}
          aria-expanded={openAudit}
          onClick={() => setOpenAudit((o) => !o)}
        >
          <span className="lb__expander-icon" aria-hidden="true">{openAudit ? '▾' : '▸'}</span>
          Grounding audit
          {flaggedRows.length > 0 ? (
            <span className="lb__expander-badge lb__expander-badge--warn">
              {flaggedRows.length} flagged
            </span>
          ) : (
            <span className="lb__expander-badge lb__expander-badge--ok">all clean</span>
          )}
          <span className="lb__expander-sub">capped or flagged answers only</span>
        </button>
        {openAudit && (
          <div className="lb__expander-body">
            {flaggedRows.length === 0 ? (
              <p className="lb__audit-clean">
                No grounding violations across all {data.questionCount * 4} answers. 100% clean.
              </p>
            ) : (
              <ul className="lb__audit-list">
                {flaggedRows.map(({ q, pr }) => (
                  <li
                    key={`${q.id}-${pr.panelId}`}
                    className={`lb__audit-row${pr.gateTripped ? ' lb__audit-row--capped' : ''}`}
                  >
                    <span className="lb__audit-icon" aria-hidden="true">
                      {pr.gateTripped ? '🚫' : '⚠'}
                    </span>
                    <span className="lb__audit-panel">{pr.panelId}</span>
                    <span className="lb__audit-score">
                      {pr.composite.toFixed(1)}/10
                      {pr.gateTripped && <span className="lb__audit-cap"> (capped)</span>}
                    </span>
                    <span className="lb__audit-q" title={q.prompt}>{q.prompt}</span>
                    {pr.flaggedCount > 0 && (
                      <span className="lb__audit-flagged">
                        {pr.flaggedCount} claim{pr.flaggedCount !== 1 ? 's' : ''} flagged
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="lb__empty" role="status">
      <div className="lb__empty-icon" aria-hidden="true">📊</div>
      <p className="lb__empty-title">No batch results yet</p>
      <p className="lb__empty-sub">
        Run the full question set via the CLI (<code>cli judge &lt;runId&gt;</code>) to populate the Leaderboard.
        The Arena's live judge is indicative — this view shows the authoritative batch scores.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root export
// ---------------------------------------------------------------------------

export function Leaderboard({ data, onOpenQuestion }: Props) {
  const agg = useMemo(() => (data ? aggregate(data) : null), [data]);

  if (!data || !agg) {
    return (
      <div className="lb">
        <EmptyState />
      </div>
    );
  }

  const completedDate = new Date(data.completedAt).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <div className="lb">
      {/* Header */}
      <header className="lb__header">
        <div className="lb__header-left">
          <span className="lb__eyebrow">Leaderboard</span>
          <h2 className="lb__title">
            Answer-Quality Results
            <span className="lb__title-count">{data.questionCount} questions</span>
          </h2>
        </div>
        <div className="lb__header-meta">
          <span className="lb__badge lb__badge--batch">batch · pro · 3 judges</span>
          <span className="lb__header-date">{completedDate}</span>
        </div>
      </header>

      {/* Layer 1: Aggregate 2×2 */}
      <AggregateMatrix agg={agg} />

      {/* Layer 2: Dimension attribution */}
      <DimensionAttribution agg={agg} />

      {/* Layer 3: Per-question table */}
      <QuestionTable questions={data.questions} onOpenQuestion={onOpenQuestion} />

      {/* Layer 4: Advanced expanders */}
      <AdvancedExpanders agg={agg} data={data} />

      {/* Styles — scoped to .lb, injected inline so the component is self-contained */}
      <style>{`
/* ── Leaderboard container ── */
.lb {
  display: flex;
  flex-direction: column;
  gap: var(--s-5);
  padding: var(--s-6);
  max-width: 1100px;
  margin: 0 auto;
  width: 100%;
}

/* ── Header ── */
.lb__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--s-4);
  flex-wrap: wrap;
}
.lb__header-left { display: flex; flex-direction: column; gap: 2px; }
.lb__eyebrow {
  font-size: var(--fs-caption);
  text-transform: uppercase;
  letter-spacing: var(--ls-wide);
  font-weight: 600;
  color: var(--algolia-blue);
}
.lb__title {
  font-family: var(--font-display);
  font-size: var(--fs-h3);
  font-weight: 600;
  color: var(--ink);
  margin: 0;
  display: flex;
  align-items: center;
  gap: var(--s-3);
}
.lb__title-count {
  font-size: var(--fs-body-sm);
  font-weight: 400;
  color: var(--fg3);
  background: var(--bg-inset);
  padding: 2px 10px;
  border-radius: var(--radius-pill);
}
.lb__header-meta { display: flex; flex-direction: column; align-items: flex-end; gap: var(--s-1); }
.lb__header-date { font-size: var(--fs-caption); color: var(--fg3); font-family: var(--font-mono); }

/* ── Badges ── */
.lb__badge {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: var(--ls-wide);
  padding: 3px 10px;
  border-radius: var(--radius-pill);
}
.lb__badge--batch {
  background: var(--algolia-blue-100);
  color: var(--algolia-blue);
}

/* ── Headline card ── */
.lb__card--headline { gap: var(--s-4); }

/* ── 2×2 Matrix grid ── */
.lb__matrix {
  display: grid;
  grid-template-columns: 80px 1fr 1fr;
  grid-template-rows: auto auto auto auto;
  gap: var(--s-2);
  align-items: stretch;
}
.lb__matrix-corner {
  background: transparent;
}
.lb__matrix-colhead {
  text-align: center;
  font-size: var(--fs-body-sm);
  font-weight: 600;
  color: var(--fg2);
  padding: var(--s-2) 0;
  border-bottom: 2px solid var(--border-subtle);
}
.lb__matrix-rowhead {
  display: flex;
  align-items: center;
  font-size: var(--fs-body-sm);
  font-weight: 600;
  color: var(--fg2);
  padding-right: var(--s-2);
}
.lb__matrix-rowhead--delta {
  font-size: var(--fs-caption);
  color: var(--fg3);
  text-transform: uppercase;
  letter-spacing: var(--ls-wide);
}
.lb__cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: var(--s-4);
  border-radius: var(--radius-md);
  border: 2px solid var(--border-subtle);
  background: var(--bg-page);
  transition: border-color var(--dur-fast) var(--ease-out);
  position: relative;
}
.lb__cell::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 3px;
  border-radius: var(--radius-md) var(--radius-md) 0 0;
  background: var(--cell-accent, var(--border-subtle));
}
.lb__cell--winner {
  border-color: var(--cell-accent, var(--algolia-blue));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--cell-accent, var(--algolia-blue)) 18%, transparent);
}
.lb__cell-id {
  font-size: var(--fs-caption);
  font-weight: 700;
  color: var(--fg3);
  text-transform: uppercase;
  letter-spacing: var(--ls-wide);
}
.lb__cell-score {
  font-family: var(--font-display);
  font-size: var(--fs-h4);
  font-weight: 600;
  line-height: 1;
  display: flex;
  align-items: center;
  gap: 4px;
}
.lb__cell-score.is-strong { color: var(--color-success); }
.lb__cell-score.is-mid    { color: var(--color-warning); }
.lb__cell-score.is-weak   { color: var(--color-danger);  }
.lb__cell-sub { font-size: 10px; color: var(--fg3); }
.lb__star { color: var(--color-warning); font-size: 14px; }
.lb__delta-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--s-2);
}

/* ── Delta badges ── */
.lb__delta {
  font-family: var(--font-display);
  font-size: var(--fs-body);
  font-weight: 700;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
}
.lb__delta.is-strong { color: var(--color-success); background: rgba(31,157,85,0.10); }
.lb__delta.is-mid    { color: var(--color-warning); background: rgba(217,119,6,0.10); }
.lb__delta.is-weak   { color: var(--color-danger);  background: rgba(225,29,72,0.10); }

/* ── Lift strips ── */
.lb__lifts {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2) var(--s-5);
  padding: var(--s-3) 0 0;
  border-top: 1px solid var(--border-subtle);
}
.lb__lift-item { display: flex; align-items: center; gap: var(--s-2); }
.lb__lift-item--compound { font-weight: 600; }
.lb__lift-label { font-size: var(--fs-caption); color: var(--fg3); text-transform: uppercase; letter-spacing: var(--ls-wide); }

/* ── Verdict ── */
.lb__verdict {
  font-size: var(--fs-body-sm);
  color: var(--fg2);
  line-height: var(--lh-base);
  padding: var(--s-3) var(--s-4);
  background: var(--bg-canvas);
  border-left: 3px solid var(--algolia-blue);
  border-radius: var(--radius-sm);
  margin: 0;
}

/* ── Grounding headline ── */
.lb__grounding-head {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  font-size: var(--fs-body-sm);
  color: var(--fg2);
}
.lb__grounding-icon { font-size: 14px; }
.lb__grounding-text { font-weight: 500; }

/* ── Dimension attribution ── */
.lb__attr-intro {
  font-size: var(--fs-body-sm);
  color: var(--fg3);
  margin: 0 0 var(--s-4);
  line-height: var(--lh-base);
}
.lb__attr-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--s-3);
  margin-bottom: var(--s-4);
}
@media (max-width: 900px) {
  .lb__attr-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 560px) {
  .lb__attr-grid { grid-template-columns: 1fr; }
}
.lb__attr-panel {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
  padding: var(--s-3);
  background: var(--bg-canvas);
  border: 1px solid var(--border-subtle);
  border-top: 3px solid var(--cell-accent, var(--border-subtle));
  border-radius: var(--radius-md);
}
.lb__attr-head { display: flex; align-items: center; gap: var(--s-2); margin-bottom: var(--s-1); }
.lb__attr-id {
  font-size: var(--fs-caption);
  font-weight: 700;
  color: var(--fg3);
  text-transform: uppercase;
  letter-spacing: var(--ls-wide);
  background: var(--bg-inset);
  padding: 1px 6px;
  border-radius: var(--radius-xs);
}
.lb__attr-label { font-size: var(--fs-caption); color: var(--fg3); }
.lb__attr-mean { font-size: var(--fs-caption); color: var(--fg3); margin-top: var(--s-1); }
.lb__attr-mean-val { font-weight: 700; font-family: var(--font-mono); }
.lb__attr-mean-val.is-strong { color: var(--color-success); }
.lb__attr-mean-val.is-mid    { color: var(--color-warning); }
.lb__attr-mean-val.is-weak   { color: var(--color-danger);  }

.lb__attr-deltas { border-top: 1px solid var(--border-subtle); padding-top: var(--s-3); }
.lb__attr-deltas-title { font-size: var(--fs-body-sm); font-weight: 600; color: var(--fg2); margin: 0 0 var(--s-3); }
.lb__attr-delta-rows { display: flex; flex-direction: column; gap: var(--s-2); }
.lb__attr-delta-row {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  flex-wrap: wrap;
  font-size: var(--fs-caption);
}
.lb__attr-delta-dim { font-weight: 600; color: var(--fg1); min-width: 100px; }
.lb__attr-delta-pair { display: flex; align-items: center; gap: var(--s-1); }
.lb__attr-delta-pair--compound { font-weight: 600; }
.lb__attr-delta-lbl { color: var(--fg3); text-transform: uppercase; letter-spacing: 0.03em; font-size: 10px; min-width: 68px; }

/* ── Per-question table ── */
.lb__card--table { padding: 0; overflow: hidden; }
.lb__card--table > .arail__card-head { padding: var(--s-3) var(--s-4); border-bottom: 1px solid var(--border-subtle); }
.lb__table-wrap { overflow-x: auto; }
.lb__table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--fs-body-sm);
}
.lb__thead { background: var(--bg-canvas); }
.lb__th {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: var(--ls-wide);
  color: var(--fg3);
  padding: var(--s-2) var(--s-3);
  border-bottom: 1px solid var(--border-subtle);
  white-space: nowrap;
  text-align: left;
}
.lb__th--panel {
  text-align: center;
  border-left: 2px solid var(--cell-accent, transparent);
  min-width: 72px;
}
.lb__th-id {
  display: block;
  font-size: var(--fs-caption);
  font-weight: 700;
  color: var(--fg2);
}
.lb__th-sub { display: block; font-size: 9px; color: var(--fg3); }
.lb__th--open { width: 24px; }
.lb__th--question { min-width: 200px; }

.lb__qrow {
  border-bottom: 1px solid var(--border-subtle);
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out);
}
.lb__qrow:hover { background: var(--algolia-blue-050); }
.lb__qrow:focus-visible { outline: 2px solid var(--algolia-blue); outline-offset: -2px; }
.lb__qrow:last-child { border-bottom: 0; }

.lb__qrow-prompt {
  padding: var(--s-3) var(--s-3);
  max-width: 320px;
}
.lb__qrow-text {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  color: var(--fg2);
  font-weight: 500;
  line-height: 1.4;
}
.lb__qrow-warn {
  display: inline-block;
  font-size: 12px;
  margin-left: var(--s-2);
  vertical-align: middle;
}
.lb__qrow-contested {
  display: inline-block;
  font-family: var(--font-mono);
  font-size: var(--fs-caption);
  color: var(--fg3);
  margin-left: var(--s-1);
  vertical-align: middle;
}
.lb__qrow-score {
  padding: var(--s-3) var(--s-2);
  text-align: center;
  white-space: nowrap;
}
.lb__qrow-score--missing { color: var(--fg4); }
.lb__qrow-score--winner { background: rgba(0, 61, 255, 0.04); }
.lb__qrow-num {
  font-family: var(--font-display);
  font-size: var(--fs-body);
  font-weight: 600;
}
.lb__qrow-num.is-strong { color: var(--color-success); }
.lb__qrow-num.is-mid    { color: var(--color-warning); }
.lb__qrow-num.is-weak   { color: var(--color-danger);  }
.lb__qrow-cap { font-size: 12px; margin-left: 4px; }
.lb__qrow-star { font-size: 10px; color: var(--color-warning); margin-left: 3px; }
.lb__qrow-open {
  padding: var(--s-2) var(--s-3);
  color: var(--fg3);
  text-align: center;
  font-size: 16px;
}

.lb__table-hint {
  font-size: var(--fs-caption);
  color: var(--fg3);
  padding: var(--s-3) var(--s-4);
  border-top: 1px solid var(--border-subtle);
  margin: 0;
}

/* ── Advanced expanders ── */
.lb__advanced { display: flex; flex-direction: column; gap: var(--s-3); }
.lb__expander {
  background: var(--bg-page);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  overflow: hidden;
}
.lb__expander-toggle {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  width: 100%;
  padding: var(--s-3) var(--s-4);
  border: 0;
  background: transparent;
  font-family: var(--font-body);
  font-size: var(--fs-body-sm);
  font-weight: 600;
  color: var(--fg2);
  cursor: pointer;
  text-align: left;
  transition: background var(--dur-fast) var(--ease-out);
}
.lb__expander-toggle:hover { background: var(--bg-canvas); }
.lb__expander-toggle:focus-visible { outline: 2px solid var(--algolia-blue); outline-offset: -2px; }
.lb__expander-toggle--warn { color: var(--color-danger); }
.lb__expander-icon { color: var(--fg3); font-size: 11px; flex: 0 0 auto; }
.lb__expander-sub { font-weight: 400; color: var(--fg3); font-size: var(--fs-caption); margin-left: auto; }
.lb__expander-badge {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: var(--ls-wide);
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  margin-left: var(--s-2);
}
.lb__expander-badge--ok { background: rgba(31,157,85,0.12); color: var(--color-success); }
.lb__expander-badge--warn { background: rgba(225,29,72,0.12); color: var(--color-danger); }
.lb__expander-body { padding: var(--s-4); border-top: 1px solid var(--border-subtle); }

/* Win-rate grid */
.lb__winrate-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--s-3);
}
@media (max-width: 640px) { .lb__winrate-grid { grid-template-columns: repeat(2, 1fr); } }
.lb__winrate-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: var(--s-4);
  background: var(--bg-canvas);
  border: 1px solid var(--border-subtle);
  border-top: 3px solid var(--cell-accent, var(--border-subtle));
  border-radius: var(--radius-md);
  text-align: center;
}
.lb__winrate-id { font-size: var(--fs-caption); font-weight: 700; color: var(--fg3); text-transform: uppercase; letter-spacing: var(--ls-wide); }
.lb__winrate-pct { font-family: var(--font-display); font-size: var(--fs-h3); font-weight: 600; }
.lb__winrate-pct.is-strong { color: var(--color-success); }
.lb__winrate-pct.is-mid    { color: var(--color-warning); }
.lb__winrate-pct.is-weak   { color: var(--color-danger);  }
.lb__winrate-sub { font-size: var(--fs-caption); color: var(--fg3); }
.lb__winrate-n { font-size: 10px; color: var(--fg4); }

/* Score distribution histogram */
.lb__dist-wrap { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--s-4); }
@media (max-width: 640px) { .lb__dist-wrap { grid-template-columns: repeat(2, 1fr); } }
.lb__dist-panel { display: flex; flex-direction: column; gap: var(--s-2); }
.lb__dist-panel-head { display: flex; align-items: center; gap: var(--s-2); flex-wrap: wrap; }
.lb__dist-panel-id { font-size: var(--fs-caption); font-weight: 700; color: var(--fg3); text-transform: uppercase; letter-spacing: var(--ls-wide); }
.lb__dist-panel-label { font-size: var(--fs-caption); color: var(--fg3); }
.lb__dist-panel-mean { font-family: var(--font-mono); font-size: var(--fs-caption); font-weight: 700; margin-left: auto; }
.lb__dist-panel-mean.is-strong { color: var(--color-success); }
.lb__dist-panel-mean.is-mid    { color: var(--color-warning); }
.lb__dist-panel-mean.is-weak   { color: var(--color-danger);  }
.lb__dist {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 60px;
  padding: var(--s-2) 0 0;
  border-bottom: 1px solid var(--border-subtle);
}
.lb__dist-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  height: 100%;
  gap: 2px;
}
.lb__dist-bar {
  width: 100%;
  background: var(--algolia-blue-300);
  border-radius: 2px 2px 0 0;
  min-height: 2px;
  transition: height var(--dur-base) var(--ease-out);
}
.lb__dist-lbl { font-size: 8px; color: var(--fg4); font-family: var(--font-mono); }

/* Grounding audit */
.lb__audit-clean { font-size: var(--fs-body-sm); color: var(--color-success); font-weight: 500; margin: 0; }
.lb__audit-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--s-2); }
.lb__audit-row {
  display: flex;
  align-items: baseline;
  gap: var(--s-2);
  flex-wrap: wrap;
  padding: var(--s-2) var(--s-3);
  background: var(--bg-canvas);
  border-radius: var(--radius-sm);
  border-left: 3px solid var(--color-warning);
  font-size: var(--fs-body-sm);
}
.lb__audit-row--capped { border-left-color: var(--color-danger); background: rgba(225,29,72,0.04); }
.lb__audit-icon { font-size: 13px; }
.lb__audit-panel { font-weight: 700; color: var(--fg2); }
.lb__audit-score { font-family: var(--font-mono); font-size: var(--fs-caption); color: var(--fg3); }
.lb__audit-cap { color: var(--color-danger); }
.lb__audit-q { flex: 1 1 200px; color: var(--fg2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lb__audit-flagged { font-size: var(--fs-caption); color: var(--color-warning); background: rgba(217,119,6,0.10); padding: 1px 8px; border-radius: var(--radius-pill); white-space: nowrap; }

/* ── Empty state ── */
.lb__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: var(--s-3);
  padding: var(--s-16) var(--s-8);
  max-width: 480px;
  margin: 0 auto;
}
.lb__empty-icon { font-size: 40px; }
.lb__empty-title { font-size: var(--fs-h4); font-weight: 600; color: var(--fg2); margin: 0; }
.lb__empty-sub { font-size: var(--fs-body-sm); color: var(--fg3); margin: 0; line-height: var(--lh-loose); }

/* ── analysis__card-sub (borrowed from AnalysisRail) ── */
.analysis__card-sub { font-size: var(--fs-caption); color: var(--fg3); }
`}</style>
    </div>
  );
}
