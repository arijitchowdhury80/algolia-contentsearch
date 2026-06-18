/**
 * App — the Answer-Quality Lab.
 *
 * One query bar fans out to a full-height horizontal lane rail (ADR-001 D1):
 * ① Current Website Search, ② Ask AI, ③ Our System (and N more in later phases).
 * Each judged lane shows its always-visible verdict score pill (D2); the full
 * 3-dimension analysis (composite + per-dimension bars + ②-vs-③ margin + judges)
 * lives in a PERMANENT, collapsible, pinnable right RAIL that pushes the lanes
 * (resizable via its left edge; lanes themselves resize natively). The header
 * verdict chip and lane ⚖ pills expand it. Panels own their own threads; this
 * shell holds the shared submission/reset signals, the live judge wiring, the
 * rail state (persisted), and the transcript export (eval tie-in, §10).
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { buildColumns, type ColumnConfig } from './config/columns';
import { useComparison } from './hooks/useComparison';
import { useLiveJudge, type LiveJudgeOptions } from './hooks/useLiveJudge';
import { AppHeader } from './components/AppHeader';
import { Composer } from './components/Composer';
import { ComparisonKey } from './components/ComparisonKey';
import { LaneRail } from './components/LaneRail';
import { WebsiteColumn } from './components/WebsiteColumn';
import { AgentColumn } from './components/AgentColumn';
import { AnalysisRail } from './components/AnalysisRail';
import { laneTone } from './lib/score';

const RAIL_MIN = 300;
const RAIL_MAX = 720;
const RAIL_DEFAULT = 380;

/** Read a persisted rail setting, tolerating SSR / disabled storage. */
function readRail<T>(key: string, fallback: T, parse: (s: string) => T): T {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : parse(v);
  } catch {
    return fallback;
  }
}
function writeRail(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable — non-fatal */
  }
}

export default function App() {
  // Built once; throws loudly at startup if any VITE_* var is missing.
  const columns = useMemo(() => buildColumns(), []);
  const { submission, clearSeq, hasRun, submit, reset, register, buildTranscript } = useComparison();

  // Permanent analysis rail: open/pinned/width persisted across reloads.
  const [railOpen, setRailOpen] = useState(() => readRail('lab.rail.open', true, (s) => s === '1'));
  const [railPinned, setRailPinned] = useState(() => readRail('lab.rail.pinned', false, (s) => s === '1'));
  const [railWidth, setRailWidth] = useState(() =>
    readRail('lab.rail.width', RAIL_DEFAULT, (s) => Number(s) || RAIL_DEFAULT),
  );

  const setOpen = useCallback((open: boolean) => {
    setRailOpen(open);
    writeRail('lab.rail.open', open ? '1' : '0');
  }, []);
  const expandRail = useCallback(() => setOpen(true), [setOpen]);
  const toggleOpen = useCallback(() => setRailOpen((o) => {
    const next = !o;
    writeRail('lab.rail.open', next ? '1' : '0');
    return next;
  }), []);
  const togglePin = useCallback(() => setRailPinned((p) => {
    const next = !p;
    writeRail('lab.rail.pinned', next ? '1' : '0');
    if (next) { setRailOpen(true); writeRail('lab.rail.open', '1'); } // pinning forces open
    return next;
  }), []);

  // Left-edge drag to resize the rail (pointer capture; rail is right-docked).
  const dragRef = useRef<{ id: number } | null>(null);
  const onResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { id: e.pointerId };
    const onMove = (ev: PointerEvent) => {
      if (!dragRef.current) return;
      const next = Math.max(RAIL_MIN, Math.min(RAIL_MAX, window.innerWidth - ev.clientX));
      setRailWidth(next);
    };
    const onUp = (ev: PointerEvent) => {
      dragRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setRailWidth((w) => { writeRail('lab.rail.width', String(w)); return w; });
      void ev;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, []);

  // Live judging: the two agent lanes (② mirror, ③ tuned) gate judging; ③ is ours.
  const judgeOpts = useMemo<LiveJudgeOptions>(
    () => ({ oursPanelId: 'tuned', floorPanelId: 'mirror', expectedPanelIds: ['mirror', 'tuned'] }),
    [],
  );
  const live = useLiveJudge(submission, judgeOpts);
  const laneScores = live.data?.laneScores;
  const verdictScore = laneScores?.tuned; // ③ headline drives the chip (gate-aware tone)

  const onExport = () => {
    const transcript = buildTranscript();
    const blob = new Blob([JSON.stringify(transcript, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcript-${transcript.capturedAt.replace(/[:.]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderColumn = (config: ColumnConfig) => {
    if (config.kind === 'website') {
      return <WebsiteColumn config={config} submission={submission} />;
    }
    return (
      <AgentColumn
        config={config}
        submission={submission}
        clearSeq={clearSeq}
        register={register}
        onResult={live.report}
        score={laneScores?.[config.id]}
        onOpenAnalysis={expandRail}
        onReply={submit}
      />
    );
  };

  return (
    <div className={`lab${hasRun ? '' : ' lab--hero'}`}>
      <AppHeader hasRun={hasRun} onExport={onExport} onReset={reset} />
      {hasRun && (
        <div className="lab__topbar">
          <ComparisonKey />
          <button
            type="button"
            className="verdict-chip"
            onClick={expandRail}
            title="Open the live analysis & synthesis"
          >
            <span className="verdict-chip__icon" aria-hidden="true">⚖</span>
            {verdictScore ? (
              <span className={`verdict-chip__score ${laneTone(verdictScore)}`}>
                {verdictScore.score.toFixed(1)}<span className="verdict-chip__unit">/10</span>
              </span>
            ) : (
              <span className="verdict-chip__label">Analysis</span>
            )}
          </button>
        </div>
      )}
      <main className="lab__main">
        <div className={`lab__workspace${railOpen ? ' has-rail' : ''}`}>
          <div className="lab__panels">
            <LaneRail columns={columns} renderColumn={renderColumn} />
          </div>
          <AnalysisRail
            open={railOpen}
            pinned={railPinned}
            width={railWidth}
            onToggleOpen={toggleOpen}
            onTogglePin={togglePin}
            onResizeStart={onResizeStart}
            state={live.state}
            data={live.data}
            error={live.error}
          />
        </div>
      </main>
      <Composer onSubmit={submit} hero={!hasRun} />
    </div>
  );
}
