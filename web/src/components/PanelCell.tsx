/**
 * PanelCell — one panel lane in the 2×2 Answer-Quality Lab.
 *
 * Spec (Task 5.2):
 *   Identity:   P# · Single|Multi · Keyword|Neural + mode/agent badges
 *   Lifecycle:  idle → streaming → answered → judging → judged
 *               | refused (✋) | error
 *   Body:       streamed markdown answer (reuses Markdown.tsx); inline [n] citations
 *   Sources:    dynamic source-pill row — one pill per source actually used (Popover)
 *   Status:     ✅ grounded (0 flagged) / ⚠ n flagged · 📎 n sources · ⏱ firstToken/total
 *   Trace:      multi-only orchestration mini-trace (Maverick → Technical ✓ Marketer ·)
 *   Actions:    [Sources] [Trace] (multi) [Why it won] → callbacks to parent
 *
 * Props are intentionally flat — the parent (Matrix) owns all state and passes
 * down slices; this component is a pure renderer with no internal async.
 *
 * Design decisions:
 *   - Reuses Markdown.tsx for zero-dep XSS-safe rendering.
 *   - Reuses Popover.tsx for the source-pill popover (same pattern as GroupedSources).
 *   - scoreTone() from lib/score for consistent color semantics.
 *   - formatMs() from lib/time for timing chips.
 *   - accentVar from PanelConfig drives the left stripe / glow via --cell-accent.
 *   - No local data-fetching; all streamed state comes via props.
 */
import { useState } from 'react';
import { Markdown } from './Markdown';
import { Popover } from './Popover';
import { scoreTone } from '../lib/score';
import { formatMs } from '../lib/time';
import type { PanelConfig } from '../config/columns';
import type {
  PanelDataResult,
  PanelJudgeResult,
  AnswerSource,
  OrchestrationTrace,
} from '../types/chat';

// ---------------------------------------------------------------------------
// Lifecycle state
// ---------------------------------------------------------------------------

