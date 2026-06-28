/**
 * OrchestrationTrace — fan-out viz for the Maverick coordinator (P2/P4 multi panels).
 *
 * Two modes:
 *   mini   — a compact inline strip that lives inside the multi-agent panel cell.
 *            Shows the flow at a glance: Maverick → each specialist status → synthesize.
 *   full   — an expanded drawer/expander block with entity chips, per-specialist hit
 *            counts, synthesis timing, and a prose summary of what fired.
 *
 * Single panels (P1/P3): the same component is used with `arch="single"` — it shows
 * a simplified single-search flow ("1 search → answer") instead of the fan-out.
 *
 * Props are driven directly by OrchestrationTrace from types/chat.ts. While the
 * trace is loading (answer streaming), pass `loading={true}` — every specialist
 * renders as a pending dot so the UI isn't blank.
 *
 * Visual language: reuses dimbar, lane-pill, arail__card, srcpill patterns from
 * ab.css / tokens.css. No new CSS dependencies — all classes are already defined.
 */
import { useState } from 'react';
import type { OrchestrationTrace as TraceData, Architecture } from '../types/chat';

// ---------------------------------------------------------------------------
// Specialist roster — in display order, with icons.
// Must match the server's SOURCE_GROUPS in orchestration (docs plan §3.3).
// ---------------------------------------------------------------------------

interface SpecialistMeta {
  name: string;
  icon: string;
  short: string;
}

