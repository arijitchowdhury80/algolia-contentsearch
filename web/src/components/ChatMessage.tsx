/**
 * ChatMessage — one turn in an agent lane.
 *
 * User turns: a compact right-aligned bubble.
 * Assistant turns: a left-aligned answer with four visual modes —
 *   streaming (caret), normal (grounded answer + sources),
 *   refusal (trustworthy info-blue card — the thesis, NOT an error),
 *   error (danger card — e.g. provider 401 / network).
 */
import { GroupedSources } from './GroupedSources';
import { Markdown } from './Markdown';
import type { Message } from '../types/chat';

interface Props {
  message: Message;
}

export function ChatMessage({ message }: Props) {
  if (message.role === 'user') {
    return (
      <div className="msg msg--user">
        <div className="msg__bubble msg__bubble--user">{message.content}</div>
      </div>
    );
  }

  const isError = message.sourceType === 'error';
  const isRefusal = message.refused === true;
  const streaming = message.isLoading === true;

  const variant = isError ? 'error' : isRefusal ? 'refusal' : 'answer';

  return (
    <div className="msg msg--assistant">
      <div
        className={`msg__bubble msg__bubble--${variant}`}
        aria-live={streaming ? 'polite' : undefined}
      >
        {variant === 'refusal' && (
          <span className="msg__tag msg__tag--refusal">
            <span aria-hidden="true">⛉</span> Grounded refusal
          </span>
        )}
        {variant === 'error' && (
          <span className="msg__tag msg__tag--error">
            <span aria-hidden="true">⚠</span> Unavailable
          </span>
        )}

        {streaming && !message.content ? (
          <span className="msg__thinking" aria-label="Thinking">
            <span className="dot" />
            <span className="dot" />
            <span className="dot" />
          </span>
        ) : (
          // Render Markdown live (even while streaming) so no raw `**`/`#` shows.
          <div className="msg__md">
            <Markdown text={message.content} />
            {streaming && <span className="msg__caret" aria-hidden="true" />}
          </div>
        )}

        {!streaming && message.sources && message.sources.length > 0 && (
          <GroupedSources sources={message.sources} />
        )}
      </div>
    </div>
  );
}
