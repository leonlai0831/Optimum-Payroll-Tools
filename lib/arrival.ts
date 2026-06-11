/**
 * Cross-page handshake for the login → dashboard stripe transition. Login
 * marks the arrival in sessionStorage right before navigating; on the other
 * side the BrandShell curtain holds the screen covered, the loading overlay
 * stands down (the curtain replaces it), and the launcher's stripe band
 * consumes the mark, fires ARRIVAL_READY_EVENT to lift the curtain, and runs
 * its bottom-right → up → behind-the-hero → out-left pass. All reads are
 * guarded so SSR and privacy modes degrade to "no transition".
 */
const KEY = "oph-arrival";
export const ARRIVAL_READY_EVENT = "oph-arrival-ready";

export function markArrival() {
  try {
    sessionStorage.setItem(KEY, "1");
  } catch {
    /* storage unavailable — the dashboard simply loads without the flourish */
  }
}

export function hasArrival(): boolean {
  try {
    return typeof window !== "undefined" && sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function clearArrival() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}
