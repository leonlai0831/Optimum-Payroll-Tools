// Login email domain completion: staff accounts live on one domain, so once
// the local part and "@" are typed we can offer the rest as a one-tap chip.
// Pure string logic so the suggestion rules stay unit-tested.

export const LOGIN_EMAIL_DOMAIN = "optimumtrain.page";

/**
 * The full address to suggest for a partially typed login email, or null when
 * no suggestion applies. Suggests only while the typed domain is an incomplete
 * prefix of the staff domain ("you@", "you@opti", …) — never for a complete
 * address, a diverging domain, or a malformed local part.
 */
export function suggestLoginEmail(value: string): string | null {
  const v = value.trim();
  const at = v.indexOf("@");
  if (at <= 0) return null; // no "@" yet, or empty local part
  const local = v.slice(0, at);
  const domain = v.slice(at + 1);
  if (local.includes(" ") || domain.includes(" ") || domain.includes("@")) return null;
  if (!LOGIN_EMAIL_DOMAIN.startsWith(domain.toLowerCase())) return null;
  if (domain.toLowerCase() === LOGIN_EMAIL_DOMAIN) return null; // already complete
  return `${local}@${LOGIN_EMAIL_DOMAIN}`;
}
