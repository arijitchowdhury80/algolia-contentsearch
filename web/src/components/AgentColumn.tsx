/** AgentColumn — a streaming agent chat lane (cols 2–4). */
import { useEffect, useRef } from 'react';
import { useAgentColumn } from '../hooks/useAgentColumn';
import { ColumnHeader, type StatusTone } from './ColumnHeader';
import { ChatMessage } from './ChatMessage';
import type { AgentColumnConfig } from '../config/columns';
import type { Submission } from '../hooks/useComparison';
import type { LaneSnapshot } from '../hooks/useComparison';

interface Props {
  config: AgentColumnConfig;
  submission: Submission | null;
  clearSeq: number;
  register: (id: AgentColumnConfig['id'], get: () => LaneSnapshot) => () => void;
}

export function AgentColumn({ config, submission, clearSeq, register }: Props) {
  const { messages, status } = useAgentColumn({ config, submission, clearSeq, register });

  // Autoscroll to the latest turn while streaming.
  const threadRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const last = messages[messages.length - 1];
  const refused = last?.role === 'assistant' && last.refused === true;

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

  return (
    <section className="lane" aria-label={`${config.title} lane`}>
      <ColumnHeader config={config} statusTone={tone} statusLabel={label} />
      <div className="lane__thread" ref={threadRef}>
        {messages.length === 0 ? (
          <div className="lane__empty">
            <p>Answers stream here.</p>
            <span>Ask a question above to compare this agent.</span>
          </div>
        ) : (
          messages.map((m) => <ChatMessage key={m.id} message={m} />)
        )}
      </div>
    </section>
  );
}
