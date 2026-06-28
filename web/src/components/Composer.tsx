/**
 * Composer — the persistent conversation input (ADR-001 D4).
 *
 * Sends each turn to EVERY lane at once (the shared comparison submit) — every
 * system gets the identical conversation, so the comparison stays fair. The
 * Agent Studio completions endpoint is conversation-native (replays history each
 * turn), so multi-turn is already wired upstream; this is the surfacing.
 *
 * Two presentations driven by `hero`:
 *   hero  (no run yet) — a centered hero: heading + large input + Sample Questions.
 *   docked (after the first turn) — a slim persistent bottom bar ("Ask a follow-up").
 */
import { useEffect, useRef, useState } from 'react';
import { SampleQuestions } from './SampleQuestions';

interface Props {
  onSubmit: (query: string) => void;
  /** True before the first turn — render the centered hero; false → docked top bar. */
  hero: boolean;
  /** The currently-submitted question. Kept in the field so it's never lost. */
  value?: string;
}

export function Composer({ onSubmit, hero, value: external = '' }: Props) {
  const [value, setValue] = useState(external);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep the field in sync with the live submission (and clear it on reset) so
  // the question you asked stays visible in the one place you ask it.
  useEffect(() => {
    setValue(external);
  }, [external]);

  // Refocus the input when docking after the first turn so follow-ups flow.
  useEffect(() => {
    if (!hero) inputRef.current?.focus();
  }, [hero]);

  const submit = () => {
    const q = value.trim();
    if (!q) return;
    onSubmit(q);
    // Keep the question in the field — it doubles as the "what was asked" label.
  };

  return (
    <div className={`composer${hero ? ' is-hero' : ' is-docked'}`}>
      <div className="composer__inner">
        {hero && (
          <div className="composer__hero-head">
            <h2 className="composer__hero-title">One question → four systems</h2>
            <p className="composer__hero-sub">
              Ask once. The same question fans out across our system's four configurations —
              single vs multi-agent, keyword vs neural — then the AI judge scores each answer head-to-head.
            </p>
          </div>
        )}

        <div className={`composer__row${hero ? '' : ' composer__row--docked'}`}>
          {!hero && (
            <SampleQuestions
              onSelect={(prompt) => {
                setValue(prompt);
                inputRef.current?.focus();
              }}
            />
          )}
          <form
            className="qbar__form"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            role="search"
          >
            <span className="qbar__icon" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </span>
            <input
              ref={inputRef}
              className="qbar__input"
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={
                hero
                  ? 'Ask one question — compare all four systems side by side…'
                  : 'Ask a follow-up — goes to all four systems…'
              }
              aria-label="Query, fans out to all four panels"
              autoFocus
              enterKeyHint="search"
            />
            <button className="btn btn--primary qbar__send" type="submit" disabled={!value.trim()}>
              {hero ? 'Compare' : 'Send'}
            </button>
          </form>
        </div>

        {hero && (
          <SampleQuestions
            onSelect={(prompt) => {
              setValue(prompt);
              inputRef.current?.focus();
            }}
          />
        )}
      </div>
    </div>
  );
}
