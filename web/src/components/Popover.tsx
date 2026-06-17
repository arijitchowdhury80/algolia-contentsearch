/**
 * Popover — dependency-free click-to-open floating panel (ADR-001 D3).
 *
 * A trigger button toggles a panel anchored beneath it. Closes on outside-click
 * or Escape (Esc restores focus to the trigger). No Radix / no portal — the lab
 * stack is plain-CSS + dependency-free. Used for grouped source pills.
 */
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';

interface Props {
  /** Visible trigger content (icon + label + count). */
  label: ReactNode;
  /** Accessible label for the trigger AND the panel dialog. */
  triggerLabel: string;
  /** Panel content, shown when open. */
  children: ReactNode;
  /** Class applied to the trigger button. */
  className?: string;
  /** Inline style on the trigger (e.g. the accent custom property). */
  style?: CSSProperties;
}

export function Popover({ label, triggerLabel, children, className, style }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="pop" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={className}
        style={style}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? panelId : undefined}
        aria-label={triggerLabel}
        onClick={() => setOpen((o) => !o)}
      >
        {label}
      </button>
      {open && (
        <div className="pop__panel" id={panelId} role="dialog" aria-label={triggerLabel}>
          {children}
        </div>
      )}
    </div>
  );
}
