// ─── Bearer-token auth ────────────────────────────────────────────────────────
// Used to gate management endpoints (sync landing pages, pull submissions).
// The token is shared between the local Five Rails app and this service via
// SERVICE_API_TOKEN env var on both sides.
//
// We use timingSafeEqual to avoid leaking token length / prefix via timing.

import { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";

export function checkAuth(request: NextRequest): { ok: true } | { ok: false; reason: string } {
  const expected = process.env.SERVICE_API_TOKEN;
  if (!expected || expected.length < 32) {
    return { ok: false, reason: "Service mis-configured (SERVICE_API_TOKEN missing or too short)" };
  }

  const header = request.headers.get("authorization") || "";
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m) return { ok: false, reason: "Missing bearer token" };

  const presented = m[1].trim();
  // timingSafeEqual requires equal-length buffers; pad/truncate to prevent
  // length leakage by always comparing fixed-length slices.
  const a = Buffer.from(presented.padEnd(64, "\0").slice(0, 64));
  const b = Buffer.from(expected.padEnd(64, "\0").slice(0, 64));
  return timingSafeEqual(a, b) ? { ok: true } : { ok: false, reason: "Invalid token" };
}

// Hash an IP for storage. Salt with the service token so an attacker who
// dumps the DB can't recover IPs without knowing the token. We don't need
// a true KDF here — even sha256+salt is enough to disclaim "we don't store IPs."
import { createHash } from "node:crypto";

export function hashIp(ip: string): string {
  const salt = process.env.SERVICE_API_TOKEN || "fallback-dev-salt";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}
