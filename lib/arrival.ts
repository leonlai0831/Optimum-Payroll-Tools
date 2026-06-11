/**
 * Cross-page handshake for the login → dashboard stripe transition. Login
 * marks the arrival in sessionStorage right before navigating; on the other
 * side the loading overlay stands down (no logo clip mid-sequence) and the
 * launcher's permanent stripe ribbon consumes the mark to play its one-time
 * draw-in. All reads are guarded so SSR and privacy modes degrade to a plain
 * navigation.
 */
const KEY = "oph-arrival";

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
