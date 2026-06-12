/**
 * ColumnGrid — responsive container for the four lanes.
 *
 * Desktop (≥1024px): 4-up.  Tablet (768px): 2×2.  Mobile (<768px): one lane at
 * a time with a segmented tab switcher. All four lanes stay MOUNTED at every
 * breakpoint (so the fan-out streams into all of them) — mobile only hides the
 * inactive ones via CSS keyed off `data-active`.
 */
import { useState } from 'react';
import type { ColumnConfig } from '../config/columns';
import type { ColumnId } from '../types/chat';

interface Props {
  columns: ColumnConfig[];
  renderColumn: (config: ColumnConfig) => React.ReactNode;
}

export function ColumnGrid({ columns, renderColumn }: Props) {
  const [active, setActive] = useState<ColumnId>(columns[0]?.id ?? 'keyword');

  return (
    <div className="grid-wrap">
      <div className="grid-tabs" role="tablist" aria-label="Lanes (mobile)">
        {columns.map((c) => (
          <button
            key={c.id}
            role="tab"
            aria-selected={active === c.id}
            className={`grid-tab${active === c.id ? ' is-active' : ''}`}
            onClick={() => setActive(c.id)}
          >
            {c.title}
          </button>
        ))}
      </div>

      <div className="grid" data-active={active}>
        {columns.map((c) => (
          <div key={c.id} className="grid__cell" data-col={c.id}>
            {renderColumn(c)}
          </div>
        ))}
      </div>
    </div>
  );
}
