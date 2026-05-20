# Five Rails — Public Form Service

A standalone Next.js app deployed to **Vercel** that serves the public-facing
landing pages for Five Rails validation campaigns and accepts signup
submissions. Backed by a free **Neon** Postgres instance.

This service exists so:

- **Public landing pages** are reachable on the internet without exposing
  the local Five Rails app (which holds API keys, OAuth tokens, the agent
  pipeline, and the SQLite source-of-truth).
- **Signups land in a sandboxed DB** that the local app pulls from over
  outbound HTTPS only — no inbound traffic ever hits your machine.
- **Agents drive everything autonomously** after a one-time, ten-minute
  bootstrap. New validation campaigns auto-sync their landing pages here;
  signups auto-flow back to the local DB on the next automation tick.

## Architecture

```
┌─────────────────────────────┐         ┌──────────────────────────────┐
│  PUBLIC: this app on Vercel │         │  LOCAL: Five Rails           │
│                             │         │                              │
│  /p/[slug]            ─ pg  │         │  Next.js + SQLite            │
│  /api/submit/[slug]   ─ pub │  ◄──────┤   (private, never exposed)   │
│  /api/landing-pages   ─ auth│  ◄──────┤                              │
│  /api/submissions     ─ auth│  ──────►│  outbound HTTPS only         │
│         │                   │         │                              │
│         ▼                   │         │                              │
│  Neon Postgres (free tier)  │         │                              │
└─────────────────────────────┘         └──────────────────────────────┘
```

## Defenses

The public surface (`/p/[slug]`, `/api/submit/[slug]`) is hardened against:

- **CORS abuse** — only the configured `ALLOWED_FORM_ORIGINS` may submit
- **Bot user-agents** — curl/wget/python-requests/headless are dropped
- **High-rate scraping** — per-IP rate limit (10 req / 60s), DB-backed
- **Honeypot spam** — invisible form field; non-empty = silently flagged
- **Drive-by submits** — sub-2s page-dwell submissions flagged as spam
- **Clickjacking** — `X-Frame-Options: DENY`
- **MIME sniffing** — `X-Content-Type-Options: nosniff`
- **Referrer leak** — `Referrer-Policy: strict-origin-when-cross-origin`
- **Replay** — unique constraint on `(slug, lower(email))` makes signups
  idempotent; same email twice returns 200 without double-counting

The management surface (`/api/landing-pages`, `/api/submissions`) is gated
by `Authorization: Bearer <SERVICE_API_TOKEN>` with constant-time comparison.

## One-time setup (~10 min)

### 1. Create a Neon Postgres database (free)

1. Sign up at <https://neon.tech>
2. Click **Create project** → name it `five-rails-form-service`
3. Copy the **pooled connection string** from the dashboard
   (looks like `postgresql://user:pass@ep-xxx.../dbname?sslmode=require`)

### 2. Deploy this app to Vercel (free)

```bash
cd /home/z-ro/five-rails/public-form-service

# Generate a 32-byte token shared between this app and the local Five Rails app
SERVICE_TOKEN=$(openssl rand -hex 32)
echo "SERVICE_API_TOKEN: $SERVICE_TOKEN  ← save this, you'll need it locally"

# Link to a new Vercel project
npx vercel link

# Set env vars on Vercel
echo "$NEON_CONNECTION_STRING" | npx vercel env add DATABASE_URL production
echo "$SERVICE_TOKEN"           | npx vercel env add SERVICE_API_TOKEN production
# (set ALLOWED_FORM_ORIGINS after first deploy, once you know your URL)

# Deploy
npx vercel --prod
```

Vercel prints your live URL — something like
`https://five-rails-form-service.vercel.app`. Save it.

### 3. Tighten CORS to the deployed URL

```bash
npx vercel env add ALLOWED_FORM_ORIGINS production
# Paste: https://five-rails-form-service.vercel.app
npx vercel --prod                                   # redeploy with the lockdown
```

### 4. Initialize the Postgres schema

```bash
DATABASE_URL="$NEON_CONNECTION_STRING" npx tsx scripts/init-db.ts
```

Output: `OK — tables and indexes created.`

### 5. Wire the local Five Rails app

In `/home/z-ro/five-rails/.env`, add:

```bash
FORM_SERVICE_URL=https://five-rails-form-service.vercel.app
SERVICE_API_TOKEN=<the token from step 2>
```

Restart Five Rails (`pm2 restart five-rails`).

### 6. Push existing landing pages

```bash
cd /home/z-ro/five-rails
npx tsx scripts/sync-landing-pages-to-vercel.ts
```

That's it. From here on, every new validation campaign's landing page
auto-syncs to Vercel; every signup auto-flows back via the automation
heartbeat (every ~15 min by default — adjustable via `automation_interval_minutes`).

## What's autonomous after bootstrap

| Operation | Who does it | Notes |
|---|---|---|
| Create a new landing page | Agents (via `create-test-assets`) | Auto-syncs on save |
| Update an existing page | Agents | Idempotent upsert by slug |
| Receive submissions | This service (Vercel) | Hardened public endpoint |
| Pull submissions to local | Local automation heartbeat | Runs every ~15 min |
| Increment `actual_signups` | Local poller | Per signup, idempotent |
| Tag lead in `outbound_contacts` | Local poller | Tagged `validation_signup` |
| Spam filtering | This service | Honeypot + dwell + UA filters |
| Rate limiting | This service | 10/min per IP |

## What you do post-bootstrap

Nothing routine. You only re-touch this service if:

- You want to **add features** (new spam defense, new form fields, file
  upload, etc.) → push code update + `npx vercel --prod`
- You want to **rotate the bearer token** → re-run `vercel env add SERVICE_API_TOKEN`
  on both sides
- You want to **add a custom domain** (e.g. `validate.yourdomain.com`) →
  Vercel dashboard → Settings → Domains

## Operational notes

- **Vercel free tier** allows 100 GB bandwidth/month, plenty for validation
- **Neon free tier** allows 0.5 GB storage, plenty for years of submissions
- **Cold starts** on Vercel free tier add ~500ms to a first request after
  inactivity — fine for landing pages, not great for ad-hoc heavy traffic
- **No PII in logs** — IPs are SHA-256 hashed with the service token before storage

## Tearing it down

If you stop using the service:
1. `npx vercel project rm five-rails-form-service`
2. Delete the Neon project from the Neon dashboard
3. Remove `FORM_SERVICE_URL` and `SERVICE_API_TOKEN` from local `.env`

The local app keeps working (the form-service integration is feature-flagged
on env presence).
