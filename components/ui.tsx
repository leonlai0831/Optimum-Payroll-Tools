import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type ButtonSize = "sm" | "md" | "lg";

/* Pill CTAs for actions, 8px utility chrome for outline/ghost (design.md: the
   radius contrast is intentional — marketing-pill actions vs tight tools). */
const buttonVariants: Record<ButtonVariant, string> = {
  primary: "rounded-full bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800 active:scale-[0.98] shadow-sm",
  secondary: "rounded-full bg-indigo-50 text-indigo-700 hover:bg-indigo-100 active:bg-indigo-200 active:scale-[0.98]",
  ghost: "rounded-lg text-gray-600 hover:bg-gray-100 active:bg-gray-200",
  danger: "rounded-full bg-red-600 text-white hover:bg-red-700 active:bg-red-800 active:scale-[0.98]",
  outline: "rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 active:bg-gray-100",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "gap-1.5 px-3 py-1.5 text-xs",
  md: "gap-2 px-4 py-2 text-sm",
  lg: "gap-2 px-5 py-2.5 text-base",
};

export function Button({
  variant = "primary",
  size = "md",
  // Default to a non-submitting button so a <Button> inside a <form> doesn't
  // accidentally submit it. Buttons that *should* submit pass type="submit".
  type = "button",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex cursor-pointer items-center justify-center font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50",
        buttonSizes[size],
        buttonVariants[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  // Hairline-defined surface on the warm canvas; elevation is barely-there.
  return (
    <div
      className={cn("rounded-xl border border-gray-200 bg-white shadow-card", className)}
      {...props}
    />
  );
}

/* Form fields stay tight (rounded-md, never pill) per design.md. `text-base`
   at phone widths keeps iOS Safari from auto-zooming focused fields. */
const fieldClasses =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-base sm:text-sm shadow-sm outline-none transition-colors hover:border-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldClasses, className)} {...props} />;
}

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldClasses, className)} {...props} />;
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(fieldClasses, "bg-white", className)} {...props} />;
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-overline text-muted", className)} {...props} />;
}

export function Badge({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-block min-w-6 rounded border px-2 py-0.5 text-center text-xs font-extrabold",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("h-4 w-4 animate-spin", className)} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
