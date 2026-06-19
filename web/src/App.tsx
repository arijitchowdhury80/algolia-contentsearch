/**
 * App — 2×2 Answer-Quality Lab root.
 *
 * Layout:
 *   <AppHeader>    — brand bar + export / reset actions
 *   [Live | Leaderboard] toggle
 *   Live view:
 *     <Matrix>     — 2×2 scoreboard shell (axis labels, delta strip, winner glow)
 *       <PanelCell> × 4   — streamed answer, sources, trace, score badge
 *     <JudgeDrawer>       — score-triggered right-side drawer (pinnable, resizable)
 *   Leaderboard view:
 *     <Leaderboard>       — batch aggregate (no data → empty state)
 *   <Composer>     — persistent bottom bar / hero input
 *
 * Data flow:
 *   useComparison  — shared submission + reset + transcript
 *   usePanelAnswers — fans one /api/answer SSE into P1–P4 state
 *   usePanelJudge  — calls /api/judge once all 4 panels answer; maps old
 *                    JudgeVerdict shape → PanelJudgeResult for JudgeDrawer
 */

import { useState, useCallback, useRef, useEffect } from 'react';

import { AppHeader } from './components/AppHeader';
import { Composer } from './components/Composer';
import { Matrix } from './components/Matrix';
import type { PanelStatus } from './components/Matrix';
import { PanelCell } from './components/PanelCell';
import type { PanelLifecycle } from './components/PanelCell';
import { JudgeDrawer } from './components/JudgeDrawer';
import { Leaderboard } from './components/Leaderboard';
import type { LeaderboardData } from './components/Leaderboard';

import { useComparison } from './hooks/useComparison';
import { usePanelAnswers } from './hooks/usePanelAnswers';

import { panelConfigById } from './config/columns';
import type { PanelId, PanelJudgeResult, CrossPanelDeltas, VerdictDims, AnswerSource } from './types/chat';
import { streamJudge } from './lib/judgeClient';
import type { JudgeVerdict } from './lib/judgeClient';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PANEL_IDS: PanelId[] = ['P1', 'P2', 'P3', 'P4'];
const DRAWER_WIDTH_DEFAULT = 380;
const DRAWER_WIDTH_MIN = 280;
const DRAWER_WIDTH_MAX = 640;

// ---------------------------------------------------------------------------
// JudgeVerdict → PanelJudgeResult mapping
// The old judgeClient shape uses different field names; map them here once
// so the JudgeDrawer receives the canonical types/chat.ts contract.
// ---------------------------------------------------------------------------

function mapVerdictToDims(dimensions: JudgeVerdict['dimensions']): VerdictDims {
  const get = (id: string) => dimensions.find((d) => d.id === id)?.score ?? 0;
  return {
    grounding: get('grounding'),
    confidence: get('confidence'),
    breadthDepth: get('breadth_depth'),
  };
}

function mapVerdict(v: JudgeVerdict): PanelJudgeResult {
  return {
    panelId: v.panelId,
    perJudge: (v.judges ?? []).map((j) => ({
      role: j.role as 'skeptic' | 'referee' | 'advocate',
      score: j.score,
      note: j.note,
    })),
    dims: mapVerdictToDims(v.dimensions ?? []),
    composite: v.synthesizedScore,
    preGateScore: v.preGateScore,
    gateTripped: v.gateTripped,
    borderline: v.borderline,
    flaggedClaims: (v.violations ?? []).map((viol) => ({
      claim: viol.claim,
      reason: viol.reason,
      confidence: viol.confidence,
    })),
    rationale: v.rationale,
    ...(v.error ? { error: v.error } : {}),
  };
}

/** Derive cross-panel deltas from four composites. */
function deriveDeltas(
  judges: Partial<Record<PanelId, PanelJudgeResult>>,
): CrossPanelDeltas | undefined {
  const s = (id: PanelId) => judges[id]?.composite;
  const p1 = s('P1'), p2 = s('P2'), p3 = s('P3'), p4 = s('P4');
  if (p1 === undefined && p2 === undefined && p3 === undefined && p4 === undefined) {
    return undefined;
  }
  return {
    multiLift: {
      ...(p2 !== undefined && p1 !== undefined ? { keyword: p2 - p1 } : {}),
      ...(p4 !== undefined && p3 !== undefined ? { neural: p4 - p3 } : {}),
    },
    neuralLift: {
      ...(p3 !== undefined && p1 !== undefined ? { single: p3 - p1 } : {}),
      ...(p4 !== undefined && p2 !== undefined ? { multi: p4 - p2 } : {}),
    },
    ...(p4 !== undefined && p1 !== undefined ? { compound: p4 - p1 } : {}),
  };
}

