/**
 * FollowUpCallout — elevates an agent's two-way clarifying question out of the
 * answer prose into a distinct accented block (ADR-001 D4). Quick-reply chips
 * (when cleanly extractable) and a typed reply both go to ALL lanes via onReply,
 * advancing the shared conversation. Pure presentation; detection is followup.ts.
 */
import type { FollowUp } from '../lib/followup';

interface Props {
  followUp: FollowUp;
  /** Send a reply to every lane (the shared comparison submit). */
  onReply?: (text: string) => void;
}

export function FollowUpCallout({ followUp, onReply }: Props) {
  return (
    <div className="followup" role="note" aria-label="The system is asking a follow-up">
      <div className="followup__head">
        <span className="followup__icon" aria-hidden="true">🤔</span>
        <span className="followup__label">This system is asking a follow-up</span>
      </div>
      <p className="followup__q">{followUp.question}</p>
      {followUp.replies.length > 0 && (
        <div className="followup__chips" role="group" aria-label="Quick replies">
          {followUp.replies.map((r) => (
            <button
              key={r}
              type="button"
              className="followup__chip"
              onClick={() => onReply?.(r)}
              disabled={!onReply}
            >
              {r}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
