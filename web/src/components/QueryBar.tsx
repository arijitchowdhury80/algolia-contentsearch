/**
 * QueryBar — the HERO. One input that fans a query out to all three panels.
 * Enter submits. Example chips show until the first query runs.
 */
import { useState } from 'react';
import { EXAMPLE_QUERIES } from '../config/columns';

interface Props {
  onSubmit: (query: string) => void;
  hasRun: boolean;
}

export function QueryBar({ onSubmit, hasRun }: Props) {
  const [value, setValue] = useState('');

  const submit = () => {
    const q = value.trim();
    if (!q) return;
    onSubmit(q);
  };

  return (
    <div className="qbar">
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
          className="qbar__input"
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Ask one question — compare all three systems side by side…"
          aria-label="Query, fans out to all three panels"
          autoFocus
          enterKeyHint="search"
        />
        <button className="btn btn--primary qbar__send" type="submit" disabled={!value.trim()}>
          Compare
        </button>
      </form>

      {!hasRun && (
        <div className="qbar__examples">
          <span className="qbar__examples-label">Try</span>
          {EXAMPLE_QUERIES.map((q) => (
            <button key={q} type="button" className="chip qbar__chip" onClick={() => onSubmit(q)}>
              {q}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