const SPECIALISTS: SpecialistMeta[] = [
  { name: 'Technical',  icon: '⚙',  short: 'Tech' },
  { name: 'Marketer',   icon: '📢', short: 'Mktr' },
  { name: 'Academy',    icon: '🎓', short: 'Acad' },
  { name: 'Support',    icon: '🛟', short: 'Supp' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Match a trace specialist entry to our canonical roster by name (case-insensitive prefix). */
function matchSpecialist(name: string): SpecialistMeta | undefined {
  const lower = name.toLowerCase();
  return SPECIALISTS.find((s) => lower.startsWith(s.name.toLowerCase()) || s.name.toLowerCase().startsWith(lower));
}

/** Total grounded docs across all fired specialists. */
function countGroundedDocs(specialists: TraceData['specialists']): number {
  return specialists.reduce((sum, s) => sum + (s.fired ? s.hits : 0), 0);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** One specialist node — used in both mini and full modes. */
function SpecialistNode({
  meta,
  fired,
  hits,
  loading,
  compact,
}: {
  meta: SpecialistMeta;
  fired: boolean;
  hits: number;
  loading: boolean;
  compact: boolean;
}) {
  const status = loading ? 'pending' : fired ? 'ok' : 'skip';
  const statusClass =
    status === 'ok'      ? 'orch__spec--ok' :
    status === 'pending' ? 'orch__spec--pending' :
                           'orch__spec--skip';

  const statusMark =
    status === 'ok'      ? '✓' :
    status === 'pending' ? '·' :
                           '–';

  if (compact) {
    // Mini mode: "Tech ✓" pill-like token
    return (
      <span
        className={`orch__spec-mini ${statusClass}`}
        title={
          loading
            ? `${meta.name} — waiting`
            : fired
            ? `${meta.name} — ${hits} doc${hits === 1 ? '' : 's'} retrieved`
            : `${meta.name} — not routed`
        }
        aria-label={`${meta.name}: ${status === 'ok' ? `${hits} hits` : status}`}
      >
        <span className="orch__spec-mini-icon" aria-hidden="true">{meta.icon}</span>
        <span className="orch__spec-mini-label">{meta.short}</span>
        <span className="orch__spec-mini-mark" aria-hidden="true">{statusMark}</span>
        {status === 'ok' && hits > 0 && (
          <span className="orch__spec-mini-hits">{hits}</span>
        )}
      </span>
    );
  }

  // Full mode: card row with icon, name, status pill, hit count bar
  return (
    <div className={`orch__spec ${statusClass}`} aria-label={`${meta.name}: ${status === 'ok' ? `${hits} hits retrieved` : status}`}>
      <span className="orch__spec-icon" aria-hidden="true">{meta.icon}</span>
      <div className="orch__spec-body">
        <div className="orch__spec-row">
          <span className="orch__spec-name">{meta.name}</span>
          <span className={`orch__spec-badge ${statusClass}`}>
            {loading ? 'waiting…' : fired ? 'fired' : 'skipped'}
          </span>
          {status === 'ok' && (
            <span className="orch__spec-hits">
              {hits} doc{hits === 1 ? '' : 's'}
            </span>
          )}
        </div>
        {status === 'ok' && hits > 0 && (
          <div className="orch__spec-bar" role="img" aria-label={`${hits} documents retrieved`}>
            <span
              className="orch__spec-bar-fill"
              // Relative bar: max 10 docs per specialist → 100% at 10+
              style={{ width: `${Math.min(100, (hits / 10) * 100)}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/** Arrow connector — the visual → between steps. */
function Arrow({ label }: { label?: string }) {
  return (
    <span className="orch__arrow" aria-hidden="true">
      {label ? <span className="orch__arrow-label">{label}</span> : null}
      →
    </span>
  );
}

// ---------------------------------------------------------------------------
// Mini strip (inline in the multi-agent panel cell header area)
// ---------------------------------------------------------------------------

interface MiniProps {
  /** The trace from PanelDataResult.trace (undefined while streaming). */
  trace?: TraceData;
  /** True while the answer is still streaming (renders pending dots). */
  loading?: boolean;
  /** Expands to the full expander when clicked. */
  onExpand?: () => void;
}

function MiniTrace({ trace, loading = false, onExpand }: MiniProps) {
  // Build specialist display list.
  // If trace is present, use its entries. Otherwise, show the canonical 4 as pending.
  const specEntries: Array<{ meta: SpecialistMeta; fired: boolean; hits: number }> =
    trace
      ? trace.specialists.map((s) => ({
          meta: matchSpecialist(s.name) ?? { name: s.name, icon: '?', short: s.name.slice(0, 4) },
          fired: s.fired,
          hits: s.hits,
        }))
      : SPECIALISTS.map((meta) => ({ meta, fired: false, hits: 0 }));

  const totalDocs = trace ? countGroundedDocs(trace.specialists) : 0;

  return (
    <div className="orch__mini" aria-label="Orchestration trace — mini view">
      {/* Maverick label */}
      <span className="orch__mini-start">Maverick</span>
      <Arrow />

      {/* 4 specialist nodes */}
      <span className="orch__mini-specs" role="list" aria-label="Specialists">
        {specEntries.map(({ meta, fired, hits }) => (
          <SpecialistNode
            key={meta.name}
            meta={meta}
            fired={fired}
            hits={hits}
            loading={loading}
            compact
          />
        ))}
      </span>

      {/* Synthesis node — only shown once trace is available */}
      {trace && (
        <>
          <Arrow />
          <span className="orch__mini-synth" title={`Synthesis in ${trace.synthesisMs}ms`}>
            <span className="orch__mini-synth-docs">{totalDocs} doc{totalDocs === 1 ? '' : 's'}</span>
            {' '}→ answer
          </span>
        </>
      )}
      {loading && !trace && (
        <>
          <Arrow />
          <span className="orch__mini-synth orch__mini-synth--pending" aria-label="Synthesizing">
            <span className="dot" />
            <span className="dot" />
            <span className="dot" />
          </span>
        </>
      )}

      {/* Expand toggle */}
      {onExpand && (
        <button
          type="button"
          className="orch__mini-expand"
          onClick={onExpand}
          aria-label="Expand orchestration trace"
          title="Show full trace"
        >
          ⊕
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single-panel variant (P1/P3 — no fan-out, just one search)
// ---------------------------------------------------------------------------

interface SingleSearchProps {
  /** True while answer is streaming. */
  loading?: boolean;
  /** How many sources the single agent retrieved (from sources.length in PanelDataResult). */
  hits?: number;
  /** Index name used for retrieval. */
  indexName?: string;
}

function SingleSearchMini({ loading = false, hits, indexName }: SingleSearchProps) {
  const hitsLabel =
    loading ? '…' :
    hits !== undefined ? `${hits} doc${hits === 1 ? '' : 's'}` : '';

  return (
    <div className="orch__mini orch__mini--single" aria-label="Single-agent search trace">
      <span className="orch__mini-start">Agent</span>
      <Arrow />
      <span className="orch__mini-idx" title={indexName}>
        {indexName ? indexName.replace('AC2_WWW_', '') : 'index'}
      </span>
      <Arrow />
      <span className={`orch__mini-synth${loading ? ' orch__mini-synth--pending' : ''}`}>
        {loading
          ? <><span className="dot" /><span className="dot" /><span className="dot" /></>
          : <>{hitsLabel} → answer</>
        }
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Full expanded trace (used in drawer/expander — block ⑦ per the plan)
// ---------------------------------------------------------------------------

interface FullProps {
  trace: TraceData;
  /** For the section header. */
  panelLabel?: string;
  onCollapse?: () => void;
}

function FullTrace({ trace, panelLabel, onCollapse }: FullProps) {
  const totalDocs = countGroundedDocs(trace.specialists);

  return (
    <div className="orch__full" aria-label="Orchestration trace — full view">
      {/* Header */}
      <div className="orch__full-head arail__card-head">
        <h3 className="orch__full-title arail__card-title">
          Orchestration trace{panelLabel ? ` — ${panelLabel}` : ''}
        </h3>
        {onCollapse && (
          <button
            type="button"
            className="arail__btn"
            onClick={onCollapse}
            aria-label="Collapse trace"
            title="Collapse"
          >
            ×
          </button>
        )}
      </div>

      {/* Flow summary: Maverick → specialists → synthesis */}
      <div className="orch__flow" aria-label="Orchestration flow">
        <div className="orch__flow-node orch__flow-node--maverick">
          <span className="orch__flow-icon" aria-hidden="true">🤖</span>
          <span className="orch__flow-label">Maverick</span>
          <span className="orch__flow-sub">coordinator</span>
        </div>

        <div className="orch__flow-connector" aria-hidden="true">
          <span className="orch__flow-line" />
          <span className="orch__flow-label-mid">fan-out</span>
          <span className="orch__flow-line" />
        </div>

        <div className="orch__flow-specs" role="list" aria-label="Specialists">
          {trace.specialists.map((s) => {
            const meta = matchSpecialist(s.name) ?? { name: s.name, icon: '?', short: s.name };
            return (
              <SpecialistNode
                key={s.name}
                meta={meta}
                fired={s.fired}
                hits={s.hits}
                loading={false}
                compact={false}
              />
            );
          })}
        </div>

        <div className="orch__flow-connector" aria-hidden="true">
          <span className="orch__flow-line" />
          <span className="orch__flow-label-mid">synthesize</span>
          <span className="orch__flow-line" />
        </div>

        <div className="orch__flow-node orch__flow-node--synth">
          <span className="orch__flow-icon" aria-hidden="true">✍</span>
          <span className="orch__flow-label">{totalDocs} grounded doc{totalDocs === 1 ? '' : 's'}</span>
          <span className="orch__flow-sub">Maverick synthesizes → answer</span>
        </div>
      </div>

      {/* Entity chips (extracted intent) */}
      {trace.entities.length > 0 && (
        <div className="orch__entities">
          <span className="orch__entities-label">Extracted intent</span>
          <div className="orch__entities-chips" role="list" aria-label="Extracted entities">
            {trace.entities.map((e) => (
              <span key={e} className="orch__entity-chip" role="listitem">{e}</span>
            ))}
          </div>
        </div>
      )}

      {/* Timing */}
      <dl className="orch__timing">
        <div className="orch__timing-row">
          <dt>Synthesis</dt>
          <dd className="mono">{trace.synthesisMs}ms</dd>
        </div>
        <div className="orch__timing-row">
          <dt>Specialists fired</dt>
          <dd>{trace.specialists.filter((s) => s.fired).length} / {trace.specialists.length}</dd>
        </div>
        <div className="orch__timing-row">
          <dt>Grounded docs</dt>
          <dd>{totalDocs}</dd>
        </div>
      </dl>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface OrchestrationTraceProps {
  /**
   * The panel's architecture. Drives which variant renders:
   *   multi  → Maverick fan-out viz (MiniTrace / FullTrace)
   *   single → simplified single-search flow (SingleSearchMini)
   */
  arch: Architecture;

  /**
   * The Maverick orchestration trace (P2/P4 only).
   * Undefined while streaming — loading dots render until it arrives.
   */
  trace?: TraceData;

  /**
   * True while the panel answer is streaming. Renders pending dots on all
   * specialists so the UI reacts immediately (never shows blank).
   */
  loading?: boolean;

  /**
   * Mini (default) or full expander. Callers control this externally:
   *   - PanelCell keeps `variant="mini"` in its header; a "Trace" action
   *     button sets `variant="full"` to show the block ⑦ expander.
   *   - The JudgeDrawer can render `variant="full"` alongside the verdict.
   */
  variant?: 'mini' | 'full';

  /**
   * Called when the mini strip's expand button is clicked.
   * Callers switch `variant` to "full" in response.
   */
  onExpand?: () => void;

  /**
   * Called when the full trace's collapse button is clicked.
   * Callers switch `variant` back to "mini" in response.
   */
  onCollapse?: () => void;

  /** Panel label shown in the full trace header (e.g. "P2 · Multi · Keyword"). */
  panelLabel?: string;

  // Single-panel props (used when arch === 'single')
  /** Number of sources the single agent retrieved — shown in the mini strip. */
  singleHits?: number;
  /** Index name for the single-panel retrieval strip. */
  indexName?: string;
}

/**
 * OrchestrationTrace — Maverick → 4 specialists fan-out viz that lights up
 * live (Tech ✓ / Mktr · / Acad · / Supp ·) → "N grounded docs → Maverick
 * synthesizes → answer".
 *
 * Inline mini-version for the multi cell header; full version for a
 * drawer/expander.  Single panels: same affordance shows their one search.
 */
export function OrchestrationTrace({
  arch,
  trace,
  loading = false,
  variant = 'mini',
  onExpand,
  onCollapse,
  panelLabel,
  singleHits,
  indexName,
}: OrchestrationTraceProps) {
  // For single-agent panels, render the simplified strip in both modes —
  // there's no fan-out to expand; both mini and full show the same content.
  if (arch === 'single') {
    return (
      <SingleSearchMini
        loading={loading}
        hits={singleHits}
        indexName={indexName}
      />
    );
  }

  // Multi-agent panel: toggle between mini strip and full expander.
  if (variant === 'full' && trace) {
    return (
      <FullTrace
        trace={trace}
        panelLabel={panelLabel}
        onCollapse={onCollapse}
      />
    );
  }

  // Mini strip (default) — also shown while loading before the full trace arrives.
  return (
    <MiniTrace
      trace={trace}
      loading={loading}
      onExpand={trace ? onExpand : undefined}
    />
  );
}

// ---------------------------------------------------------------------------
// Self-contained toggle wrapper (convenience for PanelCell / JudgeDrawer)
// ---------------------------------------------------------------------------

/**
 * OrchestrationTraceToggle — wraps OrchestrationTrace with its own expand/collapse
 * state so callers don't have to manage it.  Use this in PanelCell for the
 * block-⑦ inline expander.
 */
export function OrchestrationTraceToggle(
  props: Omit<OrchestrationTraceProps, 'variant' | 'onExpand' | 'onCollapse'>,
) {
  const [expanded, setExpanded] = useState(false);
  return (
    <OrchestrationTrace
      {...props}
      variant={expanded ? 'full' : 'mini'}
      onExpand={() => setExpanded(true)}
      onCollapse={() => setExpanded(false)}
    />
  );
}
