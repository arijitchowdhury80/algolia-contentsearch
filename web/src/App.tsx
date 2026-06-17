/**
 * App — the Answer-Quality Lab.
 *
 * One query bar fans out to three panels (top 60%): ① Current Website Search,
 * ② Ask AI, ③ Our System. Below them (bottom 40%) sits the Analysis & Synthesis
 * panel (judges + config diff + synthesis). Panels own their own threads; this
 * shell only holds the shared submission/reset signals and the transcript export
 * (eval tie-in, §10).
 */
import { useMemo } from 'react';
import { buildColumns, type ColumnConfig } from './config/columns';
import { useComparison } from './hooks/useComparison';
import { useLiveJudge, type LiveJudgeOptions } from './hooks/useLiveJudge';
import { AppHeader } from './components/AppHeader';
import { QueryBar } from './components/QueryBar';
import { ComparisonKey } from './components/ComparisonKey';
import { LaneRail } from './components/LaneRail';
import { WebsiteColumn } from './components/WebsiteColumn';
import { AgentColumn } from './components/AgentColumn';
import { AnalysisPanel } from './components/AnalysisPanel';

export default function App() {
  // Built once; throws loudly at startup if any VITE_* var is missing.
  const columns = useMemo(() => buildColumns(), []);
  const { submission, clearSeq, hasRun, submit, reset, register, buildTranscript } = useComparison();

  // Live judging: the two agent lanes (② mirror, ③ tuned) gate judging; ③ is ours.
  const judgeOpts = useMemo<LiveJudgeOptions>(
    () => ({ oursPanelId: 'tuned', floorPanelId: 'mirror', expectedPanelIds: ['mirror', 'tuned'] }),
    [],
  );
  const live = useLiveJudge(submission, judgeOpts);

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
      />
    );
  };

  return (
    <div className="lab">
      <AppHeader hasRun={hasRun} onExport={onExport} onReset={reset} />
      <div className="lab__qbar">
        <QueryBar onSubmit={submit} hasRun={hasRun} />
        <ComparisonKey />
      </div>
      <main className="lab__main">
        <div className="lab__panels">
          <LaneRail columns={columns} renderColumn={renderColumn} />
        </div>
        <div className="lab__analysis">
          <AnalysisPanel state={live.state} data={live.data} error={live.error} />
        </div>
      </main>
    </div>
  );
}
