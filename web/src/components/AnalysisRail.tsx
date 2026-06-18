/**
 * AnalysisRail — PERMANENT, collapsible right rail for the Answer-Quality Lab
 * (supersedes the on-demand AnalysisDrawer). It is a flex sibling of the lane
 * area, so expanding it PUSHES the lanes rather than overlaying them. It can be
 * collapsed to a thin strip (reclaiming width for more lanes), PINNED open
 * (persisted), and RESIZED via a left-edge drag handle.
 *
 * Built around the 3-dimension judge contract (Arijit, 2026-06-18): the body
 * shows the composite score, per-dimension bars (Grounding / Confidence /
 * Breadth & depth), the ②-vs-③ margin, and the per-judge breakdown — all color
 * coded. Idle/streaming/judging/error render an honest status line, NEVER mock
 * scores (the lesson from the old persistent panel was "no fake numbers").
 */
import { scoreTone, laneTone, type LaneScore } from '../lib/score';
import { useElapsed } from '../hooks/useElapsed';
import { formatMs } from '../lib/time';

export type JudgeRole = 'skeptic' | 'referee' | 'advocate';

export interface JudgeVerdict {
  role: JudgeRole;
  /** 0–10 composite this judge assigned to ③ Our System. */
  score: number;
  note: string;
}

/** One scored rubric dimension on the 1–10 scale. */
export interface AnalysisDimension {
  id: string;
  label: string;
  score: number;
}

/** A claim the Skeptic flagged as unsupported by the sources. */
export interface AnalysisViolation {
  claim: string;
  reason: string;
  confidence: number;
}

export interface ConfigDiffRow {
  dimension: string;
  askAi: string;
  ourSystem: string;
  /** The concrete, verifiable specifics of what ③ actually changed. */
  detail?: string[];
}

export interface AnalysisData {
  judges: JudgeVerdict[];
  /** Synthesized composite for ③ Our System, 0–10 (post grounding gate). */
  synthesizedScore: number;
  gateTripped: boolean;
  borderline: boolean;
  /** 3-dimension breakdown for ③, 1–10. */
  dimensions: AnalysisDimension[];
  /** Claims the Skeptic flagged as unsupported (the WHY behind a gate trip). */
  violations: AnalysisViolation[];
  /** ② Ask AI synthesized score, 0–10 (the floor), when judged. */
  floorScore?: number;
  floorGateTripped?: boolean;
  configDiff: ConfigDiffRow[];
  synthesis: string;
  /** Per-lane verdict headline keyed by panelId; drives the lane score pills. */
  laneScores: Record<string, LaneScore>;
}

export type AnalysisState = 'idle' | 'streaming' | 'judging' | 'done' | 'error';

const JUDGE_LABEL: Record<JudgeRole, string> = {
  skeptic: 'Skeptic',
  referee: 'Referee',
  advocate: 'Advocate',
};
const JUDGE_ACCENT: Record<JudgeRole, string> = {
  skeptic: '--color-warning',
  referee: '--algolia-blue',
  advocate: '--color-success',
};

interface Props {
  /** Expanded (true) vs collapsed strip (false). */
  open: boolean;
  /** Pinned open (persisted); the strip's collapse is disabled while pinned. */
  pinned: boolean;
  /** Expanded width in px (user-resizable). */
  width: number;
  onToggleOpen: () => void;
  onTogglePin: () => void;
  /** Pointer-down on the left-edge resize handle. */
  onResizeStart: (e: React.PointerEvent) => void;
  state?: AnalysisState;
  data?: AnalysisData;
  error?: string;
  /** Streamed per-panel progress while judging (so it's never a dead spinner). */
  progress?: {
    total: number;
    done: { panelId: string; score: number; gateTripped: boolean }[];
  };
  /** Judge timing: live timer while judging + final duration when done. */
  judgeStartedAt?: number | null;
  judgeMs?: number | null;
}

const PANEL_NAME: Record<string, string> = { website: '①', mirror: '②', tuned: '③' };

/** Live judging progress: an elapsed timer + count + each panel's score as it lands. */
function JudgingView({
  progress,
  startedAt,
}: {
  progress?: Props['progress'];
  startedAt?: number | null;
}) {
  const done = progress?.done ?? [];
  const total = progress?.total ?? 0;
  const elapsed = useElapsed(startedAt ?? null, true);
  return (
    <div className="arail__judging" role="status" aria-live="polite">
      <div className="arail__judging-head">
        <span className="arail__spinner" aria-hidden="true" />
        <span>
          Judging on the fast panel… {total ? `${done.length}/${total}` : ''}
          {startedAt ? <span className="arail__judging-time"> · {formatMs(elapsed)}</span> : null}
        </span>
      </div>
      <ul className="arail__judging-list">
        {done.map((d) => (
          <li key={d.panelId}>
            <span className="arail__judging-name">{PANEL_NAME[d.panelId] ?? d.panelId}</span>
            <span className={`arail__judging-score ${d.gateTripped ? 'is-weak' : scoreTone(d.score)}`}>
              {d.score.toFixed(1)} ✓
            </span>
          </li>
        ))}
        {done.length < total && <li className="arail__judging-pending">scoring…</li>}
      </ul>
    </div>
  );
}

