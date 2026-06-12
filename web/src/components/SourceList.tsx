/** SourceList — citation chips under an assistant answer. Each links to its URL. */
import type { Source } from '../types/chat';

interface Props {
  sources: Source[];
}

export function SourceList({ sources }: Props) {
  const linked = sources.filter((s) => s.url || s.title);
  if (linked.length === 0) return null;

  return (
    <div className="srcs" aria-label="Sources">
      <span className="srcs__label">Sources</span>
      <ul className="srcs__list">
        {linked.map((s, i) => {
          const label = s.title || s.url || `Source ${i + 1}`;
          return (
            <li key={s.objectID ?? `${i}-${s.url ?? label}`}>
              {s.url ? (
                <a
                  className="srcs__chip"
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={s.summary || label}
                >
                  <span className="srcs__num">{i + 1}</span>
                  <span className="srcs__txt">{label}</span>
                </a>
              ) : (
                <span className="srcs__chip srcs__chip--plain" title={s.summary || label}>
                  <span className="srcs__num">{i + 1}</span>
                  <span className="srcs__txt">{label}</span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
