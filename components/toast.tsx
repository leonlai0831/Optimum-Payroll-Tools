"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AlertTriangle, Check, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastKind = "success" | "error" | "info";

interface ToastEntry {
  id: string;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const MAX_TOASTS = 3;
const AUTO_DISMISS_MS = 4000;

/** App-wide toast provider. Mount once near the root (in `(app)/layout.tsx`). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((prev) => {
        // FIFO -- if we'd overflow the cap, drop the oldest first.
        const next = [...prev, { id, kind, message }];
        return next.slice(-MAX_TOASTS);
      });
      // Errors stick until the user dismisses them; success/info auto-clear.
      if (kind !== "error") {
        setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
      }
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (m) => push("success", m),
      error: (m) => push("error", m),
      info: (m) => push("info", m),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

/** Read the toast API from anywhere inside the provider. */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used inside <ToastProvider>.");
  }
  return ctx;
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastEntry[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div
      role="region"
      aria-label="Notifications"
      className="no-print pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:items-end"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

const TOAST_STYLES: Record<ToastKind, { wrapper: string; icon: typeof Check }> = {
  success: {
    wrapper: "border-success/30 bg-success-bg text-success",
    icon: Check,
  },
  error: {
    wrapper: "border-danger/30 bg-danger-bg text-danger",
    icon: AlertTriangle,
  },
  info: {
    wrapper: "border-info/30 bg-info-bg text-info",
    icon: Info,
  },
};

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: ToastEntry;
  onDismiss: (id: string) => void;
}) {
  const { wrapper, icon: Icon } = TOAST_STYLES[toast.kind];
  return (
    <div
      role={toast.kind === "error" ? "alert" : "status"}
      className={cn(
        "pointer-events-auto fade-in flex w-full min-w-[240px] max-w-sm items-start gap-2 rounded-lg border bg-white px-3 py-2 shadow-md",
        wrapper,
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 flex-none" />
      <p className="text-body flex-1 text-gray-900">{toast.message}</p>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        title="Dismiss"
        className="-mr-1 flex-none rounded p-0.5 opacity-60 transition hover:bg-black/5 hover:opacity-100"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
