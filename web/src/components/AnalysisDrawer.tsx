/**
 * AnalysisDrawer — right slide-out panel for the Answer-Quality Lab (ADR-001 D2).
 *
 * Replaces the old bottom-40% AnalysisPanel: the verdict headline now lives in
 * the lane score pills (always visible), and the full detail — Skeptic/Referee/
 * Advocate judges, the ②-vs-③ config diff, and the synthesis narrative — opens
 * on demand in this drawer (header verdict chip + per-lane ⚖ trigger).
 *
 * Driven by `state` + a typed `data` prop (live scores from useLiveJudge). Only
 * the `done` state renders the score grid; idle/streaming/judging/error render a
 * status line. No placeholder/mock scores — idle shows a call-to-action.
 *
 * Accessibility: role=dialog + aria-modal; Esc closes; focus moves in on open and
 * is restored on close; Tab is trapped within the drawer. Dependency-free.
 */
import { useEffect, useRef } from 'react';
import { scoreTone, type LaneScore } from '../lib/score';

export type JudgeRole = 'skeptic' | 'referee' | 'advocate';

export interface JudgeVerdict {
  role: JudgeRole;
  /** 0–10 score this judge assigned to ③ Our System. */
  score: number;
  /** One-line rationale. */
  note: string;
}

export interface ConfigDiffRow {
  /** What dimension changed (e.g. "Index", "Prompt", "Retrieval"). */
  dimension: string;
  /** Value on the ② Ask AI side. */
  askAi: string;
  /** Value on the ③ Our System side. */
  ourSystem: string;
}

export interface AnalysisData {
  judges: JudgeVerdict[];
  /** Synthesized headline score for ③ Our System, 0–10. */
  synthesizedScore: number;
  configDiff: ConfigDiffRow[];
  /** Narrative synthesis: why ③ wins/loses and what to do next. */
  synthesis: string;
  /**
   * Per-lane verdict headline keyed by panelId (e.g. mirror, tuned). Drives the
   * always-visible lane score pills. Both judged lanes appear when scored.
   */
  laneScores: Record<string, LaneScore>;
}

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

/** Lifecycle of live judging, surfaced by useLiveJudge. */
export type AnalysisState = 'idle' | 'streaming' | 'judging' | 'done' | 'error';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Live judging lifecycle. */
  state?: AnalysisState;
  /** Real judge data; rendered when state is 'done'. */
  data?: AnalysisData;
  /** Error message when state is 'error'. */
  error?: string;
}

/** Non-`done` states render a status / call-to-action line in place of the grid. */
function StatusView({ state, error }: { state: AnalysisState; error?: string }) {
  const text =
    state === 'idle'
      ? 'Judges run here. Ask a question — the 3-judge panel (Skeptic / Referee / Advocate + grounding gate) scores ② and ③ live (~30–90s).'
      : state === 'streaming'
        ? 'Answers streaming — the judges run once both ② and ③ finish.'
        : state === 'judging'
          ? '⏳ Judges scoring the answers… this takes ~30–90s (3 judges × rounds on Gemini).'
          : `Judge error: ${error ?? 'unknown'}. Is the local lab backend running on :8787?`;
  return (
    <div
      className={`analysis__status is-${state}`}
      {...(state === 'idle' ? {} : { role: 'status', 'aria-live': 'polite' as const })}
    >
      {text}
    </div>
  );
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export function AnalysisDrawer({ open, onClose, state = 'idle', data, error }: Props) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Esc to close, focus-in on open, focus restore on close, Tab trap.
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const root = drawerRef.current;
      if (!root) return;
      const nodes = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      );
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const activeEl = document.activeElement;
      if (e.shiftKey && activeEl === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && activeEl === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  // done → real judge data; every other state → a status / call-to-action line.
  const view: AnalysisData | null = state === 'done' && data ? data : null;

  return (
    <div className="drawer-layer">
      <div className="drawer__backdrop" onClick={onClose} aria-hidden="true" />
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Analysis and synthesis"
        ref={drawerRef}
      >
        <header className="drawer__head">
          <div className="drawer__title-row">
            <h2 className="drawer__title">Analysis &amp; Synthesis</h2>
            {state === 'done' && (
              <span className="analysis__live" title="Scored live by the 3-judge panel">
                Live judged
              </span>
            )}
          </div>
          <button ref={closeRef} className="drawer__close" onClick={onClose} aria-label="Close analysis">
            ✕
          </button>
        </header>

        <div className="drawer__body">
          {!view && <StatusView state={state} error={error} />}

          {view && (
            <div className="analysis__grid">
              {/* (a) Judges */}
              <div className="analysis__card" aria-label="Judges">
                <div className="analysis__card-head">
                  <h3 className="analysis__card-title">Judges</h3>
                  <div className={`analysis__score ${scoreTone(view.synthesizedScore)}`}>
                    <span className="analysis__score-num">{view.synthesizedScore.toFixed(1)}</span>
                    <span className="analysis__score-unit">/10</span>
                  </div>
                </div>
                <ul className="judges">
                  {view.judges.map((j) => (
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
              </div>

              {/* (b) Config diff */}
              <div className="analysis__card" aria-label="Config diff per case">
                <div className="analysis__card-head">
                  <h3 className="analysis__card-title">Config diff</h3>
                  <span className="analysis__card-sub">② Ask AI vs ③ Our System</span>
                </div>
                <table className="cfgdiff">
                  <thead>
                    <tr>
                      <th scope="col">Dimension</th>
                      <th scope="col">② Ask AI</th>
                      <th scope="col">③ Our System</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.configDiff.map((row) => (
                      <tr key={row.dimension}>
                        <th scope="row">{row.dimension}</th>
                        <td>{row.askAi}</td>
                        <td className="cfgdiff__ours">{row.ourSystem}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* (c) Synthesis */}
              <div className="analysis__card" aria-label="Synthesis">
                <div className="analysis__card-head">
                  <h3 className="analysis__card-title">Synthesis</h3>
                  <span className="analysis__card-sub">Why ③ wins / loses + next</span>
                </div>
                <p className="analysis__synthesis">{view.synthesis}</p>
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
