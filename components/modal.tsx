"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

type ModalSize = "sm" | "md" | "lg";

const SIZE_CLASS: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
};

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keep Tab / Shift+Tab cycling within `panel` (a basic dialog focus trap). When
 * focus is on the first focusable and Shift+Tab is pressed it wraps to the last,
 * and vice-versa; with nothing focusable it just pins focus to the panel.
 */
export function trapFocus(e: KeyboardEvent, panel: HTMLElement | null): void {
  if (!panel) return;
  const items = panel.querySelectorAll<HTMLElement>(FOCUSABLE);
  if (items.length === 0) {
    e.preventDefault();
    panel.focus();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  if (e.shiftKey) {
    if (active === first || active === panel) {
      e.preventDefault();
      last.focus();
    }
  } else if (active === last) {
    e.preventDefault();
    first.focus();
  }
}

/**
 * Centered dialog. Closes on Esc and backdrop click; focuses the panel on open.
 * Pass a `footer` (typically Cancel + primary action) for buttons; the body goes
 * in `children`.
 */
export function Modal({
  open,
  onClose,
  title,
  size = "md",
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  size?: ModalSize;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      // Focus trap: keep Tab / Shift+Tab cycling within the panel.
      if (e.key === "Tab") trapFocus(e, panelRef.current);
    };
    document.addEventListener("keydown", onKey);
    // Lock background scroll while the modal is open.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Remember what was focused so we can restore it on close.
    const previouslyFocused = document.activeElement as HTMLElement | null;
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  if (!open) return null;
  // createPortal needs document.body — guard so SSR (or pre-hydration) renders nothing.
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="no-print fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div
        className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          "fade-in relative w-full overflow-hidden rounded-xl bg-white shadow-md outline-none",
          SIZE_CLASS[size],
        )}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <h2 className="text-h3 text-gray-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            title="Close"
            aria-label="Close"
            className="rounded p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-4 py-4">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-gray-100 bg-gray-50 px-4 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Common destructive-confirm pattern: title, message, Cancel + danger action.
 * `busy` disables both buttons and the close button while the action is in flight.
 */
export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  busy = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-body text-gray-700">{message}</p>
    </Modal>
  );
}
