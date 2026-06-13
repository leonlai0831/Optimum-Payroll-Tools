/**
 * Loose sign-in email shape: an "@" with no surrounding whitespace, TLD NOT
 * required — so the dev-bootstrap `admin@local` stays valid. Shared by the
 * self-service (`/api/users/me`) and admin (`/api/users/[id]`) routes so their
 * acceptance can't drift apart. (The bulk-import parser deliberately uses a
 * stricter TLD-required check; that one is intentionally different.)
 */
export const LOOSE_EMAIL_RE = /^[^\s@]+@[^\s@]+$/;

/** Max length for a stored nickname / email — guards against bloated input on
 *  the low-friction self-service path (the column itself is unbounded `text`). */
export const MAX_NAME_LENGTH = 120;

/** The user-facing message `createUser`/`updateUser` throw on an email clash. */
export const DUPLICATE_EMAIL_MESSAGE = "A user with that email already exists.";

/**
 * True when an error from `createUser`/`updateUser` is the email-uniqueness
 * guard (a user-facing 400). Lets routes return a clean 400 for that case while
 * RE-THROWING genuine server errors so they 500 and reach the error sink/Sentry
 * (a broad catch would hide outages and leak raw driver messages).
 */
export function isDuplicateEmailError(e: unknown): boolean {
  return e instanceof Error && e.message.includes("already exists");
}
