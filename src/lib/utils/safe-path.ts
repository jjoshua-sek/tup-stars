/**
 * A path on this site to send someone to after signing in, or null.
 *
 * Checking the text alone is not enough: browsers read "/\evil.com" as
 * "//evil.com", another site, so a ?redirect= that only refused "//" still
 * let a link send someone to a lookalike page straight after they typed
 * their password here. The value is parsed the way a browser parses it, and
 * kept only when it stays on this site.
 */
export function safeLocalPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/")) return null;
  const base = "https://stars.invalid";
  let url: URL;
  try {
    url = new URL(value, base);
  } catch {
    return null;
  }
  if (url.origin !== base) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}
