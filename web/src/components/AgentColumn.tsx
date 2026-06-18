/** AgentColumn — a streaming agent chat lane (cols 2–4). */
import { useEffect, useRef } from 'react';
import { useAgentColumn, type AgentResult } from '../hooks/useAgentColumn';
import { ColumnHeader, type StatusTone } from './ColumnHeader';
import { ChatMessage } from './ChatMessage';
import { FollowUpCallout } from './FollowUpCallout';
import { detectFollowUp } from '../lib/followup';
import { useElapsed } from '../hooks/useElapsed';
import { formatMs } from '../lib/time';
import type { AgentColumnConfig } from '../config/columns';
import type { Submission } from '../hooks/useComparison';
import type { LaneSnapshot } from '../hooks/useComparison';
import type { LaneScore } from '../lib/score';

interface Props {
  config: AgentColumnConfig;
  submission: Submission | null;
  clearSeq: number;
  register: (id: AgentColumnConfig['id'], get: () => LaneSnapshot) => () => void;
  onResult?: (result: AgentResult) => void;
  /** Live verdict for this lane (drives the header score pill). */
  score?: LaneScore;
  /** Opens the analysis drawer from this lane's ⚖ score pill. */
  onOpenAnalysis?: () => void;
  /** Send a follow-up reply to ALL lanes (the shared comparison submit). */
  onReply?: (text: string) => void;
}

export function AgentColumn({ config, submission, clearSeq, register, onResult, score, onOpenAnalysis, onReply }: Props) {
  const { messages, status, startedAt, elapsedMs } = useAgentColumn({ config, submission, clearSeq, register, onResult });
  const liveMs = useElapsed(startedAt, status === 'streaming');

  // Autoscroll to the latest turn while streaming.
  const threadRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const last = messages[messages.length - 1];
  const refused = last?.role === 'assistant' && last.refused === true;

  // Surface a two-way clarifying question from the latest SETTLED assistant turn.
  // The role/isLoading guard is load-bearing: it ensures the callout only reflects
  // a finished assistant answer, so an old follow-up vanishes the instant a new turn
  // starts (the new user msg + assistant placeholder are appended atomically). When
  // multiple lanes each end in a question, each shows its own callout by design —
  // any reply (chip or composer) fans out to all lanes (ADR-001 shared-turn model).
  const followUp =
    last?.role === 'assistant' && !last.isLoading && last.sourceType !== 'error'
      ? detectFollowUp(last.content)
      : null;

  let tone: StatusTone = 'idle';
  let label = 'Ready';
  if (status === 'streaming') {
    tone = 'warn';
    label = 'Streaming…';
  } else if (status === 'error') {
    tone = 'danger';
    label = 'Unavailable';
  } else if (status === 'done') {
    tone = refused ? 'info' : 'success';
    label = refused ? 'Refused (grounded)' : 'Answered';
  }

  // Always-visible "time taken": ticks live while streaming, freezes on finish.
  const shownMs = status === 'streaming' ? liveMs : elapsedMs;
  if (shownMs != null && status !== 'idle') label = `${label} · ${formatMs(shownMs)}`;

  return (
    <section className="lane" aria-label={`${config.title} lane`}>
      <ColumnHeader
        config={config}
        statusTone={tone}
        statusLabel={label}
        score={score}
        onOpenAnalysis={onOpenAnalysis}
      />
      <div className="lane__thread" ref={threadRef}>
        {messages.length === 0 ? (
          <div className="lane__empty">
            <p>Answers stream here.</p>
            <span>Ask a question above to compare this agent.</span>
          </div>
        ) : (
          <>
            {messages.map((m) => <ChatMessage key={m.id} message={m} />)}
            {followUp && <FollowUpCallout followUp={followUp} onReply={onReply} />}
          </>
        )}
      </div>
    </section>
  );
}
