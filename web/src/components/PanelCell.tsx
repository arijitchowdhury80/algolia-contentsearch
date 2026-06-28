/**
 * PanelCell — one answer tile in the 2×2 Answer-Quality Lab (premium glass redesign).
 *
 * Layout: fixed HEADER (identity · score · time · grounding) → scrolling BODY
 * (the streamed markdown answer) → fixed SOURCES footer (deduped pills).
 * Plain-language labels + hover tooltips so a non-technical viewer (exec /
 * merchandiser) can read it, while the precise terms stay for developers.
 *
 * Props are flat; the parent (App/Matrix) owns all state. Clicking the score
 * opens the judge drawer (the single drill-in for sources/trace/why).
 */
import { useState, useEffect } from 'react';

import { Markdown } from './Markdown';
import { Popover } from './Popover';
import { ConfidenceChip } from './ConfidenceChip';
import { formatMs } from '../lib/time';
import { enrichSourcesWithUrls, domainLabel } from '../lib/sourceEnrich';
import type { PanelConfig } from '../config/columns';
import type { PanelDataResult, PanelJudgeResult, AnswerSource } from '../types/chat';

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export type PanelLifecycle =
  | 'idle' | 'streaming' | 'answered' | 'judging' | 'judged' | 'refused' | 'error';

export interface PanelCellProps {
  config: PanelConfig;
  lifecycle: PanelLifecycle;
  answer?: string;
  result?: PanelDataResult;
  judge?: PanelJudgeResult;
  isWinner?: boolean;
  /** Neural panels: whether the index is actually live in NeuralSearch mode. */
  neuralLive?: boolean;
  /** Shared submit instant (performance.now()) so all panels' wait-timers agree. */
  startedAt?: number | null;
  error?: string;
  /** Click the score → open the judge drawer (the single drill-in). */
  onOpenJudge?: () => void;
}

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

function Caret() {
  return <span className="pcell__caret" aria-hidden="true" />;
}

function Thinking() {
  return (
    <span className="pcell__thinking" aria-label="Thinking">
      <span className="dot" /><span className="dot" /><span className="dot" />
    </span>
  );
}

/** Ticking elapsed time (whole seconds) while `active`, measured from the SHARED
 *  submit instant (`startedAt`) so every panel's counter reads the same — they
 *  all started together. Falls back to a local start if no shared clock is given. */
