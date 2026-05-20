// ─── Rate limiting ────────────────────────────────────────────────────────────
// Per-IP fixed-window limiter backed by Postgres.
// Default: 10 requests / 60 seconds. Blocks at 11.
//
// Using DB rather than in-memory because Vercel serverless functions run on
// many ephemeral instances; in-memory state would let a botnet trivially
// bypass by spreading load. Postgres roundtrip is ~5ms inside the same region.

import { sql } from "./db";

const WINDOW_SECONDS = 60;
const MAX_HITS = 10;

export async function checkRateLimit(ipHash: string): Promise<{ ok: boolean; hits: number }> {
  const bucket = new Date(Math.floor(Date.now() / (WINDOW_SECONDS * 1000)) * WINDOW_SECONDS * 1000);

  // UPSERT: if a row exists for (ip, bucket), increment. Otherwise insert.
  const rows = await sql<{ hits: number }[]>`
    INSERT INTO rate_limit_buckets (ip_hash, bucket_at, hits)
    VALUES (${ipHash}, ${bucket}, 1)
    ON CONFLICT (ip_hash, bucket_at)
    DO UPDATE SET hits = rate_limit_buckets.hits + 1
    RETURNING hits
  `;

  const hits = rows[0]?.hits ?? 1;

  // Best-effort cleanup of buckets older than 1 hour. Run on ~1% of requests
  // so we don't pay this cost on every hit.
  if (Math.random() < 0.01) {
    sql`DELETE FROM rate_limit_buckets WHERE bucket_at < NOW() - INTERVAL '1 hour'`
      .catch(() => { /* best-effort */ });
  }

  return { ok: hits <= MAX_HITS, hits };
}
