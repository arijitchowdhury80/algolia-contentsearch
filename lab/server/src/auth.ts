/**
 * auth — minimal protection for the publicly-exposed judge endpoint.
 *
 * Dependency-free (native http + the minimise-custom-code / native-Algolia steer).
 * Two concerns:
 *   (1) a shared-secret header gate — the frontend sends `x-lab-key`, the server
 *       rejects anything that doesn't match LAB_API_KEY; and
 *   (2) a fixed-window per-IP rate limit, so an exposed endpoint can't be looped
 *       to run up the Gemini bill (each judge call spends tokens = money).
 *
 * Auth is OPT-IN: with no LAB_API_KEY set the gate is OPEN, so local dev and the
 * Phase-1 localhost-only deploy keep working untouched. Set LAB_API_KEY in prod
 * (VPS judge.env + Vercel VITE_LAB_API_KEY) to enforce it. NOTE: a VITE_ var is
 * bundled into the public frontend JS, so this secret stops casual/scraper abuse
 * but is not hidden from a determined inspector — acceptable for the POC; a
 * signed short-lived token is the production hardening. The rate limit is the
 * real backstop against bill runaway.
 *
 * Behind Cloudflare the socket peer is the tunnel (localhost) for every request,
 * so the real client IP arrives in the `CF-Connecting-IP` header — rate-limit on
 * that when present.
 */

/** Lowercase header name (node lowercases all incoming header keys). */
export const API_KEY_HEADER = "x-lab-key";

/** Length-checked, constant-time-ish compare to avoid an early-exit timing leak. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** True if the request may proceed. An empty/undefined expectedKey = gate OPEN. */
export function isAuthorized(
  headerValue: string | string[] | undefined,
  expectedKey: string | undefined,
): boolean {
  if (!expectedKey) return true; // gate disabled (dev / localhost-only)
  const got = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (!got) return false;
  return safeEqual(got, expectedKey);
}

/** Resolve the client IP, preferring Cloudflare's forwarded header. */
export function clientIp(
  headers: Record<string, string | string[] | undefined>,
  fallback: string | undefined,
): string {
  const pick = (v: string | string[] | undefined): string | undefined =>
    Array.isArray(v) ? v[0] : v;
  const cf = pick(headers["cf-connecting-ip"]);
  const xff = pick(headers["x-forwarded-for"])?.split(",")[0]?.trim();
  return (cf || xff || fallback || "unknown").trim();
}

/** Fixed-window per-key rate limiter. Clock injectable for deterministic tests. */
export class RateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();
  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Returns true if allowed; false if `key` is over the limit this window. */
  check(key: string): boolean {
    if (this.limit <= 0) return true; // disabled
    const t = this.now();
    const e = this.hits.get(key);
    if (!e || t >= e.resetAt) {
      this.hits.set(key, { count: 1, resetAt: t + this.windowMs });
      return true;
    }
    if (e.count >= this.limit) return false;
    e.count += 1;
    return true;
  }
}
