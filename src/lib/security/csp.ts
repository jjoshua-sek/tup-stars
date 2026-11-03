/**
 * The Content-Security-Policy for every page, set by the proxy with a fresh
 * nonce per request. Scripts run only when they carry that nonce or were
 * loaded by one that does ('strict-dynamic'): Next.js stamps its own
 * scripts with it, and app/layout.tsx stamps the two start-up scripts. So a
 * script injected into a page, or one from another site, does not run.
 *
 * Styles stay 'unsafe-inline': React style attributes, Recharts and
 * next/font need it, and a style cannot run code. Images and connections
 * may reach Supabase (photos, live updates). The page may not be framed,
 * and forms post only here. The gate kiosk is not covered: it skips the
 * proxy and talks to whatever offline copy address the gate is given.
 */
export function contentSecurityPolicy(input: { nonce: string; supabaseUrl?: string; dev?: boolean }): string {
  let supabase = "";
  let realtime = "";
  try {
    if (input.supabaseUrl) {
      const url = new URL(input.supabaseUrl);
      supabase = url.origin;
      realtime = `${url.protocol === "https:" ? "wss:" : "ws:"}//${url.host}`;
    }
  } catch {
    // No usable URL: Supabase is then reachable only if it is this origin.
  }

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // Development builds evaluate code for fast refresh.
    "script-src": ["'self'", `'nonce-${input.nonce}'`, "'strict-dynamic'", ...(input.dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", supabase],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", supabase, realtime, ...(input.dev ? ["ws:"] : [])],
    "media-src": ["'self'", "blob:"],
    "worker-src": ["'self'", "blob:"],
    "frame-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };

  return Object.entries(directives)
    .map(([name, values]) => [name, ...values.filter(Boolean)].join(" "))
    .join("; ");
}

/** A fresh nonce for one request. */
export function createNonce(): string {
  return btoa(crypto.randomUUID());
}
