/**
 * GroupedSources — citations as collapsed pills grouped by type (ADR-001 D3).
 *
 * Replaces the flat numbered SourceList. Each pill shows icon + group label +
 * count; clicking opens a popover listing that group's sources (title + summary
 * + external link). Grouping/dedup is pure logic in lib/sources.
 */
import { Popover } from './Popover';
import { groupSources, sourceSummary, sourceTitle, sourceUrl } from '../lib/sources';
import type { Source } from '../types/chat';

interface Props {
  sources: Source[];
}

export function GroupedSources({ sources }: Props) {
  const groups = groupSources(sources);
  if (groups.length === 0) return null;

  return (
    <div className="srcpills" aria-label="Sources">
      <span className="srcpills__label">Sources</span>
      <div className="srcpills__row">
        {groups.map((g) => {
          const n = g.sources.length;
          const triggerLabel = `${g.label}: ${n} source${n === 1 ? '' : 's'}`;
          return (
            <Popover
              key={g.key}
              className="srcpill"
              style={{ ['--pill-accent' as string]: `var(${g.accentVar})` }}
              triggerLabel={triggerLabel}
              label={
                <>
                  <span className="srcpill__icon" aria-hidden="true">
                    {g.icon}
                  </span>
                  <span className="srcpill__label">{g.label}</span>
                  <span className="srcpill__count">{n}</span>
                </>
              }
            >
              <ul className="srcpop__list">
                {g.sources.map((s, i) => {
                  const url = sourceUrl(s);
                  const title = sourceTitle(s);
                  const summary = sourceSummary(s);
                  return (
                    <li key={s.objectID ?? `${i}-${url ?? title}`} className="srcpop__item">
                      {url ? (
                        <a
                          className="srcpop__link"
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {title}
                        </a>
                      ) : (
                        <span className="srcpop__link srcpop__link--plain">{title}</span>
                      )}
                      {summary && <p className="srcpop__summary">{summary}</p>}
                    </li>
                  );
                })}
              </ul>
            </Popover>
          );
        })}
      </div>
    </div>
  );
}
