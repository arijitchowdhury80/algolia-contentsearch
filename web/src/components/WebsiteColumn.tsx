/**
 * WebsiteColumn — ① "Current Website Search".
 *
 * Browser-direct: queries the incumbent app/index (the same one algolia.com's
 * header search uses) over the public Algolia search API with a search-only key,
 * and renders the top keyword hits + links — the "old-world reference" vs ②/③'s
 * answers. No backend; works on the deployed app.
 */
import { useMemo } from 'react';
import { ColumnHeader, type StatusTone } from './ColumnHeader';
import type { WebsiteColumnConfig } from '../config/columns';
import type { Submission } from '../hooks/useComparison';
import { useWebsiteColumn, type WebsiteState } from '../hooks/useWebsiteColumn';
import type { IncumbentConfig } from '../lib/incumbentSearch';

interface Props {
  config: WebsiteColumnConfig;
  submission: Submission | null;
}

const STATUS: Record<WebsiteState, { tone: StatusTone; label: string }> = {
  idle: { tone: 'info', label: 'Live keyword search' },
  loading: { tone: 'info', label: 'Searching…' },
  done: { tone: 'success', label: 'Results' },
  error: { tone: 'danger', label: 'Error' },
};

export function WebsiteColumn({ config, submission }: Props) {
  const cfg = useMemo<IncumbentConfig>(
    () => ({ appId: config.appId, searchKey: config.searchKey, indexName: config.indexName }),
    [config.appId, config.searchKey, config.indexName],
  );
  const { state, result, error } = useWebsiteColumn(cfg, submission);
  const status = STATUS[state];

  return (
    <section className="lane" aria-label={`${config.title} panel`}>
      <ColumnHeader config={config} statusTone={status.tone} statusLabel={status.label} />
      <div className="lane__thread">
        {state === 'idle' && (
          <div className="lane__empty lane__empty--website">
            <p>Live algolia.com keyword search</p>
            <span>
              Ask a question above — the top keyword results from the live algolia.com index are
              queried directly and shown here as the old-world reference (a ranked result list, no
              generated answer).
            </span>
          </div>
        )}

        {state === 'loading' && (
          <div className="lane__empty lane__empty--website" role="status" aria-live="polite">
            <p>Searching live algolia.com…</p>
            <span>Querying the incumbent index directly.</span>
          </div>
        )}

        {state === 'error' && (
          <div className="lane__empty lane__empty--website is-error" role="status" aria-live="polite">
            <p>Couldn’t fetch results</p>
            <span>{error}</span>
          </div>
        )}

        {state === 'done' &&
          result &&
          (result.sources.length > 0 ? (
            <ol className="weblist">
              {result.sources.map((s) => (
                <li key={s.id} className="weblist__item">
                  {s.label ? (
                    <a className="weblist__link" href={s.label} target="_blank" rel="noopener noreferrer">
                      {s.text}
                    </a>
                  ) : (
                    <span className="weblist__link">{s.text}</span>
                  )}
                  {s.label && <span className="weblist__url">{s.label}</span>}
                </li>
              ))}
            </ol>
          ) : (
            <div className="lane__empty lane__empty--website">
              <p>No results</p>
              <span>Live algolia.com search returned nothing for this query.</span>
            </div>
          ))}
      </div>
    </section>
  );
}
