// Shared text sanitization for the pdf-lib report builders (payslip,
// lesson plan, coach result). Isomorphic — safe to import in the browser.

const PUNCT: Record<string, string> = {
  "—": "-",
  "–": "-",
  "‒": "-",
  "−": "-",
  "’": "'",
  "‘": "'",
  "“": '"',
  "”": '"',
  "•": "-",
  "→": "->",
  "…": "...",
};

/**
 * Make text safe for the standard (WinAnsi) fonts: map common typographic
 * punctuation to ASCII, strip diacritics, then replace anything still outside
 * the encodable range with "?". Without this, pdf-lib throws on names or notes
 * that contain CJK / emoji / smart quotes.
 */
export function safe(input: string): string {
  const mapped = (input ?? "").replace(/[—–‒−’‘“”•→…]/g, (c) => PUNCT[c] ?? c);
  const stripped = mapped.normalize("NFKD").replace(/[̀-ͯ]/g, "");
  let out = "";
  for (const ch of stripped) {
    const c = ch.charCodeAt(0);
    out += (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) ? ch : "?";
  }
  return out;
}
