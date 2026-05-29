"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Side-anchored panel for read-mostly detail surfaces (e.g. a coach profile).
 * Right-side on desktop, full-width on mobile. Closes on Esc and backdrop
 * click; locks background scroll; focuses the panel on open.
 *
 * Pass rich title content (heading + subtitle, badges, etc.) via `header` —
 * the close button is provided.
 */
export function Drawer({
  open,
  onClose,
  side = "right",
  header,
  children,
}: {
  open: boolean;
  onClose: () => void;
  side?: "right" | "left";
  header?: ReactNode;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className={cn(
        "no-print fixed inset-0 z-50 flex",
        side === "right" ? "justify-end" : "justify-start",
      )}
    >
      <div
        className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="fade-in relative flex h-full w-full max-w-lg flex-col overflow-hidden bg-white shadow-md outline-none"
      >
        {header && (
          <div className="flex items-start justify-between gap-2 border-b border-gray-100 px-5 py-4">
            <div className="min-w-0 flex-1">{header}</div>
            <button
              type="button"
              onClick={onClose}
              title="Close"
              className="-mr-1 flex-none rounded p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
