/**
 * App — the Answer-Quality Lab.
 *
 * One query bar fans out to a full-height horizontal lane rail (ADR-001 D1):
 * ① Current Website Search, ② Ask AI, ③ Our System (and N more in later phases).
 * Each judged lane shows its always-visible verdict score pill (D2); the full
 * analysis (judges + config diff + synthesis) opens on demand in a right drawer,
 * triggered by the header verdict chip or any lane's ⚖ pill. Panels own their own
 * threads; this shell only holds the shared submission/reset signals, the live
 * judge wiring, and the transcript export (eval tie-in, §10).
 */
import { useMemo, useState } from 'react';
import { buildColumns, type ColumnConfig } from './config/columns';
import { useComparison } from './hooks/useComparison';
import { useLiveJudge, type LiveJudgeOptions } from './hooks/useLiveJudge';
import { AppHeader } from './components/AppHeader';
import { Composer } from './components/Composer';
import { ComparisonKey } from './components/ComparisonKey';
import { LaneRail } from './components/LaneRail';
import { WebsiteColumn } from './components/WebsiteColumn';
import { AgentColumn } from './components/AgentColumn';
import { AnalysisDrawer } from './components/AnalysisDrawer';
import { laneTone } from './lib/score';

export default function App() {
  // Built once; throws loudly at startup if any VITE_* var is missing.
  const columns = useMemo(() => buildColumns(), []);
  const { submission, clearSeq, hasRun, submit, reset, register, buildTranscript } = useComparison();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const openDrawer = () => setDrawerOpen(true);

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
        onOpenAnalysis={openDrawer}
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
            onClick={openDrawer}
            aria-haspopup="dialog"
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
        <div className="lab__panels">
          <LaneRail columns={columns} renderColumn={renderColumn} />
        </div>
      </main>
      <Composer onSubmit={submit} hero={!hasRun} />
      <AnalysisDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        state={live.state}
        data={live.data}
        error={live.error}
      />
    </div>
  );
}
