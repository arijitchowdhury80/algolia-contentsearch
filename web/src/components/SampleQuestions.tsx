/**
 * SampleQuestions — collapsed pill (≈1 line) that expands to a grouped panel of
 * all 27 locked questions across 8 categories. Click a question → fills the query
 * bar (via onSelect) and collapses. Default collapsed so it costs almost no screen
 * real estate; the expanded panel overlays (absolute) so it never pushes the
 * comparison panels around.
 */
import { useState } from 'react';
import { SAMPLE_CATEGORIES, SAMPLE_QUESTION_COUNT } from '../config/sampleQuestions';

interface Props {
  /** Fill the query bar with the chosen question's full prompt. */
  onSelect: (prompt: string) => void;
  /** Start expanded (used by tests / optional callers). */
  defaultOpen?: boolean;
}

export function SampleQuestions({ onSelect, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="sampleq">
      <button
        type="button"
        className="sampleq__toggle"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="sampleq__spark" aria-hidden="true">✦</span>
        Sample questions
        <span className="sampleq__count">{SAMPLE_QUESTION_COUNT}</span>
        <span className={`sampleq__chev ${open ? 'is-open' : ''}`} aria-hidden="true">⌄</span>
      </button>

      {open && (
        <div className="sampleq__panel" role="region" aria-label="Sample questions by category">
          {SAMPLE_CATEGORIES.map((cat) => (
            <div
              key={cat.key}
              className="sampleq__cat"
              style={{ ['--cat-accent' as string]: `var(${cat.accent})` }}
            >
              <div className="sampleq__cat-head">
                <span className="sampleq__cat-label">{cat.label}</span>
                <span className="sampleq__cat-desc">{cat.descriptor}</span>
              </div>
              <ul className="sampleq__list">
                {cat.questions.map((q) => (
                  <li key={q.id}>
                    <button
                      type="button"
                      className="sampleq__q"
                      title={q.followUp ? `${q.prompt} → ${q.followUp}` : q.prompt}
                      onClick={() => {
                        onSelect(q.prompt);
                        setOpen(false);
                      }}
                    >
                      {q.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
