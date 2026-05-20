// ─── Postgres client ──────────────────────────────────────────────────────────
// One pooled connection per Vercel serverless instance, cached on globalThis
// so warm starts don't reconnect. Neon's free tier prefers small pools.

import postgres from "postgres";

declare global {
  // eslint-disable-next-line no-var
  var __pgClient: ReturnType<typeof postgres> | undefined;
}

if (!globalThis.__pgClient) {
  if (!process.env.DATABASE_URL) {
    // Defer the error to the first query so build-time analysis (which runs
    // without DATABASE_URL) doesn't fail.
    console.warn("DATABASE_URL not set; queries will fail until configured");
  } else {
    globalThis.__pgClient = postgres(process.env.DATABASE_URL, {
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
      // Required when DATABASE_URL points at a PgBouncer (Neon pooled URL).
      prepare: false,
    });
  }
}

export const sql = globalThis.__pgClient ?? (postgres("postgres://invalid"));