export type PanelLifecycle =
  | 'idle'
  | 'streaming'
  | 'answered'
  | 'judging'
  | 'judged'
  | 'refused'
  | 'error';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PanelCellProps {
  /** Static panel identity + display metadata from PANEL_CONFIGS. */
  config: PanelConfig;
  /** Current lifecycle state. */
  lifecycle: PanelLifecycle;
  /**
   * Accumulated answer text (grows token-by-token while streaming;
   * final value when answered/judged/refused).
   */
  answer?: string;
  /** Full payload — set when server completes the answer. */
  result?: PanelDataResult;
  /** Judge verdict — set when judging completes for this panel. */
  judge?: PanelJudgeResult;
  /** True when this panel is the winner (highest composite, no gate). */
  isWinner?: boolean;
  /**
   * For neural panels: whether the index is actually live in NeuralSearch mode.
   * When false/undefined on a neural panel, the retrieval badge shows the honest
   * "Neural · enabling" state (NeuralSearch events still aggregating). Ignored
   * for keyword panels. Self-healing — clears when the backend reports live.
   */
  neuralLive?: boolean;
  /** Error message (lifecycle === 'error'). */
  error?: string;
  /** Timestamp (Date.now()) when the current answer stream started. */
  streamStartedAt?: number | null;
  /** Callback: user clicks the score badge → parent opens the judge drawer. */
  onOpenJudge?: () => void;
  /** Callback: user clicks [Sources] action. */
  onOpenSources?: () => void;
  /** Callback: user clicks [Trace] action (multi-only). */
  onOpenTrace?: () => void;
  /** Callback: user clicks [Why it won] action. */
  onOpenWhy?: () => void;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Animated streaming caret — hidden once streaming stops. */
function Caret() {
  return <span className="pcell__caret" aria-hidden="true" />;
}

/** Thinking dots — shown while streaming with no content yet. */
function Thinking() {
  return (
    <span className="pcell__thinking" aria-label="Thinking">
      <span className="dot" />
      <span className="dot" />
      <span className="dot" />
    </span>
  );
}

/** Source pill — one clickable pill per source in the answer. */
function SourcePill({ source, index }: { source: AnswerSource; index: number }) {
  // Derive a short label: prefer the source facet value, else clip the title.
  const pillLabel = source.source
    ? source.source.charAt(0).toUpperCase() + source.source.slice(1).toLowerCase()
    : source.title.length > 28
      ? source.title.slice(0, 26) + '…'
      : source.title;

  const url = source.url || undefined;

  return (
    <Popover
      className="pcell__srcpill"
      triggerLabel={`Source ${index + 1}: ${source.title}`}
      label={
        <>
          <span className="pcell__srcpill-n" aria-hidden="true">{index + 1}</span>
          <span className="pcell__srcpill-label">{pillLabel}</span>
        </>
      }
    >
      <div className="pcell__srcpop">
        <p className="pcell__srcpop-title">
          {url ? (
            <a href={url} target="_blank" rel="noopener noreferrer">
              {source.title}
            </a>
          ) : (
            source.title
          )}
        </p>
        {source.source && (
          <p className="pcell__srcpop-meta">{source.source}</p>
        )}
        {url && (
          <p className="pcell__srcpop-url">
            <a href={url} target="_blank" rel="noopener noreferrer">
              {url}
            </a>
          </p>
        )}
      </div>
    </Popover>
  );
}

/**
 * Orchestration mini-trace — multi panels only.
 * Renders: Maverick → Technical ✓  Marketer ✓  Academy ·  Support ·
 * Collapsed to one line by default; expandable.
 */
function MiniTrace({ trace }: { trace: OrchestrationTrace }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="pcell__trace">
      <button
        type="button"
        className="pcell__trace-trigger"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
        title={expanded ? 'Collapse orchestration trace' : 'Show orchestration trace'}
      >
        <span className="pcell__trace-icon" aria-hidden="true">⌁</span>
        <span className="pcell__trace-label">Maverick</span>
        {trace.specialists.map((s) => (
          <span
            key={s.name}
            className={`pcell__trace-sp ${s.fired ? 'is-fired' : 'is-skipped'}`}
            title={s.fired ? `${s.name}: ${s.hits} hits` : `${s.name}: not routed`}
          >
            {s.name.charAt(0).toUpperCase() + s.name.slice(1, 4)}
            <span aria-hidden="true">{s.fired ? ' ✓' : ' ·'}</span>
          </span>
        ))}
        <span className="pcell__trace-chevron" aria-hidden="true">
          {expanded ? '▴' : '▾'}
        </span>
      </button>

      {expanded && (
        <div className="pcell__trace-detail" role="region" aria-label="Orchestration trace">
          {trace.entities.length > 0 && (
            <p className="pcell__trace-entities">
              <span className="pcell__trace-key">Entities: </span>
              {trace.entities.join(', ')}
            </p>
          )}
          <ul className="pcell__trace-splist">
            {trace.specialists.map((s) => (
              <li key={s.name} className={`pcell__trace-spitem ${s.fired ? 'is-fired' : 'is-skipped'}`}>
                <span className="pcell__trace-spname">{s.name}</span>
                {s.fired ? (
                  <span className="pcell__trace-sphits">{s.hits} hit{s.hits !== 1 ? 's' : ''}</span>
                ) : (
                  <span className="pcell__trace-spskip">not routed</span>
                )}
              </li>
            ))}
          </ul>
          {trace.synthesisMs > 0 && (
            <p className="pcell__trace-synth">
              Synthesis: {formatMs(trace.synthesisMs)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** Score badge — shown when judged; clicking opens the judge drawer. */
function ScoreBadge({
  judge,
  isWinner,
  onOpenJudge,
}: {
  judge: PanelJudgeResult;
  isWinner?: boolean;
  onOpenJudge?: () => void;
}) {
  const tone = judge.gateTripped ? 'is-weak' : scoreTone(judge.composite);
  const gateSuffix = judge.gateTripped
    ? ' · grounding gate'
    : judge.borderline
      ? ' · borderline'
      : '';

  return (
    <button
      type="button"
      className={`pcell__score ${tone}`}
      onClick={onOpenJudge}
      disabled={!onOpenJudge}
      aria-label={`Judge score ${judge.composite.toFixed(1)} out of 10${gateSuffix}. Open judge breakdown.`}
      title={`${judge.composite.toFixed(1)}/10${gateSuffix} — click to open judge breakdown`}
    >
      {isWinner && <span className="pcell__score-star" aria-label="Winner">★</span>}
      <span className="pcell__score-num">{judge.composite.toFixed(1)}</span>
      <span className="pcell__score-unit">/10</span>
      <span className="pcell__score-icon" aria-hidden="true">⚖</span>
    </button>
  );
}

/** Lifecycle status pill in the header (idle / streaming / answered / judging…). */
function StatusPill({ lifecycle, error }: { lifecycle: PanelLifecycle; error?: string }) {
  const MAP: Record<PanelLifecycle, { label: string; cls: string }> = {
    idle:      { label: 'Idle',       cls: 'pcell__pill--idle'      },
    streaming: { label: 'Streaming…', cls: 'pcell__pill--streaming' },
    answered:  { label: 'Answered',   cls: 'pcell__pill--answered'  },
    judging:   { label: 'Judging…',   cls: 'pcell__pill--judging'   },
    judged:    { label: 'Judged',     cls: 'pcell__pill--judged'    },
    refused:   { label: 'Refused ✋',  cls: 'pcell__pill--refused'  },
    error:     { label: error ? `Error` : 'Error', cls: 'pcell__pill--error' },
  };
  const { label, cls } = MAP[lifecycle];
  return (
    <span
      className={`pcell__pill ${cls}`}
      title={lifecycle === 'error' && error ? error : undefined}
    >
      {label}
    </span>
  );
}

/**
 * Status chips row — grounding + sources + timing.
 * Shown when answered or judged.
 */
function StatusChips({
  judge,
  result,
}: {
  judge?: PanelJudgeResult;
  result?: PanelDataResult;
}) {
  const sources = result?.sources ?? [];
  const timing = result?.timing;

  const flaggedCount = judge?.flaggedClaims.length ?? 0;
  const gateTripped = judge?.gateTripped ?? false;

  return (
    <div className="pcell__chips" aria-label="Answer metadata">
      {/* Grounding chip — only when we have a judge verdict */}
      {judge && (
        <span
          className={`pcell__chip ${gateTripped ? 'pcell__chip--warn' : 'pcell__chip--ok'}`}
          title={
            gateTripped
              ? `Grounding gate tripped — ${flaggedCount} flagged claim${flaggedCount !== 1 ? 's' : ''}`
              : flaggedCount === 0
                ? 'All claims grounded'
                : `${flaggedCount} borderline claim${flaggedCount !== 1 ? 's' : ''}`
          }
        >
          {gateTripped ? `⚠ ${flaggedCount} flagged` : `✅ grounded (${flaggedCount} flagged)`}
        </span>
      )}

      {/* Source count */}
      {sources.length > 0 && (
        <span className="pcell__chip pcell__chip--neutral" title={`${sources.length} sources retrieved`}>
          📎 {sources.length} source{sources.length !== 1 ? 's' : ''}
        </span>
      )}

      {/* Timing */}
      {timing && (
        <span
          className="pcell__chip pcell__chip--neutral"
          title={`First token: ${formatMs(timing.firstTokenMs)} · Total: ${formatMs(timing.totalMs)}`}
        >
          ⏱ {formatMs(timing.firstTokenMs)} / {formatMs(timing.totalMs)}
        </span>
      )}
    </div>
  );
}

/** Action button row: [Sources] [Trace] [Why it won]. */
function ActionRow({
  config,
  lifecycle,
  hasTrace,
  onOpenSources,
  onOpenTrace,
  onOpenWhy,
}: {
  config: PanelConfig;
  lifecycle: PanelLifecycle;
  hasTrace: boolean;
  onOpenSources?: () => void;
  onOpenTrace?: () => void;
  onOpenWhy?: () => void;
}) {
  const showActions = lifecycle === 'answered' || lifecycle === 'judged' || lifecycle === 'refused';
  if (!showActions) return null;

  return (
    <div className="pcell__actions" aria-label="Panel actions">
      {onOpenSources && (
        <button type="button" className="pcell__action" onClick={onOpenSources}>
          Sources
        </button>
      )}
      {config.arch === 'multi' && hasTrace && onOpenTrace && (
        <button type="button" className="pcell__action" onClick={onOpenTrace}>
          Trace
        </button>
      )}
      {onOpenWhy && lifecycle === 'judged' && (
        <button type="button" className="pcell__action" onClick={onOpenWhy}>
          Why it won
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main PanelCell component
// ---------------------------------------------------------------------------

export function PanelCell({
  config,
  lifecycle,
  answer,
  result,
  judge,
  isWinner,
  neuralLive,
  error,
  onOpenJudge,
  onOpenSources,
  onOpenTrace,
  onOpenWhy,
}: PanelCellProps) {
  const isMulti = config.arch === 'multi';
  // Neural panels run in keyword mode until the deferred NeuralSearch flip lands.
  const neuralPending = config.retrieval === 'neural' && neuralLive !== true;
  const isStreaming = lifecycle === 'streaming';
  const isAnswered = lifecycle === 'answered' || lifecycle === 'judged';
  const isRefused = lifecycle === 'refused';
  const isError = lifecycle === 'error';
  const isIdle = lifecycle === 'idle';

  const sources = result?.sources ?? [];
  const trace = result?.trace;
  const hasTrace = isMulti && trace != null;

  // Derive the body variant for refused vs error vs normal.
  const bodyVariant = isRefused ? 'refusal' : isError ? 'error' : 'answer';

  return (
    <article
      className={`pcell${isWinner ? ' pcell--winner' : ''}${isError ? ' pcell--error' : ''}`}
      style={{ ['--cell-accent' as string]: `var(${config.accentVar})` }}
      aria-label={`Panel ${config.id}: ${config.arch} ${config.retrieval}`}
    >
      {/* ------------------------------------------------------------------ */}
      {/* Header — identity + score (when judged) + status pill               */}
      {/* ------------------------------------------------------------------ */}
      <header className="pcell__head">
        <div className="pcell__stripe" aria-hidden="true" />

        <div className="pcell__head-top">
          {/* Identity row */}
          <div className="pcell__identity">
            <span className="pcell__id">{config.id}</span>
            <span className="pcell__sep" aria-hidden="true">·</span>
            <span className="pcell__arch">{isMulti ? 'Multi' : 'Single'}</span>
            <span className="pcell__sep" aria-hidden="true">·</span>
            <span className="pcell__retrieval">{config.retrieval === 'neural' ? 'Neural' : 'Keyword'}</span>
          </div>

          {/* Badges */}
          <div className="pcell__badges">
            <span
              className={`pcell__badge pcell__badge--arch ${isMulti ? 'is-multi' : 'is-single'}`}
              title={isMulti ? 'Maverick multi-agent coordinator + specialists' : 'Single Agent Studio agent'}
            >
              {isMulti ? 'Multi-agent' : 'Single-agent'}
            </span>
            {config.retrieval === 'neural' ? (
              <span
                className={`pcell__badge pcell__badge--ret is-neural${neuralPending ? ' is-pending' : ''}`}
                title={
                  neuralPending
                    ? 'NeuralSearch is still aggregating events — this panel runs in keyword mode until the flip completes. The badge clears automatically when neural goes live.'
                    : 'NeuralSearch retrieval (live)'
                }
              >
                {neuralPending ? 'Neural · enabling' : 'Neural'}
              </span>
            ) : (
              <span className="pcell__badge pcell__badge--ret is-keyword" title="Keyword retrieval">
                Keyword
              </span>
            )}
          </div>
        </div>

        {/* Score + status row */}
        <div className="pcell__head-bottom">
          {judge && lifecycle === 'judged' ? (
            <ScoreBadge judge={judge} isWinner={isWinner} onOpenJudge={onOpenJudge} />
          ) : (
            <StatusPill lifecycle={lifecycle} error={error} />
          )}

          {/* Index name */}
          <span className="pcell__index" title={`Algolia index: ${config.indexName}`}>
            {config.indexName}
          </span>
        </div>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* Body — answer content                                               */}
      {/* ------------------------------------------------------------------ */}
      <div
        className={`pcell__body pcell__body--${bodyVariant}`}
        aria-live={isStreaming ? 'polite' : undefined}
      >
        {isIdle && (
          <p className="pcell__idle">
            Ask a question to see this panel's answer.
          </p>
        )}

        {isRefused && (
          <div className="pcell__refused-tag">
            <span aria-hidden="true">✋</span> Grounded refusal
          </div>
        )}

        {isError && (
          <div className="pcell__error-tag">
            <span aria-hidden="true">⚠</span> Unavailable
            {error && <p className="pcell__error-detail">{error}</p>}
          </div>
        )}

        {/* Streamed / final markdown answer */}
        {!isIdle && answer && !isError ? (
          <div className="pcell__md">
            <Markdown text={answer} />
            {isStreaming && <Caret />}
          </div>
        ) : isStreaming && !answer ? (
          <Thinking />
        ) : null}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Source pills — one per source actually returned                     */}
      {/* ------------------------------------------------------------------ */}
      {(isAnswered || isRefused) && sources.length > 0 && (
        <div className="pcell__sources" aria-label="Retrieved sources">
          <span className="pcell__sources-label">Sources</span>
          <div className="pcell__sources-row">
            {sources.map((src, i) => (
              <SourcePill key={`${src.url ?? src.title}-${i}`} source={src} index={i} />
            ))}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Orchestration mini-trace — multi panels only, when trace is present */}
      {/* ------------------------------------------------------------------ */}
      {hasTrace && isAnswered && trace && (
        <MiniTrace trace={trace} />
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Status chips — grounding + source count + timing                    */}
      {/* ------------------------------------------------------------------ */}
      {isAnswered && (
        <StatusChips judge={judge} result={result} />
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Action row                                                           */}
      {/* ------------------------------------------------------------------ */}
      <ActionRow
        config={config}
        lifecycle={lifecycle}
        hasTrace={hasTrace}
        onOpenSources={onOpenSources}
        onOpenTrace={onOpenTrace}
        onOpenWhy={onOpenWhy}
      />

      {/* ------------------------------------------------------------------ */}
      {/* Footer — proves + pipeline (collapsed, always present)              */}
      {/* ------------------------------------------------------------------ */}
      <footer className="pcell__foot">
        <p className="pcell__proves">{config.proves}</p>
      </footer>
    </article>
  );
}
