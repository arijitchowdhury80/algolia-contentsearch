/**
 * AnalysisPanel — bottom 40% of the Answer-Quality Lab.
 *
 * Three areas:
 *   (a) Judges    — Skeptic / Referee / Advocate verdicts + a synthesized score.
 *   (b) Config    — the config diff per case (what changed between ② and ③).
 *   (c) Synthesis — narrative "why ③ wins/loses + what to do next".
 *
 * Driven entirely by a typed `data` prop. Until the real judge workstream lands,
 * it defaults to clearly-labelled MOCK data (see MOCK_ANALYSIS). Swap the prop
 * for live scores when the judges ship — no layout change needed.
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
  /** True while real scores are not yet wired — drives the MOCK banner. */
  isMock: boolean;
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

/** Placeholder verdicts until the real judge workstream lands. */
export const MOCK_ANALYSIS: AnalysisData = {
  isMock: true,
  synthesizedScore: 7.6,
  judges: [
    { role: 'skeptic', score: 6.5, note: 'Grounded, but one claim lacked a direct citation in-thread.' },
    { role: 'referee', score: 7.8, note: 'Answer is on-topic and complete relative to ② Ask AI.' },
    { role: 'advocate', score: 8.4, note: 'Tighter synthesis and stronger source coverage than the floor.' },
  ],
  configDiff: [
    { dimension: 'Index', askAi: 'mirror (faithful)', ourSystem: 'tuned (optimized)' },
    { dimension: 'Prompt', askAi: 'Ask-AI default', ourSystem: 'Hardened grounded prompt' },
    { dimension: 'Retrieval', askAi: 'Default ranking', ourSystem: 'Tuned ranking + synonyms' },
  ],
  synthesis:
    '③ Our System edges out the ② Ask AI floor on source density and answer completeness, with a slightly tighter grounded refusal posture. Next: confirm the lift holds across the bait-query set and wire the real judge scores to replace this placeholder.',
};

interface Props {
  /** Defaults to clearly-labelled mock data; pass real scores when judges ship. */
  data?: AnalysisData;
}

function scoreTone(score: number): string {
  if (score >= 7.5) return 'is-strong';
  if (score >= 5) return 'is-mid';
  return 'is-weak';
}

export function AnalysisPanel({ data = MOCK_ANALYSIS }: Props) {
  return (
    <section className="analysis" aria-label="Analysis and synthesis">
      <header className="analysis__head">
        <h2 className="analysis__title">Analysis &amp; Synthesis</h2>
        {data.isMock && (
          <span className="analysis__mock" title="Placeholder data — real judge scores arrive in a later workstream">
            Mock data — real judge scores wired later
          </span>
        )}
      </header>

      <div className="analysis__grid">
        {/* (a) Judges */}
        <div className="analysis__card" aria-label="Judges">
          <div className="analysis__card-head">
            <h3 className="analysis__card-title">Judges</h3>
            <div className={`analysis__score ${scoreTone(data.synthesizedScore)}`}>
              <span className="analysis__score-num">{data.synthesizedScore.toFixed(1)}</span>
              <span className="analysis__score-unit">/10</span>
            </div>
          </div>
          <ul className="judges">
            {data.judges.map((j) => (
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
              {data.configDiff.map((row) => (
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
          <p className="analysis__synthesis">{data.synthesis}</p>
        </div>
      </div>
    </section>
  );
}
