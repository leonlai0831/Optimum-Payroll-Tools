/**
 * GET a URL and parse JSON, surfacing the server's real error/status instead of
 * a misleading "Unexpected end of JSON input" from calling `.json()` on an empty
 * error body. Shared by client components that fetch app JSON.
 */
export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = (await res.text().catch(() => "")).slice(0, 300);
    throw new Error(`${url} failed (${res.status})${body ? `: ${body}` : ""}`);
  }
  return res.json() as Promise<T>;
}
