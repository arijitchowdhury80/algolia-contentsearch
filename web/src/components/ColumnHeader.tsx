/** ColumnHeader — lane identity: accent stripe, title, score pill, Index | Agent, status pill. */
import type { ColumnConfig, AgentColumnConfig } from '../config/columns';
import { laneTone, type LaneScore } from '../lib/score';

export type StatusTone = 'idle' | 'success' | 'warn' | 'danger' | 'info';

interface Props {
  config: ColumnConfig | AgentColumnConfig;
  statusTone: StatusTone;
  statusLabel: string;
  /** Live verdict for this lane (judged lanes only); drives the always-visible score pill. */
  score?: LaneScore;
  /** Opens the analysis drawer (rendered as a per-lane ⚖ trigger when a score exists). */
  onOpenAnalysis?: () => void;
}

const PILL_CLASS: Record<StatusTone, string> = {
  idle: 'lane-pill lane-pill--idle',
  success: 'lane-pill is-success',
  warn: 'lane-pill is-warn',
  danger: 'lane-pill is-danger',
  info: 'lane-pill is-info',
};

export function ColumnHeader({ config, statusTone, statusLabel, score, onOpenAnalysis }: Props) {
  const knownIssue = config.kind === 'agent' ? (config as AgentColumnConfig).knownIssue : undefined;
  const gateSuffix = score?.gateTripped ? ' · gated' : score?.borderline ? ' · borderline' : '';

  return (
    <header className="lane__head" style={{ ['--lane-accent' as string]: `var(${config.accentVar})` }}>
      <span className="lane__stripe" aria-hidden="true" />
      <div className="lane__head-row">
        <h2 className="lane__title">{config.title}</h2>
        <div className="lane__head-actions">
          {score && (
            <button
              type="button"
              className={`lane-score ${laneTone(score)}`}
              onClick={onOpenAnalysis}
              disabled={!onOpenAnalysis}
              title={`Judge verdict ${score.score.toFixed(1)}/10${gateSuffix} — open analysis`}
              aria-label={`Analysis: scored ${score.score.toFixed(1)} out of 10${gateSuffix}. Open analysis drawer.`}
            >
              <span className="lane-score__num">{score.score.toFixed(1)}</span>
              <span className="lane-score__unit">/10</span>
              <span className="lane-score__icon" aria-hidden="true">⚖</span>
            </button>
          )}
          <span className={PILL_CLASS[statusTone]}>{statusLabel}</span>
        </div>
      </div>
      <dl className="lane__meta">
        <div className="lane__meta-pair">
          <dt>App</dt>
          <dd>
            {config.appName}
            {config.readOnly && <span className="lane__ro" title="We only read this app; never write it">read-only</span>}
          </dd>
        </div>
        <div className="lane__meta-pair">
          <dt>Index</dt>
          <dd className="mono">{config.indexLabel}</dd>
        </div>
        <div className="lane__meta-pair">
          <dt>Engine</dt>
          <dd>{config.agentLabel}</dd>
        </div>
      </dl>
      <p className="lane__pipeline">{config.pipeline}</p>
      <p className="lane__proves">{config.proves}</p>
      {knownIssue && <p className="lane__issue">{knownIssue}</p>}
    </header>
  );
}
