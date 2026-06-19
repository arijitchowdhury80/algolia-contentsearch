/** AppHeader — Algolia brand bar, title, and transcript / reset actions. */
import logo from '../assets/Algolia-logo-blue.svg';

interface Props {
  hasRun: boolean;
  onExport: () => void;
  onReset: () => void;
}

export function AppHeader({ hasRun, onExport, onReset }: Props) {
  return (
    <header className="apphead">
      <div className="apphead__brand">
        <img className="apphead__logo" src={logo} alt="Algolia" />
        <span className="apphead__divider" aria-hidden="true" />
        <div className="apphead__titles">
          <h1 className="apphead__title">Answer-Quality Lab</h1>
        </div>
      </div>
      <div className="apphead__actions">
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          onClick={onExport}
          disabled={!hasRun}
          title="Download the current comparison as JSON for eval"
        >
          Export transcript
        </button>
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          onClick={onReset}
          disabled={!hasRun}
        >
          Reset
        </button>
      </div>
    </header>
  );
}
