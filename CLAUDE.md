# CLAUDE.md — Five Rails Development Rules

## Code Quality & Verification Protocol

When coding, you must always verify that all new code and all updated code works correctly, does not break existing functionality, and remains fully connected to the appropriate systems, tables, components, and workflows.

Every time code is added or changed, you must review the entire app for regressions, broken connections, and incomplete logic.

Nothing should ever ship broken or incomplete.

### 1. Always verify new code

Every new component, function, or module must be checked to ensure:

- It works as intended
- It connects to the correct tables and data sources
- It triggers the correct backend logic
- It integrates with the UI
- It supports the full workflow, not just part of it

No untested code is allowed.

### 2. Always re-verify existing code after updates

Any time you modify or add code, you must:

- Re-test all related components
- Confirm nothing was broken
- Confirm no regressions were introduced
- Confirm all dependencies still work
- Confirm all workflows still complete end-to-end

If something breaks, fix it immediately.

### 3. Validate all connections

For every component — new or old — confirm:

- Correct API endpoints
- Correct database tables
- Correct Skills
- Correct routing
- Correct event handling
- Correct UI → backend → UI loop
- Correct integration with other systems

If the app claims it can do (A), it must also complete (B), (C), and (D) to finish the workflow.

### 4. Review the entire app after every code change

This is non-negotiable.

You must:

- Scan the app for broken buttons
- Test all workflows
- Check all pages
- Verify all features still function
- Ensure no UI elements lost their connections
- Ensure no logic paths were disrupted

Every code change triggers a full app review.

### 5. Never break existing code

- No regressions
- No missing imports
- No broken routes
- No disconnected components
- No half-implemented features
- No "TODO" placeholders left behind

If something breaks, you must fix it before moving forward.

### Final Enforcement Line

Whenever you add or update code, you must verify everything works, ensure all components remain connected to the correct systems, and review the entire app to confirm nothing broke.

No untested code. No regressions. No broken features. Everything must be validated end-to-end.

---

## App Architecture

- **Framework**: Next.js 16 (App Router, Turbopack)
- **Database**: SQLite via better-sqlite3
- **LLM Providers**: Ollama, OpenAI-compatible, Anthropic (via connections table)
- **Styling**: Tailwind CSS, dark theme (bg-[#0a0c14])

## Key Systems

- **13 Pages**: Dashboard, Blueprint, Metrics, IdeaBrowser, Skills, Connections, Outbound, Audience, Newsletters, Ads, Analytics, Pipeline, Affiliates
- **23+ API Routes**: All under /src/app/api/
- **14 Skills**: Sales Page Surgeon, Email Wizard, Lead Magnet Creator, Content Engine, Market Research, Competitive Intel, Outbound Sequence, Ops Dashboard, Front-end Design, Leveraged Agency, SEO Strategist, Ad Copy Generator, Pricing Page Generator, Social Content Calendar
- **229 IdeaBrowser ideas**: Imported from GitHub archive, scored with deterministic engine

## Database Tables

projects, skills, content_pieces, outbound_contacts, newsletters, market_insights, tasks, connections, platform_connections, activity_log, files, ideabrowser_ideas, ideabrowser_trends, ideabrowser_market_insights, ideabrowser_config, blueprints, email_sequences, referrals, ad_rules, funnel_events, ad_campaigns, content_analytics, deals, deal_activities, landing_pages, scheduled_posts, rss_feeds, brand_voices, competitors, competitor_alerts, affiliates, commissions, webinars, webinar_registrations, subscriptions, payment_attempts, onboarding_checklists

## Critical Connection Rules

- Deals must update lead_score on outbound_contacts when stage changes
- Subscriptions with referral_code must auto-create commissions for affiliates
- Webinar registrations must auto-create outbound_contacts with tags
- Brand voice must be injected into all skill executions and landing page generation
- Content repurposing must auto-schedule social posts at platform best times
- All significant actions must log to activity_log
- All user-facing actions must track as funnel_events where applicable
