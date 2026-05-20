-- ─── Five Rails Form Service: Postgres schema ────────────────────────────────
-- Two tables only. Submissions are write-heavy (one row per public form post),
-- landing_pages is read-heavy (one row per published validation campaign).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS landing_pages (
  -- The slug is the public URL segment: /p/<slug>
  slug              TEXT        PRIMARY KEY,
  -- Local identifiers we mirror so the local app can correlate.
  source_id         TEXT        NOT NULL,
  validation_campaign_id TEXT,
  project_id        TEXT,
  title             TEXT        NOT NULL,
  -- Stored HTML body of the page (the part above the form).
  html              TEXT        NOT NULL DEFAULT '',
  -- 'published' = visible at /p/<slug>; 'archived' = 404.
  status            TEXT        NOT NULL DEFAULT 'published',
  -- Counters maintained server-side. Idempotent inserts keep these honest.
  visits            INTEGER     NOT NULL DEFAULT 0,
  conversions       INTEGER     NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS submissions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              TEXT        NOT NULL REFERENCES landing_pages(slug) ON DELETE CASCADE,
  -- We keep these as TEXT (not FK) so submissions outlive a deleted page.
  validation_campaign_id TEXT,
  project_id        TEXT,
  email             TEXT        NOT NULL,
  name              TEXT,
  -- Honeypot — if non-empty we still record but mark spam=true; useful for
  -- audit ("is the bot rate going up?") without letting bots count as signups.
  spam              BOOLEAN     NOT NULL DEFAULT FALSE,
  -- Outbound metadata. ip is hashed (sha256(ip + secret)) so we never store raw.
  ip_hash           TEXT,
  user_agent        TEXT,
  referrer          TEXT,
  -- For dedup: same email + same slug = single submission.
  -- Uniqueness enforced by index below.
  raw_payload       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  -- Bookkeeping for the local poller. Once it ACKs receipt, we set
  -- delivered_at; the poller filters on this so we never double-deliver.
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at      TIMESTAMPTZ
);

-- Idempotency: same email + same slug = one row. The submit handler turns
-- 23505 unique-violation into a 200-OK "already submitted" response.
CREATE UNIQUE INDEX IF NOT EXISTS uq_submissions_slug_email
  ON submissions (slug, lower(email));

-- Poller fast path
CREATE INDEX IF NOT EXISTS ix_submissions_undelivered
  ON submissions (created_at)
  WHERE delivered_at IS NULL AND spam = FALSE;

-- Per-IP rate-limit bucket. Keep 5-minute resolution; old rows pruned by
-- the rate limiter as it runs.
CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  ip_hash           TEXT        NOT NULL,
  bucket_at         TIMESTAMPTZ NOT NULL,
  hits              INTEGER     NOT NULL DEFAULT 1,
  PRIMARY KEY (ip_hash, bucket_at)
);

CREATE INDEX IF NOT EXISTS ix_rate_limit_bucket_at ON rate_limit_buckets (bucket_at);
