/**
 * QueryBar — the HERO. One input that fans a query out to all three panels.
 * Enter submits. A collapsible Sample Questions panel (all 27, grouped) sits
 * below; picking one fills the bar (the user reviews, then hits Compare).
 */
import { useRef, useState } from 'react';
import { SampleQuestions } from './SampleQuestions';

interface Props {
  onSubmit: (query: string) => void;
  hasRun: boolean;
}

export function QueryBar({ onSubmit, hasRun: _hasRun }: Props) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

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
          ref={inputRef}
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

      <SampleQuestions
        onSelect={(prompt) => {
          setValue(prompt);
          inputRef.current?.focus();
        }}
      />
    </div>
  );
}
