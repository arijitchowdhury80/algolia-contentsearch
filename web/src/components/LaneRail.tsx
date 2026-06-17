/**
 * LaneRail — horizontal-scroll rail of comparison lanes (ADR-001 D1).
 *
 * Desktop/tablet (≥768px): fixed-width lane cards in a horizontally-scrolling
 * row, so the rail scales to any number of systems (phases 2–3) without
 * squashing lanes — 3 fit on a normal screen, more scroll into view.
 * Mobile (<768px): one lane at a time via a segmented tab switcher.
 *
 * All lanes stay MOUNTED at every breakpoint (the fan-out streams into all of
 * them) — mobile only hides the inactive ones via CSS keyed off `data-active`.
 */
import { useState } from 'react';
import type { ColumnConfig } from '../config/columns';
import type { ColumnId } from '../types/chat';

interface Props {
  columns: ColumnConfig[];
  renderColumn: (config: ColumnConfig) => React.ReactNode;
}

export function LaneRail({ columns, renderColumn }: Props) {
  const [active, setActive] = useState<ColumnId>(columns[0]?.id ?? 'website');

  return (
    <div className="rail-wrap">
      <div className="rail-tabs" role="tablist" aria-label="Lanes (mobile)">
        {columns.map((c) => (
          <button
            key={c.id}
            role="tab"
            aria-selected={active === c.id}
            className={`rail-tab${active === c.id ? ' is-active' : ''}`}
            onClick={() => setActive(c.id)}
          >
            {c.title}
          </button>
        ))}
      </div>

      <div className="rail" data-active={active}>
        {columns.map((c) => (
          <div key={c.id} className="rail__cell" data-col={c.id}>
            {renderColumn(c)}
          </div>
        ))}
      </div>
    </div>
  );
}
