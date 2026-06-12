/** ColumnHeader — lane identity: accent stripe, title, Index | Agent, status pill. */
import type { ColumnConfig } from '../config/columns';

export type StatusTone = 'idle' | 'success' | 'warn' | 'danger' | 'info';

interface Props {
  config: ColumnConfig;
  statusTone: StatusTone;
  statusLabel: string;
}

const PILL_CLASS: Record<StatusTone, string> = {
  idle: 'lane-pill lane-pill--idle',
  success: 'lane-pill is-success',
  warn: 'lane-pill is-warn',
  danger: 'lane-pill is-danger',
  info: 'lane-pill is-info',
};

export function ColumnHeader({ config, statusTone, statusLabel }: Props) {
  const knownIssue = config.kind === 'agent' ? config.knownIssue : undefined;

  return (
    <header className="lane__head" style={{ ['--lane-accent' as string]: `var(${config.accentVar})` }}>
      <span className="lane__stripe" aria-hidden="true" />
      <div className="lane__head-row">
        <h2 className="lane__title">{config.title}</h2>
        <span className={PILL_CLASS[statusTone]}>{statusLabel}</span>
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
