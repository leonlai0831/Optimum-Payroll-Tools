import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a number as RM currency (no decimals). */
export function rm(n: number): string {
  return `RM ${Math.round(n).toLocaleString("en-MY")}`;
}