function statusText(state: AnalysisState, error?: string): string {
  switch (state) {
    case 'streaming':
      return 'Answers streaming — the judges run once both ② and ③ finish.';
    case 'judging':
      return '⏳ Judges scoring the answers… ~30–90s (3 judges × rounds on Gemini).';
    case 'error':
      return `Judge error: ${error ?? 'unknown'}. Is the lab backend reachable?`;
    default:
      return 'Judges run here. Ask a question — the 3-judge panel (Skeptic / Referee / Advocate) scores ② and ③ live across Grounding · Confidence · Breadth & depth.';
  }
}

/** Collapsed strip: vertical label + ③ composite chip, click to expand. */
function Strip({
  data,
  state,
  onToggleOpen,
}: {
  data?: AnalysisData;
  state: AnalysisState;
  onToggleOpen: () => void;
}) {
  const score = state === 'done' && data ? data.synthesizedScore : undefined;
  const tone =
    state === 'done' && data
      ? laneTone({ score: data.synthesizedScore, gateTripped: data.gateTripped, borderline: data.borderline })
      : undefined;
  return (
    <button
      type="button"
      className="arail__strip"
      onClick={onToggleOpen}
      aria-label="Expand analysis rail"
      title="Expand analysis"
    >
      <span className="arail__strip-icon" aria-hidden="true">⚖</span>
      {score !== undefined ? (
        <span className={`arail__strip-score ${tone}`}>{score.toFixed(1)}</span>
      ) : null}
      <span className="arail__strip-label">Analysis</span>
      <span className="arail__strip-chevron" aria-hidden="true">‹</span>
    </button>
  );
}

