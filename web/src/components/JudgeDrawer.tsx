/**
 * JudgeDrawer — score-triggered judge drawer, slides in from the right.
 *
 * Design source: ux-design-v1.md v1.2–v1.3 (lean default, 8-block progressive
 * disclosure, judge selector). Reuses the AnalysisRail.tsx pinnable/foldable/
 * resizable PATTERN: same resize-handle, pin, collapse controls, same CSS class
 * vocabulary (arail__*) extended with jdrawer__* for drawer-specific pieces.
 *
 * Lean default (blocks always visible):
 *   ① Composite + one-line verdict + grounding-status badge
 *   ②③ Dimension bars — Grounding / Confidence / Breadth & depth
 *        (mean-of-3 + inline consensus marks)
 *   ⑥ Comparison — multi-lift · neural-lift · compound vs P1
 *
 * Conditional:
 *   ④ Flagged-claim cards — appear ONLY when a violation exists (grounding badge
 *      expands); each card shows claim text + "k/3 judges" (show, don't tell).
 *
 * Expanders (collapsed by default):
 *   ⑦ How it answered — multi = Maverick entities + specialist roster + synthesis;
 *      single = its one search query + hits; + config diff (index / mode / key settings).
 *   ⑧ Per-judge detail — batch only (3 diverse judges). Live tier hides this section.
 *
 * Judge selector:
 *   Avatar-chip row  [◉ Synthesis 8.3] [○ 🔍 Skeptic 7.9] [○ 🛠 Referee 8.4] [○ 🎓 Advocate 8.1]
 *   each chip shows its own score. Click → same template reloads to that judge.
 *   ‹ back to Synthesis breadcrumb when inside a per-judge view.
 *   Live tier (1 judge) = Synthesis chip only.
 *
 * Mode badge: live = indicative / batch = authoritative.
 *
 * Props:
 *   open / pinned / width / onToggleOpen / onTogglePin / onResizeStart — same
 *   contract as AnalysisRail so the host (App.tsx) can wire both identically.
 *   panelVerdict  — the server payload for the selected panel (PanelJudgeResult).
 *   panelData     — the panel's answer data (for the "how it answered" block).
 *   panelConfig   — static panel identity (from columns.ts PanelConfig).
 *   deltas        — cross-panel deltas from the JudgeResult (optional).
 *   mode          — 'live' | 'batch'; controls indicative label + per-judge section.
 *   judgeMs       — total judge wall-clock ms (displayed in the header).
 */

import { useState, useId, useRef, type ReactNode } from 'react';
import { scoreTone, laneTone } from '../lib/score';
import { formatMs } from '../lib/time';
import { Markdown } from './Markdown';
import type {
  PanelJudgeResult,
  PanelDataResult,
  PerJudgeResult,
  FlaggedClaim,
  CrossPanelDeltas,
  VerdictDims,
} from '../types/chat';
import type { PanelConfig } from '../config/columns';

// ---------------------------------------------------------------------------
// Re-export (convenience for hosts)
// ---------------------------------------------------------------------------

export type JudgeDrawerMode = 'live' | 'batch';

// The selected view inside the drawer: 'synthesis' or one of the judge roles.
type SelectedView = 'synthesis' | 'skeptic' | 'referee' | 'advocate';

// ---------------------------------------------------------------------------
// Static display maps
// ---------------------------------------------------------------------------

const JUDGE_ICON: Record<string, string> = {
  skeptic: '🔍',
  referee: '🛠',
  advocate: '🎓',
};
const JUDGE_LABEL: Record<string, string> = {
  skeptic: 'Skeptic',
  referee: 'Referee',
  advocate: 'Advocate',
};
const JUDGE_LENS: Record<string, string> = {
  skeptic: 'Adversarial — assumes claims wrong until sourced. Strict on grounding.',
  referee: 'Practitioner — would this actually help the asker? Confidence + usefulness.',
  advocate: 'Expert — complete, accurate, deep? Breadth and depth through a specialist lens.',
};
const JUDGE_ACCENT_VAR: Record<string, string> = {
  skeptic: '--color-warning',
  referee: '--algolia-blue',
  advocate: '--color-success',
};

const DIM_LABEL: Record<keyof VerdictDims, string> = {
  grounding: 'Grounding',
  confidence: 'Confidence',
  breadthDepth: 'Breadth & depth',
};
const DIM_SUB: Record<keyof VerdictDims, string | undefined> = {
  grounding: 'hard floor + scored',
  confidence: undefined,
  breadthDepth: undefined,
};
const DIM_ORDER: Array<keyof VerdictDims> = ['grounding', 'confidence', 'breadthDepth'];

