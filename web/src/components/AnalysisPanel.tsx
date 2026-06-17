/**
 * AnalysisPanel — bottom 40% of the Answer-Quality Lab.
 *
 * Three areas:
 *   (a) Judges    — Skeptic / Referee / Advocate verdicts + a synthesized score.
 *   (b) Config    — the config diff per case (what changed between ② and ③).
 *   (c) Synthesis — narrative "why ③ wins/loses + what to do next".
 *
 * Driven by `state` + a typed `data` prop (live scores from useLiveJudge). Only
 * the `done` state renders the score grid; idle/streaming/judging/error render a
 * status line. No placeholder/mock scores — idle shows a call-to-action.
 */

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
  /** Live judging lifecycle. Defaults to idle (shows the labelled mock preview). */
  state?: AnalysisState;
  /** Real judge data; rendered when state is 'done'. */
  data?: AnalysisData;
  /** Error message when state is 'error'. */
  error?: string;
}

function scoreTone(score: number): string {
  if (score >= 7.5) return 'is-strong';
  if (score >= 5) return 'is-mid';
  return 'is-weak';
}

/** Non-`done` states render a status / call-to-action line in place of the grid. */
function StatusView({ state, error }: { state: AnalysisState; error?: string }) {
  const text =
    state === 'idle'
      ? 'Judges run here. Ask a question above — the 3-judge panel (Skeptic / Referee / Advocate + grounding gate) scores ② and ③ live (~30–90s).'
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

export function AnalysisPanel({ state = 'idle', data, error }: Props) {
  // done → real judge data; every other state → a status / call-to-action line.
  // (No fake scores on idle — that read as broken; show a prompt instead.)
  const view: AnalysisData | null = state === 'done' && data ? data : null;

  return (
    <section className="analysis" aria-label="Analysis and synthesis">
      <header className="analysis__head">
        <h2 className="analysis__title">Analysis &amp; Synthesis</h2>
        {state === 'done' && (
          <span className="analysis__live" title="Scored live by the 3-judge panel">
            Live judged
          </span>
        )}
      </header>

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
              <li key={j.role} className="judge" style={{ ['--judge-accent' as string]: `var(${JUDGE_ACCENT[j.role]})` }}>
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
    </section>
  );
}