/** A single 0/1–10 horizontal bar. `max` defaults to 10. */
function Bar({ label, score, max = 10, sub }: { label: string; score: number; max?: number; sub?: string }) {
  const pct = Math.max(0, Math.min(100, (score / max) * 100));
  const tone = scoreTone(score);
  return (
    <div className="dimbar">
      <div className="dimbar__head">
        <span className="dimbar__label">{label}</span>
        <span className={`dimbar__val ${tone}`}>{score.toFixed(1)}</span>
      </div>
      <div className="dimbar__track" role="img" aria-label={`${label}: ${score.toFixed(1)} out of ${max}`}>
        <span className={`dimbar__fill ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      {sub ? <span className="dimbar__sub">{sub}</span> : null}
    </div>
  );
}

function Analysis({ data, judgeMs }: { data: AnalysisData; judgeMs?: number | null }) {
  const delta =
    data.floorScore !== undefined ? data.synthesizedScore - data.floorScore : undefined;
  return (
    <div className="arail__grid">
      {/* Composite headline */}
      <section className="arail__card" aria-label="Composite verdict">
        <div className="arail__card-head">
          <h3 className="arail__card-title">③ Our System</h3>
          <div className={`analysis__score ${laneTone({ score: data.synthesizedScore, gateTripped: data.gateTripped, borderline: data.borderline })}`}>
            <span className="analysis__score-num">{data.synthesizedScore.toFixed(1)}</span>
            <span className="analysis__score-unit">/10</span>
          </div>
        </div>
        {judgeMs != null && (
          <p className="arail__timing">⏱ judged in {formatMs(judgeMs)}</p>
        )}
        {data.gateTripped && (
          <p className="arail__gate is-tripped">⚠ Grounding gate tripped — capped for an unsupported claim.</p>
        )}
        {!data.gateTripped && data.borderline && (
          <p className="arail__gate is-borderline">Grounding borderline — flagged, not capped.</p>
        )}
      </section>

      {/* WHY the gate tripped / borderline — the actual flagged claims */}
      {data.violations.length > 0 && (
        <section className="arail__card arail__card--flagged" aria-label="Flagged claims">
          <div className="arail__card-head">
            <h3 className="arail__card-title">⚠ Flagged as unsupported</h3>
            <span className="analysis__card-sub">Skeptic, vs the sources shown</span>
          </div>
          <ul className="violations">
            {data.violations.map((v, i) => (
              <li key={i} className="violation">
                <p className="violation__claim">“{v.claim}”</p>
                <p className="violation__reason">
                  {v.reason}
                  <span className="violation__conf"> · {Math.round(v.confidence * 100)}% conf</span>
                </p>
              </li>
            ))}
          </ul>
          <p className="violation__note">
            Live judging scores against the source snippets the panels passed — a claim can be
            flagged here yet be fine in the full docs. The batch judge (full sources) is authoritative.
          </p>
        </section>
      )}

      {/* Per-dimension bars */}
      <section className="arail__card" aria-label="Dimension breakdown">
        <div className="arail__card-head">
          <h3 className="arail__card-title">Dimensions</h3>
          <span className="analysis__card-sub">avg across judges · /10</span>
        </div>
        <div className="dimbars">
          {data.dimensions.map((d) => (
            <Bar
              key={d.id}
              label={d.label}
              score={d.score}
              sub={d.id === 'grounding' ? 'hard floor + scored' : undefined}
            />
          ))}
          {data.dimensions.length === 0 && (
            <p className="arail__empty">No dimension breakdown for this verdict.</p>
          )}
        </div>
      </section>

      {/* ②-vs-③ margin */}
      {data.floorScore !== undefined && (
        <section className="arail__card" aria-label="Margin vs Ask AI floor">
          <div className="arail__card-head">
            <h3 className="arail__card-title">Margin vs ② Ask AI</h3>
            {delta !== undefined && (
              <span className={`arail__delta ${delta >= 0 ? 'is-ahead' : 'is-behind'}`}>
                {delta >= 0 ? '+' : '−'}{Math.abs(delta).toFixed(1)}
              </span>
            )}
          </div>
          <Bar label="② Ask AI (floor)" score={data.floorScore} />
          <Bar label="③ Our System" score={data.synthesizedScore} />
        </section>
      )}

      {/* Per-judge breakdown */}
      <section className="arail__card" aria-label="Judges">
        <div className="arail__card-head">
          <h3 className="arail__card-title">Judges</h3>
          <span className="analysis__card-sub">composite /10</span>
        </div>
        <ul className="judges">
          {data.judges.map((j) => (
            <li
              key={j.role}
              className="judge"
              style={{ ['--judge-accent' as string]: `var(${JUDGE_ACCENT[j.role]})` }}
            >
              <div className="judge__row">
                <span className="judge__role">{JUDGE_LABEL[j.role]}</span>
                <span className={`judge__score ${scoreTone(j.score)}`}>{j.score.toFixed(1)}</span>
              </div>
              <p className="judge__note">{j.note}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Config diff — the ACTUAL tuning + hardening, not vanity labels */}
      <section className="arail__card" aria-label="Config diff">
        <div className="arail__card-head">
          <h3 className="arail__card-title">What we changed (② → ③)</h3>
        </div>
        <div className="cfg">
          {data.configDiff.map((row) => (
            <div className="cfg__row" key={row.dimension}>
              <div className="cfg__dim">{row.dimension}</div>
              <div className="cfg__vals">
                <span className="cfg__askai">② {row.askAi}</span>
                <span className="cfg__ours">③ {row.ourSystem}</span>
              </div>
              {row.detail && row.detail.length > 0 && (
                <ul className="cfg__detail">
                  {row.detail.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
        <p className="cfg__src">
          Source of truth: <code>instructions_case3_reformulation_fix_v2.md</code> +{' '}
          <code>optimize_index.mjs</code> — these are the exact live settings.
        </p>
      </section>

      {/* Synthesis */}
      <section className="arail__card" aria-label="Synthesis">
        <div className="arail__card-head">
          <h3 className="arail__card-title">Synthesis</h3>
        </div>
        <p className="analysis__synthesis">{data.synthesis}</p>
      </section>
    </div>
  );
}

export function AnalysisRail({
  open,
  pinned,
  width,
  onToggleOpen,
  onTogglePin,
  onResizeStart,
  state = 'idle',
  data,
  error,
  progress,
  judgeStartedAt,
  judgeMs,
}: Props) {
  if (!open) {
    return (
      <aside className="arail arail--collapsed" aria-label="Analysis rail (collapsed)">
        <Strip data={data} state={state} onToggleOpen={onToggleOpen} />
      </aside>
    );
  }

  const view = state === 'done' && data ? data : null;
  return (
    <aside
      className="arail arail--open"
      style={{ width: `${width}px` }}
      aria-label="Analysis and synthesis"
    >
      <div
        className="arail__resize"
        onPointerDown={onResizeStart}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize analysis rail"
        title="Drag to resize"
      />
      <header className="arail__head">
        <div className="arail__title-row">
          <h2 className="arail__title">Analysis &amp; Synthesis</h2>
          {state === 'done' && (
            <span className="analysis__live" title="Scored live by the 3-judge panel">Live</span>
          )}
        </div>
        <div className="arail__actions">
          <button
            type="button"
            className={`arail__btn${pinned ? ' is-on' : ''}`}
            onClick={onTogglePin}
            aria-pressed={pinned}
            aria-label={pinned ? 'Unpin analysis rail' : 'Pin analysis rail open'}
            title={pinned ? 'Unpin (allow collapsing)' : 'Pin open'}
          >
            📌
          </button>
          <button
            type="button"
            className="arail__btn"
            onClick={onToggleOpen}
            disabled={pinned}
            aria-label="Collapse analysis rail"
            title={pinned ? 'Unpin first to collapse' : 'Collapse'}
          >
            ›
          </button>
        </div>
      </header>

      <div className="arail__body">
        {view ? (
          <Analysis data={view} judgeMs={judgeMs} />
        ) : state === 'judging' ? (
          <JudgingView progress={progress} startedAt={judgeStartedAt} />
        ) : (
          <div
            className={`analysis__status is-${state}`}
            {...(state === 'idle' ? {} : { role: 'status', 'aria-live': 'polite' as const })}
          >
            {statusText(state, error)}
          </div>
        )}
      </div>
    </aside>
  );
}
