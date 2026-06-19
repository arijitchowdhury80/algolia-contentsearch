/**
 * Popover — dependency-free click-to-open floating panel.
 *
 * The panel is PORTALED to <body> with fixed positioning so it escapes the
 * frosted-glass tiles' `overflow:hidden` (which otherwise clips it). Closes on
 * outside-click or Escape (Esc restores focus to the trigger).
 */
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

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

const PANEL_W = 320;

export function Popover({ label, triggerLabel, children, className, style }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; up: boolean } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  // Position the portaled panel near the trigger, clamped to the viewport.
  // Open upward when there's little room below (source pills sit near the bottom).
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.left, window.innerWidth - PANEL_W - 8));
    const up = window.innerHeight - r.bottom < 260;
    setPos({ left, top: up ? r.top - 6 : r.bottom + 6, up });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!triggerRef.current?.contains(t) && !panelRef.current?.contains(t)) setOpen(false);
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
    <div className="pop">
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
      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            className="pop__panel"
            id={panelId}
            role="dialog"
            aria-label={triggerLabel}
            style={{
              position: 'fixed',
              left: pos.left,
              top: pos.top,
              transform: pos.up ? 'translateY(-100%)' : undefined,
              maxWidth: PANEL_W,
            }}
          >
            {children}
          </div>,
          document.body,
        )}
    </div>
  );
}