// ---------------------------------------------------------------------------
// usePanelJudge — calls /api/judge once all 4 panels have answered.
// Returns per-panel PanelJudgeResult and cross-panel deltas.
// ---------------------------------------------------------------------------

type JudgeState = 'idle' | 'judging' | 'done' | 'error';

interface PanelJudgeApi {
  judgeState: JudgeState;
  panelJudge: Partial<Record<PanelId, PanelJudgeResult>>;
  deltas: CrossPanelDeltas | undefined;
  judgeMs: number | null;
  judgeError: string | undefined;
}

function usePanelJudge(
  question: string | null,
  /** All four panels must be in 'done' state for judging to fire. */
  panelsDone: boolean,
  panelSources: Partial<Record<PanelId, AnswerSource[]>>,
  panelAnswers: Partial<Record<PanelId, string>>,
  submissionSeq: number,
): PanelJudgeApi {
  const [judgeState, setJudgeState] = useState<JudgeState>('idle');
  const [panelJudge, setPanelJudge] = useState<Partial<Record<PanelId, PanelJudgeResult>>>({});
  const [deltas, setDeltas] = useState<CrossPanelDeltas | undefined>();
  const [judgeMs, setJudgeMs] = useState<number | null>(null);
  const [judgeError, setJudgeError] = useState<string | undefined>();

  // Seq guard — drop results from a superseded submission.
  const seqRef = useRef(-1);

  useEffect(() => {
    // Reset on new submission or reset (seq === -1 when submission is null).
    if (submissionSeq !== seqRef.current) {
      setJudgeState('idle');
      setPanelJudge({});
      setDeltas(undefined);
      setJudgeMs(null);
      setJudgeError(undefined);
      seqRef.current = submissionSeq;
    }
  }, [submissionSeq]);

  useEffect(() => {
    if (!panelsDone || !question || judgeState !== 'idle') return;
    // All 4 panels answered — fire the judge.
    const firedSeq = seqRef.current;
    const t0 = performance.now();
    setJudgeState('judging');

    const panels = PANEL_IDS.map((id) => ({
      panelId: id,
      answer: panelAnswers[id] ?? '',
      sources: (panelSources[id] ?? []).map((s) => ({
        title: s.title,
        url: s.url,
        text: s.source, // best grounding text available from answer payload
      })),
    }));

    streamJudge({ question, panels })
      .then((result) => {
        if (seqRef.current !== firedSeq) return;
        const judged: Partial<Record<PanelId, PanelJudgeResult>> = {};
        for (const v of result.panels) {
          const pid = v.panelId as PanelId;
          if (PANEL_IDS.includes(pid)) {
            judged[pid] = mapVerdict(v);
          }
        }
        setPanelJudge(judged);
        setDeltas(deriveDeltas(judged));
        setJudgeMs(Math.round(performance.now() - t0));
        setJudgeState('done');
      })
      .catch((e: unknown) => {
        if (seqRef.current !== firedSeq) return;
        setJudgeError(e instanceof Error ? e.message : String(e));
        setJudgeMs(Math.round(performance.now() - t0));
        setJudgeState('error');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelsDone, question, judgeState]);

  return { judgeState, panelJudge, deltas, judgeMs, judgeError };
}

// ---------------------------------------------------------------------------
// Resize hook for JudgeDrawer
// ---------------------------------------------------------------------------

function useDrawerResize(
  drawerOpen: boolean,
  initialWidth = DRAWER_WIDTH_DEFAULT,
) {
  const [width, setWidth] = useState(initialWidth);
  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWRef = useRef(initialWidth);

  const onResizeStart = useCallback((e: React.PointerEvent) => {
    if (!drawerOpen) return;
    draggingRef.current = true;
    startXRef.current = e.clientX;
    startWRef.current = width;
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [drawerOpen, width]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      const delta = startXRef.current - e.clientX; // drag left = wider
      setWidth(Math.min(DRAWER_WIDTH_MAX, Math.max(DRAWER_WIDTH_MIN, startWRef.current + delta)));
    };
    const onUp = () => { draggingRef.current = false; };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  return { width, onResizeStart };
}

// ---------------------------------------------------------------------------
// Panel lifecycle mapper
// Converts the answer hook status + judge state into the PanelStatus enum
// that Matrix uses (for winner glow / score placeholder) and the PanelLifecycle
// enum that PanelCell uses (for body states).
// ---------------------------------------------------------------------------

function toPanelStatus(
  answerStatus: 'idle' | 'streaming' | 'done' | 'error',
  judgeState: JudgeState,
  hasJudge: boolean,
): PanelStatus {
  if (answerStatus === 'idle') return 'idle';
  if (answerStatus === 'streaming') return 'streaming';
  if (answerStatus === 'error') return 'error';
  // done
  if (hasJudge) return 'judged';
  if (judgeState === 'judging') return 'judging';
  return 'answered';
}

function toLifecycle(
  answerStatus: 'idle' | 'streaming' | 'done' | 'error',
  answer: string,
  judgeState: JudgeState,
  hasJudge: boolean,
): PanelLifecycle {
  if (answerStatus === 'idle') return 'idle';
  if (answerStatus === 'error') return 'error';
  if (answerStatus === 'streaming') return 'streaming';
  // done — check for grounded refusal (very short answer with refusal markers)
  const isRefusal =
    answer.length < 300 &&
    (answer.toLowerCase().includes('i don') ||
     answer.toLowerCase().includes('not able') ||
     answer.toLowerCase().includes('cannot find') ||
     answer.toLowerCase().includes('no information'));
  if (isRefusal) return 'refused';
  if (hasJudge) return 'judged';
  if (judgeState === 'judging') return 'judging';
  return 'answered';
}

// ---------------------------------------------------------------------------
// Transcript export
// ---------------------------------------------------------------------------

function buildTranscriptJson(
  question: string,
  panelAnswers: Partial<Record<PanelId, string>>,
  panelJudge: Partial<Record<PanelId, PanelJudgeResult>>,
): string {
  return JSON.stringify(
    {
      capturedAt: new Date().toISOString(),
      question,
      panels: PANEL_IDS.map((id) => ({
        panelId: id,
        answer: panelAnswers[id] ?? '',
        judge: panelJudge[id] ?? null,
      })),
    },
    null,
    2,
  );
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

type ActiveView = 'live' | 'leaderboard';

export default function App() {
  // ── Shared submission state ──────────────────────────────────────────────
  const comparison = useComparison();
  const { submission, hasRun, submit, reset } = comparison;

  // ── Answer streaming ─────────────────────────────────────────────────────
  const { panels } = usePanelAnswers(submission);

  // Convenience: all 4 panels done (regardless of error) — gate for judging.
  const allPanelsDone = PANEL_IDS.every(
    (id) => panels[id].status === 'done' || panels[id].status === 'error',
  );
  // At least 1 panel has a real answer — required for judging to be meaningful.
  const anyPanelAnswered = PANEL_IDS.some(
    (id) => panels[id].status === 'done' && panels[id].answer.trim().length > 0,
  );

  // ── Judging ──────────────────────────────────────────────────────────────
  const panelAnswersMap: Partial<Record<PanelId, string>> = {};
  const panelSourcesMap: Partial<Record<PanelId, AnswerSource[]>> = {};
  for (const id of PANEL_IDS) {
    panelAnswersMap[id] = panels[id].answer;
    panelSourcesMap[id] = panels[id].sources;
  }

  const { judgeState, panelJudge, deltas, judgeMs } = usePanelJudge(
    submission?.query ?? null,
    allPanelsDone && anyPanelAnswered,
    panelSourcesMap,
    panelAnswersMap,
    submission?.seq ?? -1,
  );

  // ── Judge Drawer state ───────────────────────────────────────────────────
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerPinned, setDrawerPinned] = useState(false);
  const [selectedPanelId, setSelectedPanelId] = useState<PanelId | null>(null);
  const { width: drawerWidth, onResizeStart } = useDrawerResize(drawerOpen);

  const openJudge = useCallback((id: PanelId) => {
    setSelectedPanelId(id);
    setDrawerOpen(true);
  }, []);

  const toggleDrawer = useCallback(() => {
    if (!drawerPinned) setDrawerOpen((o) => !o);
  }, [drawerPinned]);

  const togglePin = useCallback(() => {
    setDrawerPinned((p) => !p);
  }, []);

  // ── View toggle ──────────────────────────────────────────────────────────
  const [activeView, setActiveView] = useState<ActiveView>('live');

  // ── Leaderboard data (not yet implemented — always empty) ─────────────────
  const leaderboardData: LeaderboardData | null = null;

  // ── Export ───────────────────────────────────────────────────────────────
  const handleExport = useCallback(() => {
    if (!submission) return;
    const json = buildTranscriptJson(submission.query, panelAnswersMap, panelJudge);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lab-transcript-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [submission, panelAnswersMap, panelJudge]);

  // ── Reset ────────────────────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    reset();
    if (!drawerPinned) setDrawerOpen(false);
    setSelectedPanelId(null);
  }, [reset, drawerPinned]);

  // ── Leaderboard question drill-down (re-runs the question in Live view) ──
  const handleOpenQuestion = useCallback((_qid: string) => {
    // In the future: load the batch transcript for this qid. For now, switch
    // to Live view so the user can manually ask the question again.
    setActiveView('live');
  }, []);

  // ── Composer hero mode ───────────────────────────────────────────────────
  const isHero = !hasRun;

  // ── Matrix panel status map ──────────────────────────────────────────────
  const matrixPanelStatus = Object.fromEntries(
    PANEL_IDS.map((id) => [
      id,
      toPanelStatus(panels[id].status, judgeState, !!panelJudge[id]),
    ]),
  ) as Record<PanelId, PanelStatus>;

  // ── Selected panel data for the JudgeDrawer ──────────────────────────────
  const drawerVerdict = selectedPanelId ? panelJudge[selectedPanelId] : undefined;
  const drawerPanelData = selectedPanelId
    ? {
        answer: panels[selectedPanelId].answer,
        sources: panels[selectedPanelId].sources,
        timing: panels[selectedPanelId].timing!,
        ...(panels[selectedPanelId].followUp
          ? { followUp: panels[selectedPanelId].followUp }
          : {}),
        ...(panels[selectedPanelId].trace
          ? { trace: panels[selectedPanelId].trace }
          : {}),
      }
    : undefined;
  const drawerPanelConfig = selectedPanelId ? panelConfigById(selectedPanelId) : undefined;

  return (
    <div className="lab">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <AppHeader hasRun={hasRun} onExport={handleExport} onReset={handleReset} />

      {/* ── View toggle ─────────────────────────────────────────────────── */}
      <div className="lab__toggle-bar" role="tablist" aria-label="Lab view">
        <button
          type="button"
          role="tab"
          className={`lab__toggle-btn${activeView === 'live' ? ' is-active' : ''}`}
          aria-selected={activeView === 'live'}
          onClick={() => setActiveView('live')}
        >
          Live
        </button>
        <button
          type="button"
          role="tab"
          className={`lab__toggle-btn${activeView === 'leaderboard' ? ' is-active' : ''}`}
          aria-selected={activeView === 'leaderboard'}
          onClick={() => setActiveView('leaderboard')}
        >
          Leaderboard
        </button>
      </div>

      {/* ── Main content area ────────────────────────────────────────────── */}
      <main className={`lab__main${drawerOpen ? ' lab__main--drawer-open' : ''}`}>
        {activeView === 'live' ? (
          /* Live view: Matrix + JudgeDrawer */
          <div className="lab__live">
            <div
              className="lab__matrix-wrap"
              style={drawerOpen ? { marginRight: `${drawerWidth}px` } : undefined}
            >
              <Matrix
                panelJudge={panelJudge}
                deltas={deltas}
                panelStatus={matrixPanelStatus}
                onOpenJudge={openJudge}
              >
                {PANEL_IDS.map((id) => {
                  const p = panels[id];
                  const lifecycle = toLifecycle(
                    p.status,
                    p.answer,
                    judgeState,
                    !!panelJudge[id],
                  );
                  return (
                    <PanelCell
                      key={id}
                      config={panelConfigById(id)}
                      lifecycle={lifecycle}
                      answer={p.answer}
                      result={
                        p.status === 'done' && p.timing
                          ? {
                              answer: p.answer,
                              sources: p.sources,
                              timing: p.timing,
                              ...(p.followUp ? { followUp: p.followUp } : {}),
                              ...(p.trace ? { trace: p.trace } : {}),
                              ...(p.error ? { error: p.error } : {}),
                            }
                          : undefined
                      }
                      judge={panelJudge[id]}
                      isWinner={
                        judgeState === 'done' &&
                        !!panelJudge[id] &&
                        PANEL_IDS.every(
                          (oid) =>
                            !panelJudge[oid] ||
                            (panelJudge[id]?.composite ?? -1) >=
                              (panelJudge[oid]?.composite ?? -1),
                        )
                      }
                      error={p.error}
                      onOpenJudge={() => openJudge(id)}
                      onOpenSources={() => openJudge(id)}
                      onOpenTrace={() => openJudge(id)}
                      onOpenWhy={() => openJudge(id)}
                    />
                  );
                }) as [React.ReactNode, React.ReactNode, React.ReactNode, React.ReactNode]}
              </Matrix>
            </div>

            {/* JudgeDrawer — slides in from the right */}
            <JudgeDrawer
              open={drawerOpen}
              pinned={drawerPinned}
              width={drawerWidth}
              onToggleOpen={toggleDrawer}
              onTogglePin={togglePin}
              onResizeStart={onResizeStart}
              panelVerdict={drawerVerdict}
              panelData={drawerPanelData}
              panelConfig={drawerPanelConfig}
              deltas={deltas}
              mode="live"
              judgeMs={judgeMs}
            />
          </div>
        ) : (
          /* Leaderboard view */
          <Leaderboard data={leaderboardData} onOpenQuestion={handleOpenQuestion} />
        )}
      </main>

      {/* ── Composer — hero before first run, docked bottom bar after ─────── */}
      <Composer onSubmit={submit} hero={isHero} />

      {/* ── Scoped layout styles ─────────────────────────────────────────── */}
      <style>{`
/* ── Lab shell ── */
.lab {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: var(--bg-canvas);
  position: relative;
}

/* ── View toggle bar ── */
.lab__toggle-bar {
  display: flex;
  align-items: center;
  gap: 0;
  padding: 0 24px;
  background: var(--bg-page);
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
}
.lab__toggle-btn {
  position: relative;
  padding: 12px 20px;
  border: 0;
  background: transparent;
  font-family: var(--font-body);
  font-size: var(--fs-body-sm);
  font-weight: 600;
  color: var(--fg3);
  cursor: pointer;
  transition: color var(--dur-fast) var(--ease-out);
}
.lab__toggle-btn:hover { color: var(--fg2); }
.lab__toggle-btn.is-active { color: var(--algolia-blue); }
.lab__toggle-btn.is-active::after {
  content: '';
  position: absolute;
  bottom: -1px;
  left: 20px;
  right: 20px;
  height: 2px;
  background: var(--algolia-blue);
  border-radius: 2px 2px 0 0;
}

/* ── Main content ── */
.lab__main {
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
  /* leave room for the docked Composer */
  padding-bottom: 80px;
}
.lab__main--drawer-open {
  /* drawer is positioned absolute/fixed; main doesn't shift */
}

/* ── Live view ── */
.lab__live {
  display: flex;
  flex-direction: row;
  flex: 1;
  position: relative;
  min-height: 0;
}

/* ── Matrix wrapper — shrinks when the drawer opens ── */
.lab__matrix-wrap {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  transition: margin-right var(--dur-fast) var(--ease-out);
}

/* ── JudgeDrawer positioning (fixed to the right edge) ── */
.arail {
  position: fixed;
  top: 0;
  right: 0;
  height: 100vh;
  z-index: 200;
  display: flex;
  flex-direction: column;
  background: var(--bg-page);
  border-left: 1px solid var(--border-subtle);
  box-shadow: -4px 0 24px rgba(0,0,0,0.08);
  overflow: hidden;
}
.arail--collapsed {
  width: auto !important;
  height: auto;
  top: 50%;
  transform: translateY(-50%);
  border-radius: var(--radius-md) 0 0 var(--radius-md);
  box-shadow: -2px 0 12px rgba(0,0,0,0.06);
}
      `}</style>
    </div>
  );
}
