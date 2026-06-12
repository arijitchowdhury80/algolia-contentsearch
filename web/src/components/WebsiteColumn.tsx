/**
 * WebsiteColumn — ① "Current Website Search" (transitional placeholder).
 *
 * In Wave 2 this panel renders a Playwright-captured screenshot + result links
 * of live algolia.com. For now it shows a labelled empty-state and does NOT call
 * keyword search live. The query echo confirms the fan-out reached this panel.
 */
import { ColumnHeader } from './ColumnHeader';
import type { WebsiteColumnConfig } from '../config/columns';
import type { Submission } from '../hooks/useComparison';

interface Props {
  config: WebsiteColumnConfig;
  submission: Submission | null;
}

export function WebsiteColumn({ config, submission }: Props) {
  const query = submission?.query;

  return (
    <section className="lane" aria-label={`${config.title} panel`}>
      <ColumnHeader config={config} statusTone="info" statusLabel="Offline capture" />
      <div className="lane__thread">
        <div className="lane__empty lane__empty--website">
          <span className="lane__capture-badge">Wave 2</span>
          <p>Captured from live algolia.com</p>
          <span>
            Offline capture — a Playwright screenshot of the live website search results plus the
            top result links will be wired in here in Wave 2. Live keyword search is intentionally
            not called from the browser.
          </span>
          {query && (
            <p className="lane__query-echo lane__query-echo--center">
              Would capture results for <strong>“{query}”</strong>
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