// ---------------------------------------------------------------------------
// Sub-components (all self-contained, no React.memo — small tree)
// ---------------------------------------------------------------------------

/** Horizontal score bar — shared with AnalysisRail visual grammar. */
function Bar({
  label,
  score,
  sub,
  consensusMin,
  consensusMax,
}: {
  label: string;
  score: number;
  sub?: string;
  /** Min score across per-judge results — drives the spread indicator. */
  consensusMin?: number;
  /** Max score across per-judge results. */
  consensusMax?: number;
}) {
  const pct = Math.max(0, Math.min(100, (score / 10) * 100));
  const tone = scoreTone(score);
  const spread = consensusMin !== undefined && consensusMax !== undefined
    ? (consensusMax - consensusMin).toFixed(1)
    : undefined;
  const spreadTight = spread !== undefined && Number(spread) <= 1.0;

  return (
    <div className="dimbar">
      <div className="dimbar__head">
        <span className="dimbar__label">{label}</span>
        <span className={`dimbar__val ${tone}`}>{score.toFixed(1)}</span>
      </div>
      <div
        className="dimbar__track"
        role="img"
        aria-label={`${label}: ${score.toFixed(1)} out of 10`}
      >
        <span className={`dimbar__fill ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="dimbar__foot">
        {sub && <span className="dimbar__sub">{sub}</span>}
        {spread !== undefined && (
          <span
            className={`jdrawer__consensus ${spreadTight ? 'is-tight' : 'is-spread'}`}
            title={`Judge spread: ${consensusMin?.toFixed(1)}–${consensusMax?.toFixed(1)}`}
          >
            {spreadTight ? '≈ consensus' : `spread ${spread}`}
          </span>
        )}
      </div>
    </div>
  );
}

/** Delta pill — +N.N or −N.N with directional colour. */
function DeltaPill({ delta, label }: { delta: number | undefined; label: string }) {
  if (delta === undefined) return null;
  const positive = delta >= 0;
  const sign = positive ? '+' : '−';
  return (
    <div className="jdrawer__delta-row">
      <span className="jdrawer__delta-label">{label}</span>
      <span className={`jdrawer__delta-val ${positive ? 'is-ahead' : 'is-behind'}`}>
        {sign}{Math.abs(delta).toFixed(1)}
      </span>
    </div>
  );
}

/** Flagged-claim card (conditional — only rendered on violation). */
function ClaimCard({ claim }: { claim: FlaggedClaim }) {
  const judgeCount = Math.round(claim.confidence * 3);
  const safeCount = Math.min(3, Math.max(1, judgeCount || 2));
  return (
    <div className="jdrawer__claim">
      <p className="jdrawer__claim-text">"{claim.claim}"</p>
      <p className="jdrawer__claim-reason">
        {claim.reason}
        <span className="jdrawer__claim-votes"> · {safeCount}/3 judges</span>
      </p>
    </div>
  );
}

/** Collapsible expander block — used for ⑦ and ⑧. */
function Expander({
  id,
  label,
  defaultOpen = false,
  children,
}: {
  id: string;
  label: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = `${id}-panel`;
  return (
    <div className="jdrawer__expander">
      <button
        type="button"
        className="jdrawer__expander-head"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="jdrawer__expander-chevron" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
        <span>{label}</span>
      </button>
      {open && (
        <div id={panelId} className="jdrawer__expander-body">
          {children}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Block ①: Composite headline
// ---------------------------------------------------------------------------

function CompositeBlock({
  verdict,
  config,
  mode,
  judgeMs,
  onExpandClaims,
  claimsExpanded,
}: {
  verdict: PanelJudgeResult;
  config: PanelConfig;
  mode: JudgeDrawerMode;
  judgeMs?: number | null;
  onExpandClaims: () => void;
  claimsExpanded: boolean;
}) {
  const laneScore = {
    score: verdict.composite,
    gateTripped: verdict.gateTripped,
    borderline: verdict.borderline,
  };
  const tone = laneTone(laneScore);
  const isWinner = verdict.composite >= 7.5 && !verdict.gateTripped;

  const judgeCount = verdict.perJudge.length;
  const modelLabel = mode === 'live' ? 'flash' : 'pro';
  const _tierLabel = mode === 'live' ? 'live · indicative' : 'batch · authoritative'; void _tierLabel;

  return (
    <section className="arail__card jdrawer__composite" aria-label="Composite verdict">
      <div className="arail__card-head">
        <div className="jdrawer__id-row">
          <span className="jdrawer__panel-id" style={{ ['--lane-accent' as string]: `var(${config.accentVar})` }}>
            {config.id}
          </span>
          <span className="jdrawer__arch-tag">
            {config.arch === 'multi' ? 'Multi-agent' : 'Single agent'}
          </span>
          <span className="jdrawer__retrieval-tag">{config.retrieval}</span>
        </div>
        <div className={`analysis__score ${tone}`}>
          <span className="analysis__score-num">
            {isWinner && <span className="jdrawer__winner-star" aria-label="Winner">★</span>}
            {verdict.composite.toFixed(1)}
          </span>
          <span className="analysis__score-unit">/10</span>
        </div>
      </div>

      {verdict.rationale && (
        <p className="jdrawer__verdict-line">"{verdict.rationale}"</p>
      )}

      {/* Mode + judge metadata */}
      <p className="jdrawer__tier-meta">
        <span className={`jdrawer__mode-badge ${mode === 'live' ? 'is-live' : 'is-batch'}`}>
          {mode === 'live' ? 'live · indicative' : 'batch · authoritative'}
        </span>
        {' '}· {modelLabel} · {judgeCount} {judgeCount === 1 ? 'judge' : 'judges'}
        {judgeMs != null && <> · ⏱ {formatMs(judgeMs)}</>}
      </p>
      {mode === 'live' && (
        <p className="jdrawer__live-note">
          Live judging uses thinner sources and a single round (still all 3 judges) — indicative only. Run batch for the authoritative score.
        </p>
      )}

      {/* Grounding status badge */}
      {verdict.gateTripped ? (
        <button
          type="button"
          className="jdrawer__ground-badge is-tripped"
          onClick={onExpandClaims}
          aria-expanded={claimsExpanded}
          aria-label="Grounding floor tripped — click to see flagged claims"
        >
          🚫 grounding floor tripped — {verdict.flaggedClaims.length} flagged
          {claimsExpanded ? ' ▴' : ' ▾'}
        </button>
      ) : verdict.borderline ? (
        <button
          type="button"
          className="jdrawer__ground-badge is-borderline"
          onClick={onExpandClaims}
          aria-expanded={claimsExpanded}
          aria-label="Grounding borderline — click for details"
        >
          ⚠ grounding borderline — {verdict.flaggedClaims.length} flagged (not capped)
          {claimsExpanded ? ' ▴' : ' ▾'}
        </button>
      ) : (
        <span className="jdrawer__ground-badge is-clean">✅ grounding floor passed</span>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Block ④: Flagged-claim cards (conditional)
// ---------------------------------------------------------------------------

function FlaggedClaimsBlock({ claims }: { claims: FlaggedClaim[] }) {
  if (claims.length === 0) return null;
  return (
    <section className="arail__card arail__card--flagged" aria-label="Flagged claims">
      <div className="arail__card-head">
        <h3 className="arail__card-title">⚠ Flagged as unsupported</h3>
        <span className="analysis__card-sub">Skeptic, vs the sources shown</span>
      </div>
      <div className="jdrawer__claims">
        {claims.map((c, i) => (
          <ClaimCard key={i} claim={c} />
        ))}
      </div>
      <p className="jdrawer__claims-note">
        Judged against the sources this panel retrieved. A flagged claim may be valid in the full docs — batch judge (full sources) is authoritative.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Blocks ②③: Dimension bars
// ---------------------------------------------------------------------------

function DimsBlock({
  dims,
  perJudge,
}: {
  dims: VerdictDims;
  perJudge: PerJudgeResult[];
}) {
  // Compute per-dim consensus spread across judges
  function dimSpread(_key: keyof VerdictDims): { min: number; max: number } | undefined {
    if (perJudge.length < 2) return undefined;
    // Per-judge dims are not directly in the type — use perJudge composite as a
    // proxy signal for spread (the server only sends per-judge composite in the
    // current contract; dims-per-judge come in the per-judge detail expander).
    return undefined; // spread shown via per-judge expander instead
  }

  return (
    <section className="arail__card" aria-label="Dimension breakdown">
      <div className="arail__card-head">
        <h3 className="arail__card-title">Dimensions</h3>
        <span className="analysis__card-sub">mean of {perJudge.length || 1} · /10</span>
      </div>
      <div className="dimbars">
        {DIM_ORDER.map((key) => {
          const spread = dimSpread(key);
          return (
            <Bar
              key={key}
              label={DIM_LABEL[key]}
              score={dims[key]}
              sub={DIM_SUB[key]}
              consensusMin={spread?.min}
              consensusMax={spread?.max}
            />
          );
        })}
      </div>
      {perJudge.length >= 2 && (
        <p className="jdrawer__dims-spread-note">
          Judge spread visible in ▸ Per-judge detail below.
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Block ⑥: Comparison (cross-panel deltas)
// ---------------------------------------------------------------------------

function ComparisonBlock({
  config,
  deltas,
}: {
  config: PanelConfig;
  deltas?: CrossPanelDeltas;
}) {
  if (!deltas) return null;

  // Compute which deltas are relevant for this panel
  const { arch, retrieval } = config;

  // multi-lift: this panel vs its single sibling (same retrieval row)
  const multiLift: number | undefined =
    arch === 'multi'
      ? retrieval === 'keyword'
        ? deltas.multiLift?.keyword
        : deltas.multiLift?.neural
      : undefined;

  // neural-lift: this panel vs its keyword sibling (same arch column)
  const neuralLift: number | undefined =
    retrieval === 'neural'
      ? arch === 'single'
        ? deltas.neuralLift?.single
        : deltas.neuralLift?.multi
      : undefined;

  // compound: always P4−P1; shown on every panel for context
  const compound = deltas.compound;

  const hasAny = multiLift !== undefined || neuralLift !== undefined || compound !== undefined;
  if (!hasAny) return null;

  // Human-readable sibling labels
  const multiSiblingLabel =
    arch === 'multi'
      ? retrieval === 'keyword'
        ? 'vs P1 (single·keyword)'
        : 'vs P3 (single·neural)'
      : undefined;

  const neuralSiblingLabel =
    retrieval === 'neural'
      ? arch === 'single'
        ? 'vs P1 (single·keyword)'
        : 'vs P2 (multi·keyword)'
      : undefined;

  return (
    <section className="arail__card" aria-label="Cross-panel comparison">
      <div className="arail__card-head">
        <h3 className="arail__card-title">Comparison</h3>
        <span className="analysis__card-sub">the 2×2 deltas</span>
      </div>
      <div className="jdrawer__deltas">
        {multiLift !== undefined && (
          <DeltaPill delta={multiLift} label={`multi-lift ${multiSiblingLabel ?? ''}`} />
        )}
        {neuralLift !== undefined && (
          <DeltaPill delta={neuralLift} label={`neural-lift ${neuralSiblingLabel ?? ''}`} />
        )}
        {compound !== undefined && (
          <DeltaPill delta={compound} label="compound vs P1 (baseline)" />
        )}
      </div>
      {arch === 'single' && retrieval === 'keyword' && (
        <p className="jdrawer__deltas-note">
          P1 is the baseline. Positive deltas in P2/P3/P4 show what multi-agent or neural adds.
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Block ⑦: How it answered (expander)
// ---------------------------------------------------------------------------

function HowItAnsweredBlock({
  panelData,
  config,
}: {
  panelData?: PanelDataResult;
  config: PanelConfig;
}) {
  const isMulti = config.arch === 'multi';
  const trace = panelData?.trace;

  return (
    <div className="jdrawer__how-body">
      {isMulti && trace ? (
        <>
          {trace.entities.length > 0 && (
            <div className="jdrawer__how-row">
              <span className="jdrawer__how-label">Entities extracted</span>
              <span className="jdrawer__how-val">{trace.entities.join(', ')}</span>
            </div>
          )}
          {trace.specialists.length > 0 && (
            <div className="jdrawer__how-section">
              <span className="jdrawer__how-label">Specialists</span>
              <ul className="jdrawer__specialists">
                {trace.specialists.map((sp) => (
                  <li key={sp.name} className={`jdrawer__specialist ${sp.fired ? 'is-fired' : 'is-idle'}`}>
                    <span className="jdrawer__sp-name">{sp.name}</span>
                    <span className="jdrawer__sp-status">
                      {sp.fired ? `✓ ${sp.hits} hits` : '·'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {trace.synthesisMs !== undefined && (
            <div className="jdrawer__how-row">
              <span className="jdrawer__how-label">Synthesis</span>
              <span className="jdrawer__how-val">⏱ {formatMs(trace.synthesisMs)}</span>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="jdrawer__how-row">
            <span className="jdrawer__how-label">Architecture</span>
            <span className="jdrawer__how-val">Single agent — one search, one grounded answer.</span>
          </div>
          {panelData?.sources && panelData.sources.length > 0 && (
            <div className="jdrawer__how-row">
              <span className="jdrawer__how-label">Hits</span>
              <span className="jdrawer__how-val">{panelData.sources.length} sources retrieved</span>
            </div>
          )}
        </>
      )}

      {/* Config diff */}
      <div className="jdrawer__how-section">
        <span className="jdrawer__how-label">Config</span>
        <div className="jdrawer__config-rows">
          <div className="jdrawer__config-row">
            <span className="jdrawer__config-key">Index</span>
            <span className="jdrawer__config-val mono">{config.indexName}</span>
          </div>
          <div className="jdrawer__config-row">
            <span className="jdrawer__config-key">Retrieval</span>
            <span className="jdrawer__config-val">{config.retrieval}</span>
          </div>
          <div className="jdrawer__config-row">
            <span className="jdrawer__config-key">Architecture</span>
            <span className="jdrawer__config-val">{config.arch === 'multi' ? 'Maverick + source-scoped specialists' : 'Single Agent Studio agent'}</span>
          </div>
        </div>
        <p className="jdrawer__pipeline-note">{config.pipeline}</p>
      </div>

      {/* What this cell proves */}
      <div className="jdrawer__proves">
        <span className="jdrawer__how-label">What this proves</span>
        <p className="jdrawer__proves-text">{config.proves}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Block ⑧: Per-judge detail (batch only)
// ---------------------------------------------------------------------------

function PerJudgeBlock({ perJudge }: { perJudge: PerJudgeResult[] }) {
  if (perJudge.length === 0) return <p className="jdrawer__empty">No per-judge data available.</p>;
  return (
    <ul className="jdrawer__per-judge">
      {perJudge.map((j) => {
        const accentVar = JUDGE_ACCENT_VAR[j.role] ?? '--algolia-blue';
        return (
          <li
            key={j.role}
            className="jdrawer__judge-entry"
            style={{ ['--judge-accent' as string]: `var(${accentVar})` }}
          >
            <div className="jdrawer__judge-head">
              <span className="jdrawer__judge-icon" aria-hidden="true">{JUDGE_ICON[j.role]}</span>
              <span className="jdrawer__judge-role">{JUDGE_LABEL[j.role]}</span>
              <span className={`jdrawer__judge-score ${scoreTone(j.score)}`}>
                {j.score.toFixed(1)}
              </span>
            </div>
            <p className="jdrawer__judge-lens">{JUDGE_LENS[j.role]}</p>
            {j.note && <p className="jdrawer__judge-note">{j.note}</p>}
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Judge selector — avatar-chip row
// ---------------------------------------------------------------------------

function JudgeSelector({
  perJudge,
  selected,
  onSelect,
  mode,
}: {
  perJudge: PerJudgeResult[];
  selected: SelectedView;
  onSelect: (v: SelectedView) => void;
  mode: JudgeDrawerMode;
}) {
  // Composite score for synthesis chip: mean of perJudge scores
  const synthScore =
    perJudge.length > 0
      ? perJudge.reduce((s, j) => s + j.score, 0) / perJudge.length
      : undefined;

  return (
    <div className="jdrawer__judge-selector" role="group" aria-label="Judge view selector">
      <span className="jdrawer__judge-selector-label">Judges</span>
      <div className="jdrawer__chips">
        {/* Synthesis chip — always shown */}
        <button
          type="button"
          className={`jdrawer__chip ${selected === 'synthesis' ? 'is-selected' : ''}`}
          aria-pressed={selected === 'synthesis'}
          onClick={() => onSelect('synthesis')}
          title="Synthesis — composite mean of all judges"
        >
          <span className="jdrawer__chip-icon" aria-hidden="true">⚖</span>
          <span className="jdrawer__chip-label">Synthesis</span>
          {synthScore !== undefined && (
            <span className={`jdrawer__chip-score ${scoreTone(synthScore)}`}>
              {synthScore.toFixed(1)}
            </span>
          )}
        </button>

        {/* Per-judge chips — the 3 temperaments, each with its own score (live + batch) */}
        {perJudge.map((j) => {
            const role = j.role as SelectedView;
            const isSelected = selected === role;
            return (
              <button
                key={j.role}
                type="button"
                className={`jdrawer__chip ${isSelected ? 'is-selected' : ''}`}
                style={{ ['--judge-accent' as string]: `var(${JUDGE_ACCENT_VAR[j.role] ?? '--algolia-blue'})` }}
                aria-pressed={isSelected}
                onClick={() => onSelect(role)}
                title={JUDGE_LENS[j.role]}
              >
                <span className="jdrawer__chip-icon" aria-hidden="true">{JUDGE_ICON[j.role]}</span>
                <span className="jdrawer__chip-label">{JUDGE_LABEL[j.role]}</span>
                <span className={`jdrawer__chip-score ${scoreTone(j.score)}`}>
                  {j.score.toFixed(1)}
                </span>
              </button>
            );
          })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-judge view — same template, one judge's lens
// ---------------------------------------------------------------------------

function SingleJudgeView({
  judge,
  verdict,
  onBack,
}: {
  judge: PerJudgeResult;
  verdict: PanelJudgeResult;
  onBack: () => void;
}) {
  const accentVar = JUDGE_ACCENT_VAR[judge.role] ?? '--algolia-blue';
  return (
    <div className="jdrawer__single-judge">
      <button
        type="button"
        className="jdrawer__back-btn"
        onClick={onBack}
        aria-label="Back to Synthesis"
      >
        ‹ Synthesis
      </button>

      <section className="arail__card" aria-label={`${JUDGE_LABEL[judge.role]} verdict`}>
        <div className="arail__card-head">
          <div className="jdrawer__judge-head">
            <span className="jdrawer__judge-icon-lg" aria-hidden="true">{JUDGE_ICON[judge.role]}</span>
            <h3 className="arail__card-title">{JUDGE_LABEL[judge.role]}</h3>
          </div>
          <span
            className={`jdrawer__judge-score-lg ${scoreTone(judge.score)}`}
            style={{ ['--judge-accent' as string]: `var(${accentVar})` }}
          >
            {judge.score.toFixed(1)}/10
          </span>
        </div>
        <p className="jdrawer__judge-lens">{JUDGE_LENS[judge.role]}</p>
        {judge.note && (
          <div className="jdrawer__judge-note-body">
            <Markdown text={judge.note} />
          </div>
        )}
      </section>

      {/* Grounding status for this judge's perspective */}
      {verdict.gateTripped && (
        <section className="arail__card arail__card--flagged" aria-label="Flagged claims">
          <div className="arail__card-head">
            <h3 className="arail__card-title">⚠ Flagged claims</h3>
          </div>
          <div className="jdrawer__claims">
            {verdict.flaggedClaims.map((c, i) => (
              <ClaimCard key={i} claim={c} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Collapsed strip (reuse AnalysisRail's Strip grammar)
// ---------------------------------------------------------------------------

/** Vertical drag for the collapsed marker — park it anywhere up/down the right
 *  edge; position is remembered. Distinguishes a drag from a click (so dragging
 *  doesn't open the drawer). Returns the pinned top (px) or null = CSS-centered. */
interface MarkerDrag {
  top: number | null;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  /** True if the last gesture was a drag (caller suppresses the open-click). */
  consumeMoved: () => boolean;
}
const MARKER_TOP_KEY = 'aql_judge_marker_top';
function useMarkerDrag(): MarkerDrag {
  const clampTop = (v: number) => Math.min(window.innerHeight - 96, Math.max(8, v));
  const [top, setTop] = useState<number | null>(() => {
    try { const v = localStorage.getItem(MARKER_TOP_KEY); return v != null ? clampTop(Number(v)) : null; }
    catch { return null; }
  });
  const st = useRef<{ y: number; top: number } | null>(null);
  const topRef = useRef<number | null>(top);
  const movedRef = useRef(false);

  return {
    top,
    onPointerDown: (e) => {
      const aside = (e.currentTarget as HTMLElement).closest('.arail--collapsed') as HTMLElement | null;
      const rectTop = aside ? aside.getBoundingClientRect().top : (top ?? 0);
      st.current = { y: e.clientY, top: rectTop };
      movedRef.current = false;
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    onPointerMove: (e) => {
      if (!st.current) return;
      const dy = e.clientY - st.current.y;
      if (Math.abs(dy) > 4) movedRef.current = true;
      const next = clampTop(st.current.top + dy);
      topRef.current = next;
      setTop(next);
    },
    onPointerUp: () => {
      if (movedRef.current && topRef.current != null) {
        try { localStorage.setItem(MARKER_TOP_KEY, String(Math.round(topRef.current))); } catch { /* ignore */ }
      }
      st.current = null;
    },
    consumeMoved: () => { const m = movedRef.current; movedRef.current = false; return m; },
  };
}

function Strip({
  verdict,
  onToggleOpen,
  drag,
}: {
  verdict?: PanelJudgeResult;
  onToggleOpen: () => void;
  drag: MarkerDrag;
}) {
  const laneScore = verdict
    ? { score: verdict.composite, gateTripped: verdict.gateTripped, borderline: verdict.borderline }
    : undefined;
  const tone = laneScore ? laneTone(laneScore) : undefined;

  return (
    <button
      type="button"
      className="arail__strip"
      onPointerDown={drag.onPointerDown}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      onClick={() => { if (!drag.consumeMoved()) onToggleOpen(); }}
      aria-label={laneScore ? `Open the AI judge panel — score ${laneScore.score.toFixed(1)} out of 10. Drag up or down to reposition.` : 'Open the AI judge panel. Drag up or down to reposition.'}
      title="Click to open · drag up/down to reposition"
    >
      <span className="arail__strip-grip" aria-hidden="true">⋮⋮</span>
      <span className="arail__strip-icon" aria-hidden="true">⚖</span>
      <span className="arail__strip-label">JUDGE</span>
      {laneScore ? (
        <span className={`arail__strip-score ${tone}`}>
          <span className="arail__strip-score-num">{laneScore.score.toFixed(1)}</span>
          <span className="arail__strip-score-unit">/10</span>
        </span>
      ) : (
        <span className="arail__strip-score arail__strip-score--empty">–</span>
      )}
      <span className="arail__strip-open" aria-hidden="true">‹</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main drawer body — Synthesis view
// ---------------------------------------------------------------------------

function SynthesisView({
  verdict,
  panelData,
  config,
  deltas,
  mode,
  judgeMs,
}: {
  verdict: PanelJudgeResult;
  panelData?: PanelDataResult;
  config: PanelConfig;
  deltas?: CrossPanelDeltas;
  mode: JudgeDrawerMode;
  judgeMs?: number | null;
}) {
  // Flagged claims toggle — grounding badge expands into cards on click
  const [claimsOpen, setClaimsOpen] = useState(false);
  const hasViolation = verdict.gateTripped || (verdict.borderline && verdict.flaggedClaims.length > 0);

  // Auto-open claims on gate trip
  const effectiveClaimsOpen = claimsOpen || (verdict.gateTripped && verdict.flaggedClaims.length > 0);

  const expId = useId();

  return (
    <div className="arail__grid">
      {/* Block ① — composite + verdict + grounding badge */}
      <CompositeBlock
        verdict={verdict}
        config={config}
        mode={mode}
        judgeMs={judgeMs}
        onExpandClaims={() => setClaimsOpen((o) => !o)}
        claimsExpanded={effectiveClaimsOpen}
      />

      {/* Block ④ — flagged-claim cards (conditional, violation only) */}
      {hasViolation && effectiveClaimsOpen && (
        <FlaggedClaimsBlock claims={verdict.flaggedClaims} />
      )}

      {/* Blocks ②③ — dimension bars */}
      <DimsBlock dims={verdict.dims} perJudge={verdict.perJudge} />

      {/* Block ⑥ — comparison / deltas */}
      <ComparisonBlock config={config} deltas={deltas} />

      {/* Block ⑦ — how it answered (expander) */}
      <section className="arail__card arail__card--expander" aria-label="How it answered">
        <Expander id={`${expId}-how`} label="How it answered (trace · config)">
          <HowItAnsweredBlock panelData={panelData} config={config} />
        </Expander>
      </section>

      {/* Block ⑧ — per-judge detail (the 3 temperaments + their scores) */}
      {verdict.perJudge.length > 0 && (
        <section className="arail__card arail__card--expander" aria-label="Per-judge detail">
          <Expander
            id={`${expId}-judges`}
            label={`The ${verdict.perJudge.length} judges — each personality's score`}
            defaultOpen
          >
            <PerJudgeBlock perJudge={verdict.perJudge} />
          </Expander>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public props
// ---------------------------------------------------------------------------

export interface JudgeDrawerProps {
  /** Whether the drawer is expanded. */
  open: boolean;
  /** Whether the drawer is pinned open (collapse button disabled). */
  pinned: boolean;
  /** Expanded width in px. */
  width: number;
  onToggleOpen: () => void;
  onTogglePin: () => void;
  /** Pointer-down on the left-edge resize handle. */
  onResizeStart: (e: React.PointerEvent) => void;
  /** The full judge verdict for the selected panel (from /api/judge). */
  panelVerdict?: PanelJudgeResult;
  /** The panel's answer + trace data (for block ⑦). */
  panelData?: PanelDataResult;
  /** Static panel config (identity, index, pipeline, proves). */
  panelConfig?: PanelConfig;
  /** Cross-panel deltas from JudgeResult (for block ⑥). */
  deltas?: CrossPanelDeltas;
  /** 'live' = 1 judge, indicative; 'batch' = 3 judges, authoritative. */
  mode?: JudgeDrawerMode;
  /** Wall-clock ms for the judge run. */
  judgeMs?: number | null;
}

// ---------------------------------------------------------------------------
// JudgeDrawer — the exported component
// ---------------------------------------------------------------------------

export function JudgeDrawer({
  open,
  pinned,
  width,
  onToggleOpen,
  onTogglePin,
  onResizeStart,
  panelVerdict,
  panelData,
  panelConfig,
  deltas,
  mode = 'live',
  judgeMs,
}: JudgeDrawerProps) {
  const [selectedView, setSelectedView] = useState<SelectedView>('synthesis');
  const markerDrag = useMarkerDrag();

  // Reset to synthesis when the panel changes (panelId used as a change signal in future useEffect)
  void panelConfig?.id;

  // Collapsed strip — draggable up/down the right edge (position remembered).
  if (!open) {
    return (
      <aside
        className="arail arail--collapsed jdrawer jdrawer--collapsed"
        aria-label="Judge drawer (collapsed)"
        style={markerDrag.top != null ? { top: `${markerDrag.top}px`, transform: 'none' } : undefined}
      >
        <Strip verdict={panelVerdict} onToggleOpen={onToggleOpen} drag={markerDrag} />
      </aside>
    );
  }

  // No verdict yet — idle state
  const hasVerdict = panelVerdict && panelConfig;

  return (
    <aside
      className="arail arail--open jdrawer"
      style={{ width: `${width}px` }}
      aria-label={`Judge analysis${panelConfig ? ` — ${panelConfig.label}` : ''}`}
    >
      {/* Left-edge resize handle */}
      <div
        className="arail__resize"
        onPointerDown={onResizeStart}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize judge drawer"
        title="Drag to resize"
      />

      {/* Header */}
      <header className="arail__head">
        <div className="arail__title-row">
          <h2 className="arail__title">Judge</h2>
          {panelConfig && (
            <span
              className="jdrawer__panel-chip"
              style={{ ['--lane-accent' as string]: `var(${panelConfig.accentVar})` }}
              aria-label={`Panel ${panelConfig.id}`}
            >
              {panelConfig.id} · {panelConfig.arch === 'multi' ? 'Multi' : 'Single'} · {panelConfig.retrieval}
            </span>
          )}
        </div>
        <div className="arail__actions">
          <button
            type="button"
            className={`arail__btn${pinned ? ' is-on' : ''}`}
            onClick={onTogglePin}
            aria-pressed={pinned}
            aria-label={pinned ? 'Unpin judge drawer' : 'Pin judge drawer open'}
            title={pinned ? 'Unpin (allow collapsing)' : 'Pin open'}
          >
            📌
          </button>
          <button
            type="button"
            className="arail__btn"
            onClick={onToggleOpen}
            disabled={pinned}
            aria-label="Collapse judge drawer"
            title={pinned ? 'Unpin first to collapse' : 'Collapse'}
          >
            ›
          </button>
        </div>
      </header>

      {/* Judge selector */}
      {hasVerdict && panelVerdict.perJudge.length > 0 && (
        <div className="jdrawer__selector-bar">
          <JudgeSelector
            perJudge={panelVerdict.perJudge}
            selected={selectedView}
            onSelect={(v) => setSelectedView(v)}
            mode={mode}
          />
        </div>
      )}

      {/* Body */}
      <div className="arail__body">
        {!hasVerdict ? (
          <div className="analysis__status is-idle">
            Click a panel's score to open its judge breakdown.
          </div>
        ) : selectedView === 'synthesis' ? (
          <SynthesisView
            verdict={panelVerdict}
            panelData={panelData}
            config={panelConfig}
            deltas={deltas}
            mode={mode}
            judgeMs={judgeMs}
          />
        ) : (
          (() => {
            const judge = panelVerdict.perJudge.find((j) => j.role === selectedView);
            if (!judge) return (
              <div className="analysis__status is-idle">
                Judge "{selectedView}" not found in this verdict.
              </div>
            );
            return (
              <SingleJudgeView
                judge={judge}
                verdict={panelVerdict}
                onBack={() => setSelectedView('synthesis')}
              />
            );
          })()
        )}
      </div>
    </aside>
  );
}
