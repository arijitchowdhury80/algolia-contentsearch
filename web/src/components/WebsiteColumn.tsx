/**
 * WebsiteColumn — ① "Current Website Search".
 *
 * The browser can't query live algolia.com (different app + WAF + CORS), so this
 * calls the local backend's Playwright capture (POST /api/website) and renders
 * the top result hits + links — the "old-world reference" vs ②/③'s answers.
 * Local-only: needs the lab backend on :8787 (won't work on the Vercel deploy).
 */
import { ColumnHeader, type StatusTone } from './ColumnHeader';
import type { WebsiteColumnConfig } from '../config/columns';
import type { Submission } from '../hooks/useComparison';
import { useWebsiteColumn, type WebsiteState } from '../hooks/useWebsiteColumn';

interface Props {
  config: WebsiteColumnConfig;
  submission: Submission | null;
}

const STATUS: Record<WebsiteState, { tone: StatusTone; label: string }> = {
  idle: { tone: 'info', label: 'Offline capture' },
  loading: { tone: 'info', label: 'Capturing…' },
  done: { tone: 'success', label: 'Captured' },
  error: { tone: 'danger', label: 'Error' },
};

export function WebsiteColumn({ config, submission }: Props) {
  const { state, result, error } = useWebsiteColumn(submission);
  const status = STATUS[state];

  return (
    <section className="lane" aria-label={`${config.title} panel`}>
      <ColumnHeader config={config} statusTone={status.tone} statusLabel={status.label} />
      <div className="lane__thread">
        {state === 'idle' && (
          <div className="lane__empty lane__empty--website">
            <p>Live algolia.com search</p>
            <span>
              Ask a question above — the top keyword results from live algolia.com are captured
              (server-side via Playwright) and shown here as the old-world reference. Not driven
              live from the browser (different app + WAF).
            </span>
          </div>
        )}

        {state === 'loading' && (
          <div className="lane__empty lane__empty--website" role="status" aria-live="polite">
            <p>Capturing live algolia.com…</p>
            <span>Driving a real browser against algolia.com — this takes ~15s.</span>
          </div>
        )}

        {state === 'error' && (
          <div className="lane__empty lane__empty--website is-error" role="status" aria-live="polite">
            <p>Couldn’t capture results</p>
            <span>{error}. Is the local lab backend running on :8787?</span>
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