function useElapsed(active: boolean, startedAt?: number | null): number {
  const [ms, setMs] = useState(0);
  useEffect(() => {
    if (!active) { setMs(0); return; }
    const origin = startedAt ?? performance.now();
    const update = () => setMs(performance.now() - origin);
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [active, startedAt]);
  return ms;
}

function elapsedLabel(ms: number): string {
  const s = Math.floor(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}

/** Map a source to its content CATEGORY (the facet a user thinks in), from its URL. */
function categorize(s: AnswerSource): string {
  const u = (s.url || '').toLowerCase();
  if (!u) return 'Other';
  if (u.includes('support.algolia.com')) return 'Support';
  if (u.includes('academy.algolia.com') || u.includes('/academy')) return 'Academy';
  if (u.includes('/developers') || u.includes('/api-reference') || u.includes('/api-client') || u.includes('/libraries')) return 'Developers';
  if (u.includes('/doc')) return 'Documentation';
  if (u.includes('/blog')) return 'Blog';
  if (u.includes('/customers') || u.includes('/case-stud')) return 'Customer story';
  if (u.includes('algolia.com')) return 'Website';
  return 'Other';
}

/** Group sources by category, most-used first — "the pulls are the sources". */
function groupByCategory(sources: AnswerSource[]): Array<[string, AnswerSource[]]> {
  const map = new Map<string, AnswerSource[]>();
  for (const s of sources) {
    const c = categorize(s);
    const arr = map.get(c);
    if (arr) arr.push(s);
    else map.set(c, [s]);
  }
  return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
}

/** One source row in a pill's dropdown: the title IS the link; a muted line shows
 *  where it goes. Removes the "which is the link vs text" ambiguity. */
function SourceRow({ d }: { d: AnswerSource }) {
  if (d.url) {
    return (
      <a className="pcell__srcrow" href={d.url} target="_blank" rel="noopener noreferrer">
        <span className="pcell__srcrow-title">{d.title || d.url}</span>
        <span className="pcell__srcrow-dest">{domainLabel(d.url)} <span aria-hidden="true">↗</span></span>
      </a>
    );
  }
  // No url recovered — show the title as plain (uncited) text, clearly not a link.
  return (
    <div className="pcell__srcrow pcell__srcrow--plain">
      <span className="pcell__srcrow-title">{d.title || 'source'}</span>
      <span className="pcell__srcrow-dest">not cited in the answer</span>
    </div>
  );
}

/** Compact fallback when no facet/URL data exists: one "N sources" chip → list. */
function AllSourcesPill({ sources }: { sources: AnswerSource[] }) {
  return (
    <Popover
      className="pcell__srcpill"
      triggerLabel={`${sources.length} sources used`}
      label={
        <>
          <span className="pcell__srcpill-n" aria-hidden="true">{sources.length}</span>
          <span className="pcell__srcpill-label">sources used</span>
        </>
      }
    >
      <div className="pcell__srcpop">
        <p className="pcell__srcpop-cat">Sources used · {sources.length}</p>
        {sources.map((d, i) => <SourceRow key={i} d={d} />)}
      </div>
    </Popover>
  );
}

/** A category pill: count + facet name; click lists the docs pulled from it. */
function CategoryPill({ cat, docs }: { cat: string; docs: AnswerSource[] }) {
  return (
    <Popover
      className="pcell__srcpill"
      triggerLabel={`${docs.length} ${cat} source${docs.length !== 1 ? 's' : ''}`}
      label={
        <>
          <span className="pcell__srcpill-n" aria-hidden="true">{docs.length}</span>
          <span className="pcell__srcpill-label">{cat}</span>
        </>
      }
    >
      <div className="pcell__srcpop">
        <p className="pcell__srcpop-cat">{cat} · {docs.length} source{docs.length !== 1 ? 's' : ''}</p>
        {docs.map((d, i) => <SourceRow key={i} d={d} />)}
      </div>
    </Popover>
  );
}

const STATUS: Record<PanelLifecycle, { label: string; cls: string }> = {
  idle:      { label: 'Idle',        cls: 'pcell__pill--idle' },
  streaming: { label: 'Answering…',  cls: 'pcell__pill--streaming' },
  answered:  { label: 'Answered',    cls: 'pcell__pill--answered' },
  judging:   { label: 'Scoring…',    cls: 'pcell__pill--judging' },
  judged:    { label: 'Scored',      cls: 'pcell__pill--judged' },
  refused:   { label: 'Declined ✋',  cls: 'pcell__pill--refused' },
  error:     { label: 'Error',       cls: 'pcell__pill--error' },
};

function StatusPill({ lifecycle, error }: { lifecycle: PanelLifecycle; error?: string }) {
  const { label, cls } = STATUS[lifecycle];
  return (
    <span className={`pcell__pill ${cls}`} title={lifecycle === 'error' && error ? error : undefined}>
      {label}
    </span>
  );
}

/** Dedupe sources by url|title so near-identical docs don't read as repeats. */
function dedupeSources(sources: AnswerSource[]): AnswerSource[] {
  const seen = new Set<string>();
  const out: AnswerSource[] = [];
  for (const s of sources) {
    const key = (s.url || s.title || '').trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

// ---------------------------------------------------------------------------
// PanelCell
// ---------------------------------------------------------------------------

export function PanelCell({
  config,
  lifecycle,
  answer,
  result,
  judge,
  isWinner,
  neuralLive,
  startedAt,
  error,
  onOpenJudge,
}: PanelCellProps) {
  const isMulti = config.arch === 'multi';
  // Show "enabling" ONLY when the backend EXPLICITLY reports the index isn't live
  // yet. When status is unknown (old /health omits the field), don't claim either
  // way — just label it "Neural" (the panel's config, always true).
  const neuralPending = config.retrieval === 'neural' && neuralLive === false;

  const isStreaming = lifecycle === 'streaming';
  const waitElapsed = useElapsed(lifecycle === 'streaming', startedAt);
  const isAnswered = lifecycle === 'answered' || lifecycle === 'judged';
  const isRefused = lifecycle === 'refused';
  const isError = lifecycle === 'error';
  const isIdle = lifecycle === 'idle';
  const isJudged = lifecycle === 'judged' && !!judge;
  // The judge fills the Confidence chip asynchronously: the answer renders, then
  // the verdict lands. While judging (and answered-but-not-yet-judged), the chip
  // shows a "scoring…" placeholder.
  const isScoring = (lifecycle === 'judging' || lifecycle === 'answered') && !judge;

  // Back-fill source urls from the answer's [title](url) citations so the pills
  // can group by topic (not collapse to one bucket) and every row is a real link.
  const sources = dedupeSources(enrichSourcesWithUrls(result?.sources ?? [], answer ?? ''));
  const sourceCats = groupByCategory(sources);
  // We can only show facet categories when the payload carries URLs/facets; until
  // the backend includes them, everything is "Other" → fall back to one count chip.
  const hasCategories = sourceCats.length > 0 && !(sourceCats.length === 1 && sourceCats[0][0] === 'Other');
  const trace = result?.trace;
  const timing = result?.timing;

  const flaggedCount = judge?.flaggedClaims.length ?? 0;
  const gateTripped = judge?.gateTripped ?? false;
  const firedSpecialists = (trace?.specialists ?? [])
    .filter((s) => s.fired)
    .map((s) => s.name.charAt(0).toUpperCase() + s.name.slice(1));

  const bodyVariant = isRefused ? 'refusal' : isError ? 'error' : 'answer';

  return (
    <article
      className={`pcell${isWinner ? ' pcell--winner' : ''}${isError ? ' pcell--error' : ''}`}
      style={{ ['--cell-accent' as string]: `var(${config.accentVar})` }}
      aria-label={`Panel ${config.id}: ${config.arch} agent, ${config.retrieval} retrieval`}
    >
      {/* ---- Header: P# · score · time · grounding (left) · badges (right) ---- */}
      <header className="pcell__head">
        <div className="pcell__head-row">
          <span
            className="pcell__id"
            title={`${config.id} · ${isMulti ? 'Multi-agent' : 'Single agent'} · ${config.retrieval === 'neural' ? 'Neural' : 'Keyword'} retrieval`}
          >
            {config.id}
          </span>

          {isJudged && judge ? (
            <ConfidenceChip
              variant="inline"
              verdict={judge}
              isWinner={isWinner}
              onOpenJudge={onOpenJudge}
            />
          ) : isScoring ? (
            <ConfidenceChip variant="inline" scoring />
          ) : (
            <StatusPill lifecycle={lifecycle} error={error} />
          )}

          {isWinner && isJudged && (
            <span className="pcell__best" title="Highest answer-quality score across the four systems this round">
              Best answer
            </span>
          )}

          {timing && (
            <span
              className="pcell__hchip pcell__hchip--time"
              title={`Time to first word ${formatMs(timing.firstTokenMs)} · total ${formatMs(timing.totalMs)}`}
            >
              ⏱ {formatMs(timing.totalMs)}
            </span>
          )}

          {judge && isRefused && (
            <span className="pcell__hchip pcell__hchip--ok" title="Correctly declined — the answer wasn't in the sources, so the system refused instead of guessing">
              ✓ grounded refusal
            </span>
          )}
          {judge && !isRefused && (
            <span
              className={`pcell__hchip ${gateTripped ? 'pcell__hchip--warn' : 'pcell__hchip--ok'}`}
              title={gateTripped
                ? `${flaggedCount} claim${flaggedCount !== 1 ? 's' : ''} not backed by the retrieved sources`
                : 'Every factual claim is backed by the retrieved sources'}
            >
              {gateTripped ? `⚠ ${flaggedCount} unsupported` : '✓ backed by sources'}
            </span>
          )}

          <div className="pcell__badges">
            <span
              className={`pcell__badge pcell__badge--arch ${isMulti ? 'is-multi' : 'is-single'}`}
              title={isMulti
                ? 'Multi-agent: a coordinator (Maverick) routes your question to source specialists, then combines their findings.'
                : 'Single-agent: one Algolia agent answers from one index.'}
            >
              {isMulti ? 'Multi-agent' : 'Single-agent'}
            </span>
            {config.retrieval === 'neural' ? (
              <span
                className={`pcell__badge pcell__badge--ret is-neural${neuralPending ? ' is-pending' : ''}`}
                title={neuralPending
                  ? 'NeuralSearch is still switching on for this index — running keyword for now. Clears automatically when it goes live.'
                  : 'NeuralSearch: AI semantic retrieval that matches on meaning, not just exact keywords.'}
              >
                {neuralPending ? 'Neural · enabling' : 'Neural'}
              </span>
            ) : (
              <span className="pcell__badge pcell__badge--ret is-keyword" title="Keyword: classic exact-term (lexical) matching.">
                Keyword
              </span>
            )}
          </div>
        </div>

        {isMulti && isAnswered && firedSpecialists.length > 0 && (
          <div className="pcell__traceline" title="Which source specialists the coordinator used for this answer">
            <span className="pcell__traceline-icon" aria-hidden="true">⚡</span>
            <b>Maverick</b> → {firedSpecialists.join(', ')}
          </div>
        )}
      </header>

      {/* ---- Body: the answer (scrolls internally) ---- */}
      <div
        className={`pcell__body pcell__body--${bodyVariant}`}
        aria-live={isStreaming ? 'polite' : undefined}
      >
        {isIdle && <p className="pcell__idle">Ask a question to see this system's answer.</p>}
        {isRefused && (
          <div className="pcell__refused-tag">
            <span aria-hidden="true">✋</span> Declined — the answer wasn't in the sources
          </div>
        )}
        {isError && (
          <div className="pcell__error-tag">
            <span aria-hidden="true">⚠</span> Unavailable
            {error && <p className="pcell__error-detail">{error}</p>}
          </div>
        )}
        {!isIdle && answer && !isError ? (
          <div className="pcell__md">
            <Markdown text={answer} />
            {isStreaming && <Caret />}
            {/* Per-answer Confidence surface — fills async after the answer. */}
            {(isJudged || isScoring) && (
              <div className="pcell__confidence">
                <ConfidenceChip
                  variant="block"
                  verdict={isJudged ? judge : undefined}
                  scoring={isScoring}
                  isWinner={isWinner}
                  onOpenJudge={onOpenJudge}
                />
              </div>
            )}
          </div>
        ) : isStreaming && !answer ? (
          <div className="pcell__waiting">
            <div className="pcell__waiting-row">
              <Thinking />
              <span className="pcell__waiting-time" aria-live="polite">{elapsedLabel(waitElapsed)}</span>
            </div>
            <p className="pcell__waiting-hint">
              {isMulti
                ? 'Coordinator is routing your question to source specialists, then combining their findings — multi-agent answers take longer.'
                : config.retrieval === 'neural'
                  ? 'Running semantic (neural) retrieval, then composing a grounded answer…'
                  : 'Searching Algolia content, then composing a grounded answer…'}
            </p>
          </div>
        ) : null}
      </div>

      {/* ---- Sources footer (deduped, distinguishable) ---- */}
      {(isAnswered || isRefused) && sources.length > 0 && (
        <div className="pcell__sources" aria-label="Sources used">
          <span className="pcell__sources-label">
            Sources{hasCategories ? ' · pulled from' : ''}
          </span>
          <div className="pcell__sources-row">
            {hasCategories
              ? sourceCats.map(([cat, docs]) => <CategoryPill key={cat} cat={cat} docs={docs} />)
              : <AllSourcesPill sources={sources} />}
          </div>
        </div>
      )}
    </article>
  );
}
