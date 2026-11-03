import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { loose } from "@/lib/supabase/loose";

/**
 * Rate limiter for Server Actions and Route Handlers.
 *
 * Counts in the database (public.hit_rate_limit, migration 00056), so every
 * server sees the same count: on Vercel each request may land on a new
 * server, and a count kept in memory started from zero on each. If that call
 * fails (the migration not run yet, or the database unreachable), it falls
 * back to counting in this server's memory, so a limit never blocks everyone.
 */

interface RateLimitOptions {
  /** Unique identifier (e.g., userId, IP address) */
  identifier: string;
  /** Maximum number of requests allowed in the window */
  maxRequests: number;
  /** Window duration in seconds */
  windowSeconds: number;
}

interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetAt: number;
}

export async function checkRateLimit(options: RateLimitOptions): Promise<RateLimitResult> {
  try {
    const { data, error } = await loose(createAdminClient()).rpc("hit_rate_limit", {
      p_key: options.identifier,
      p_limit: options.maxRequests,
      p_window_seconds: options.windowSeconds,
    });
    const row = (Array.isArray(data) ? data[0] : data) as { allowed: boolean; hits: number; reset_at: string } | null;
    if (!error && row) {
      return {
        success: row.allowed,
        remaining: Math.max(0, options.maxRequests - row.hits),
        resetAt: new Date(row.reset_at).getTime(),
      };
    }
  } catch {
    // Fall through to this server's own count.
  }
  return checkRateLimitInMemory(options);
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Clean up expired entries every 5 minutes
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
      if (entry.resetAt <= now) {
        rateLimitStore.delete(key);
      }
    }
  }, 5 * 60 * 1000);
}

/** The fallback: a fixed window counted in this server's memory. */
export function checkRateLimitInMemory(options: RateLimitOptions, now: number = Date.now()): RateLimitResult {
  const { identifier, maxRequests, windowSeconds } = options;
  const entry = rateLimitStore.get(identifier);

  if (!entry || entry.resetAt <= now) {
    rateLimitStore.set(identifier, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { success: true, remaining: maxRequests - 1, resetAt: now + windowSeconds * 1000 };
  }

  if (entry.count >= maxRequests) {
    return { success: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return { success: true, remaining: maxRequests - entry.count, resetAt: entry.resetAt };
}
