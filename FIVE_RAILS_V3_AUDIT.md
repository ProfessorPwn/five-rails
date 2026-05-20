# Five Rails v3.0 — Feature Completion Audit & Implementation Plan

**Audited**: 2026-03-19
**Codebase**: 23,039 lines across 118 source files
**Stack**: Next.js 16, SQLite (47 tables), Claude Code SDK + Ollama fallback, Tailwind CSS

---

## Phase 1 — Deep Audit

### Methodology
Full data-path trace for every feature across all 18 pages: `UI component → state/API call → API route → SQLite query → response → UI update`

### Classification Key
- ✅ **Complete** — passes all 4 "feature complete" criteria
- ⚠️ **Partial** — happy path works but missing states, connections, or error handling
- ❌ **Stub/broken** — UI exists but API is incomplete, data is hardcoded, or feature crashes
- 🚫 **Missing** — expected feature that doesn't exist

---

### 1. Command Center Module

#### Dashboard (`/dashboard`) — ⚠️ Partial

| Feature | Status | Detail |
|---------|--------|--------|
| 5-rail KPI cards | ⚠️ | Pull from real API data (skills, insights, ideas, contacts, content) — NOT hardcoded. But no agent-related KPIs (agent state, running tasks, blocked count) |
| Recent activity feed | ❌ | **BROKEN**: Fetches from `/api/activity` but **endpoint DOES NOT EXIST** — no route handler. Silently falls back to empty array. User always sees "No activity yet" |
| Active projects list | ✅ | Fetches from `/api/projects`. Shows name, niche, score, status badge |
| Context-aware "What's Next" | ✅ | Smart logic: checks hasConnections, hasProjects, hasInsights, hasContacts, hasContent — only shows relevant actions |
| Loading state | ⚠️ | Spinner only — no skeleton screen |
| Error handling | ❌ | All API calls use `.catch(() => [])` — errors are silently swallowed, no error toast or retry |
| Empty state | ✅ | Shows "No activity yet" and "No projects yet" messages |
| Agent status summary | 🚫 | Dashboard doesn't show any agent state, current tasks, or blocked agents |
| Automation engine status | 🚫 | No indicator of when heartbeat last ran or what it processed |

**Broken connections**:
- Dashboard doesn't link to agents page or show agent activity
- No automation heartbeat status indicator
- No MRR/ARR or subscription metrics on dashboard

#### Agent Command Center (`/agents`) — ⚠️ Partial

| Feature | Status | Detail |
|---------|--------|--------|
| 5-agent roster with live states | ✅ | Shows all 5 agents with state dots (idle/observing/thinking/acting), department colors, last run, decision counts |
| 5-second auto-poll | ✅ | `setInterval(fetchData, 5000)` confirmed at line 64 |
| Run All button | ✅ | Calls `/api/agents/run-all` — runs all due agents |
| Decision log tab | ✅ | Shows recent decisions across all agents with reasoning, action, skill used, confidence |
| Inter-agent messages tab | ✅ | Shows messages between agents with from/to, type (info/handoff/request/alert), read status |
| Content feed tab | ✅ | Shows recent content pieces created by agents |
| Link to agent detail | ✅ | Each agent card links to `/agents/[id]` |
| Expert persona names | ❌ | UI shows generic names ("Head of Marketing") — not "Alex Hormozi". Seeded agent names in DB are generic, but think prompt references expert names |
| Task Kanban board | 🚫 | **P0 MISSING** — no task-level view of what agents are working on |
| Agent blocking indicators | ❌ | No visual for when an agent is blocked (missing MCP token, LLM down, etc.) |
| Delegation chain visualization | 🚫 | Messages show from/to but no chain visualization |

#### Agent Detail (`/agents/[id]`) — ⚠️ Partial

| Feature | Status | Detail |
|---------|--------|--------|
| Decision log | ✅ | Shows agent's decisions with observation, reasoning, action, skill, confidence, timestamp |
| Memory view | ✅ | Displays agent's memory as JSON |
| Assigned skills | ✅ | Lists skills with execute buttons |
| Agent config | ⚠️ | Shows schedule and department but no edit UI |
| Live progress bar during runs | ⚠️ | State indicator exists but no real-time progress bar — polling shows state change (observing → thinking → acting → idle) |
| Run button | ✅ | Triggers `/api/agents/[id]/run` |
| Link to chat | ✅ | Links to `/agents/[id]/chat` |

#### Agent Chat (`/agents/[id]/chat`) — ⚠️ Partial

| Feature | Status | Detail |
|---------|--------|--------|
| Chat sessions | ✅ | Creates/switches sessions via `/api/agents/[id]/chat` GET with `action=sessions` |
| Message send/receive | ✅ | POST to `/api/agents/[id]/chat` with message, returns agent response |
| Markdown rendering | ✅ | Uses custom markdown renderer with bold, italic, lists, code blocks |
| Code blocks with copy | ✅ | Syntax-highlighted code blocks with copy button |
| Feedback (thumbs up/down) | ✅ | Sends feedback via POST with `action=feedback` |
| Regenerate | ✅ | POST with `action=regenerate`, re-runs last response |
| Follow-up suggestions | ✅ | Agent generates suggested next questions |
| Search | ✅ | POST with `action=search`, searches across sessions |
| Export | ✅ | POST with `action=export`, downloads as markdown |
| Voice input | ✅ | **CORRECTED**: Web Speech API IS initialized — checks for webkitSpeechRecognition/SpeechRecognition, appends transcribed text to input, handles unsupported browsers |
| Model switcher | ⚠️ | Dropdown exists and passes `connection_id` to API. But UI doesn't visually indicate which model is active per message |
| Delegation labels | ⚠️ | Shows `[Delegated from X]` prefix in messages but no special UI treatment |
| Agent label per message | ✅ | Shows agent name and department on each response |

#### Projects (`/projects`) — ✅ Complete

| Feature | Status | Detail |
|---------|--------|--------|
| Project list | ✅ | Fetches from `/api/projects` |
| Create project | ✅ | POST to `/api/projects` with name, description, niche, target audience |
| Auto-generates action plan on creation | ✅ | API calls LLM to generate 8-step action plan (define-niche, define-offer, skill executions, etc.) |
| Project status badges | ✅ | idea/active/shipped/archived |

#### Project Detail (`/projects/[id]`) — ⚠️ Partial

| Feature | Status | Detail |
|---------|--------|--------|
| Action plan display | ✅ | Renders the guided action plan with step-by-step cards |
| Step execution | ✅ | Each step triggers skill execution with project context injected |
| Skill results display | ✅ | Shows generated content inline |
| Content saving (insight, email, post, etc.) | ✅ | Saves generated content to appropriate tables |
| Project editing | ⚠️ | Can update niche and target audience but no full edit form |
| Delete project | ✅ | **CORRECTED**: Delete button exists on projects list page with confirmation dialog. Cascade deletes related data |

---

### 2. Ideas Module

#### IdeaBrowser (`/ideabrowser`) — ⚠️ Partial

| Feature | Status | Detail |
|---------|--------|--------|
| Browse 229+ ideas | ✅ | Fetches from `/api/ideabrowser/ideas` with search, category filter, sort |
| Scoring display | ✅ | Shows overall_score and individual metric scores (search_volume, growth_rate, pain_level, etc.) |
| Score all button | ✅ | Calls `/api/ideabrowser/score` for instant deterministic scoring |
| LLM scoring | ⚠️ | Button exists but LLM scoring is slow and can timeout. No progress indicator |
| Import from GitHub | ✅ | `/api/ideabrowser/ideas` POST imports from GitHub archive |
| Auto-assign to Peter Thiel | ✅ | Automation sync creates agent message to agent-research |
| Trends section | ⚠️ | `/api/ideabrowser/trends` exists but returns empty data unless manually seeded |
| Market insights section | ⚠️ | `/api/ideabrowser/market-insights` exists but same issue — needs manual seeding |
| Link idea to project | ✅ | Can create project from idea |
| Idea detail view | ⚠️ | `/api/ideabrowser/ideas/[id]` exists with generate route but no dedicated UI page — just modal/inline |

#### Browse (`/browse`) — ❌ Stub

| Feature | Status | Detail |
|---------|--------|--------|
| Browse page | ❌ | This page exists in sidebar but is NOT in the spec's 18 pages. It appears to be a legacy page. 510 lines. Should either be integrated into IdeaBrowser or removed |

---

### 3. Arsenal Module

#### Skills (`/skills`) — ⚠️ Partial

| Feature | Status | Detail |
|---------|--------|--------|
| List 15 skills | ❌ | Only 14 skills seeded. `skill-human-tone-writer` is missing from both `seedSkills()` and `seedNewSkills()` |
| Skill cards with descriptions | ✅ | Renders skill name, description, category, sub-agents |
| Execute skill | ✅ | POST to `/api/skills/[id]/execute` with input and project_id |
| LLM execution with brand voice | ✅ | Skill execution queries brand_voices table and injects into prompt |
| Agent persona injection | ✅ | When called from agent run, persona is prepended to skill input |
| Skill scheduling | ⚠️ | `skill_schedules` table exists, automation engine processes them, but no UI to create/manage schedules |

#### Blueprints (`/blueprint`) — ⚠️ Partial

| Feature | Status | Detail |
|---------|--------|--------|
| Blueprint list | ✅ | Fetches from `/api/blueprints` |
| 12-layer metrics framework | ✅ | `/api/metrics/generate` generates full 12-layer blueprint via LLM |
| Blueprint detail | ✅ | `/blueprint/[id]` shows layer-by-layer dashboard |
| Execute single layer | ✅ | `/api/blueprints/[id]/execute-layer` POST |
| Execute all layers | ✅ | `/api/blueprints/[id]/execute-all` POST |
| Layer status tracking | ✅ | `layer_status` JSON column tracks per-layer completion |
| Link blueprint to project | ✅ | `project_id` foreign key |
| Link blueprint to idea | ✅ | `idea_id` column |

#### Metrics (`/metrics`) — ✅ Complete

| Feature | Status | Detail |
|---------|--------|--------|
| Niche input form | ✅ | Takes niche input and generates 12-layer blueprint |
| LLM generation | ✅ | Calls `/api/metrics/generate` with LLM fallback |
| Result display | ✅ | Renders all 12 layers with KPIs, formulas, targets |
| Save as blueprint | ✅ | Saves to blueprints table |

#### Connections (`/connections`) — ⚠️ Partial

| Feature | Status | Detail |
|---------|--------|--------|
| LLM provider management | ✅ | CRUD for Ollama, Anthropic, OpenAI connections with priority |
| Claude Code SDK auto-detect | ✅ | `/api/auth/claude-token` reads `~/.claude/.credentials.json` |
| One-click Ollama setup | ✅ | Detects Ollama at localhost:11434, adds with priority 2 |
| Priority ordering | ✅ | Primary (1) / fallback (2) system works |
| Platform connections + OAuth | ✅ | Full OAuth flows implemented via `/api/auth/[platform]` and `/api/auth/[platform]/callback`. Supports Twitter (with PKCE), LinkedIn, Facebook, Instagram, TikTok, YouTube. State/CSRF protection, token exchange, user info fetching. Email via manual SMTP config |
| MCP tools registry | ✅ | 11 MCP tools with connect/disconnect API. POST `/api/mcp/tools` links platform_connection_id to tools |
| Connection testing | ❌ | No "test connection" button to verify credentials work |

---

### 4. Growth Module

#### Outbound (`/outbound`) — ⚠️ Partial

| Feature | Status | Detail |
|---------|--------|--------|
| Contact list | ✅ | Fetches from `/api/outbound`. Shows name, email, company, role, status, lead score |
| Create contact | ✅ | POST to `/api/outbound` |
| Auto-enroll in welcome sequence | ✅ | API checks for active welcome sequence and enrolls new contacts |
| Send email | ⚠️ | `/api/outbound/[id]/send` exists but uses platform_connections for SMTP. If no email connection configured, it silently fails |
| Lead score display | ✅ | Shows lead_score column from outbound_contacts |
| Contact tags | ⚠️ | `tags` column exists in schema but no UI to manage tags |
| Engagement history | ❌ | `engagement_history` column exists but never populated — always `[]` |
| Search/filter | ⚠️ | Basic search by name/email. No advanced filters (by score, status, tags) |

#### Audience (`/audience`) — ⚠️ Partial

| Feature | Status | Detail |
|---------|--------|--------|
| Content list | ✅ | Fetches from `/api/content` |
| Create content | ✅ | POST with type (post, email, script, lead_magnet, landing_page), title, content, platform |
| Content publishing with UTM | ✅ | `/api/content/[id]/publish` generates UTM-tracked URLs for Instagram/TikTok/YouTube |
| **Email publish BUG** | ❌ | **CRITICAL: Line 515 in publish/route.ts sends to `conn.from_email` (sender's own address) instead of recipients. Emails never reach the audience** |
| Auto-schedule at best time | ✅ | Creates scheduled_post via `/api/social-schedule` with best-time logic |
| Content repurposing | ✅ | `/api/content-repurpose` takes one piece → generates for multiple platforms |
| AI image generation | ⚠️ | `/api/media/generate` calls DALL-E but requires OpenAI API key. No fallback if key missing |
| Content status management | ✅ | draft → scheduled → published → archived |

#### Newsletters (`/newsletters`) — ❌ Stub (A/B testing)

| Feature | Status | Detail |
|---------|--------|--------|
| Newsletter list | ✅ | Fetches from `/api/newsletters` |
| Create newsletter | ✅ | POST with title, subject, content, type, recipients |
| AI generation | ✅ | `/api/newsletters/[id]/generate` creates newsletter content via LLM |
| A/B testing UI | ❌ | **Schema has subject_b, subject_c, subject_d, ab_test_sample_pct, ab_winner columns — but the API never reads or writes them. No A/B split logic. Sends variant A to everyone** |
| Send newsletter | ⚠️ | Send button exists but relies on platform_connections email/SMTP. Silently fails if not configured |
| Open/click tracking | ❌ | `open_rate`, `click_rate` columns exist in schema but are never updated — always 0 |
| Analytics display | ❌ | UI shows open/click rates but they're always 0 |

#### Ads (`/ads`) — ❌ Stub

| Feature | Status | Detail |
|---------|--------|--------|
| Campaign list | ✅ | Fetches from `/api/ads` |
| Create campaign | ✅ | POST with platform (facebook/google/tiktok), name, objective, budget, targeting, copy |
| Variant generator | ✅ | `/api/ads/generate-variants` creates combinatorial ad variants via LLM |
| Ad rules | ✅ | `/api/ad-rules` CRUD for automated rules |
| Platform connection — Facebook | ⚠️ | Facebook launch exists (`/api/ads/[id]/launch`) and calls Facebook Marketing API to create campaigns (status=PAUSED). But requires manual platform_connections OAuth setup |
| Platform connection — Google/TikTok | ❌ | Google and TikTok launch only generate specs with deep links — no actual API calls. User must copy to Ads Manager manually |
| Campaign status management | ⚠️ | Facebook campaigns get platform_campaign_id on launch. Google/TikTok stay local |
| Performance metrics | ❌ | No real metrics fetching from ad platforms |
| Budget tracking | ❌ | Budgets are stored but never compared to actual spend |

#### Analytics (`/analytics`) — ❌ Stub

| Feature | Status | Detail |
|---------|--------|--------|
| Platform metrics display | ❌ | `/api/analytics` fetches from `content_analytics` table but data is never populated from real platforms. All metrics (impressions, clicks, likes, shares) stay at 0 |
| Cross-platform dashboard | ❌ | UI renders charts but with no data — all zeros |
| Google Analytics integration | 🚫 | MCP tool registered but no actual API calls to Google Analytics |
| Analytics recommendations | 🚫 | `auto_analytics_recommendations` setting exists but no implementation |

---

### 5. Sales Module

#### Pipeline (`/pipeline`) — ⚠️ Partial

| Feature | Status | Detail |
|---------|--------|--------|
| 7-stage Kanban board | ✅ | Lead → Contacted → Qualified → Proposal → Negotiation → Won → Lost. Proper column layout |
| Create deal | ✅ | Modal form with title, value, stage |
| Deal cards | ✅ | Shows title, value, expected close date |
| Deal value totals | ✅ | Pipeline total and Won total calculated |
| Lead scoring on stage change | ❌ | **CRITICAL BUG**: Line 90 in deals/route.ts uses `MAX(0, lead_score + ?)` in SET clause — SQLite does NOT support `MAX()` in SET. Query silently fails. Lead scores are NEVER actually updated on deal stage changes |
| Auto-task creation on stage change | ✅ | Automation engine step 4 creates follow-up tasks from deal stage change activities |
| Drag-and-drop | 🚫 | No drag-and-drop between columns — must create deals at specific stages |
| Deal stage change from UI | 🚫 | **No buttons to move a deal between stages in the UI. API PATCH exists but UI doesn't use it** |
| Contact linking | ❌ | `contact_id` column exists but create form doesn't link to outbound contacts |
| Deal detail view | 🚫 | No deal detail page — cards are display-only |
| Deal activity timeline | 🚫 | `deal_activities` table is populated but no UI to view it |

#### Affiliates (`/affiliates`) — ⚠️ Partial

| Feature | Status | Detail |
|---------|--------|--------|
| Affiliate list | ✅ | Fetches from `/api/affiliates` |
| Create affiliate | ✅ | POST with name, email, commission rate, type |
| Referral code generation | ✅ | Auto-generates unique referral codes |
| Commission tracking | ✅ | Subscriptions with referral codes DO auto-create commissions (amount × rate) with 30-day payout date. Affiliate totals (total_referrals, total_earned) auto-updated |
| Commission payout | ❌ | No payout mechanism — status stays at "pending" |
| Dashboard stats | ⚠️ | Shows total_referrals, total_earned, total_paid but values are always 0 because commissions are never created |

---

### 6. Cross-Cutting Systems

#### Automation Engine (`/api/automation/process`) — ⚠️ Partial

| Step | Status | Detail |
|------|--------|--------|
| 1. Scheduled posts → publish | ✅ | Calls `/api/social-schedule/process` to auto-publish due posts |
| 2. Email sequences → send | ✅ | Queries due contacts, advances sequence steps, sends via `/api/outbound/[id]/send` |
| 3. Payment retries | ⚠️ | Finds failed payments and schedules next retry (1, 3, 7, 14 days). But **doesn't actually attempt payment** — no Stripe API call. Just increments retry_count |
| 4. Deal follow-ups → tasks | ✅ | Creates tasks from recent deal stage changes with stage-specific templates |
| 5. Skill schedules → execute | ✅ | Runs due skill_schedules via `/api/skills/[id]/execute` |
| 6. Agent runs → execute | ✅ | Runs due agents via `/api/agents/[id]/run` |
| 7. IdeaBrowser sync | ✅ | Daily sync from GitHub archive, assigns to Peter Thiel |
| Concurrency guard | ✅ | Checks for running automation within 5 minutes |
| Settings (11 toggles) | ✅ | All 11 toggles seeded, `/api/automation/settings` CRUD |
| No trigger/scheduler | ❌ | **Heartbeat endpoint exists but nothing triggers it automatically. No cron, no setInterval, no external scheduler. Must be called manually or via external cron** |

#### Event-Driven Triggers

| Trigger | Status | Detail |
|---------|--------|--------|
| Project created → auto action plan | ✅ | `/api/projects` POST generates action plan via LLM |
| Contact added → auto welcome sequence | ✅ | `/api/outbound` POST checks for active welcome sequence |
| Content created → auto schedule | ⚠️ | Logic exists in `/api/content` but only if `auto_schedule_content` setting is true AND a platform is specified |
| Deal stage change → auto lead score | ✅ | `/api/deals` PATCH updates lead_score on outbound_contacts |
| Deal stage change → auto task | ✅ | Automation step 4 creates tasks from deal_activities |
| Webinar registration → auto contact + tag | ✅ | `/api/webinars` with action='register' creates outbound_contact with 'webinar-registrant' tag. Attendance tracking adds lead_score (75%+=25pts, 50%+=15pts) |
| Webinar attendance → sequence enrollment | ❌ | Attendance tracked and scored but NO post-webinar sequence enrollment |
| Subscription with referral → auto commission | ✅ | `/api/subscriptions` checks affiliate by referral_code, calculates commission = amount × rate, creates commission with 30-day payout date |
| Content repurposed → auto schedule | ✅ | `/api/content-repurpose` creates scheduled_posts |
| Agent completes → auto notify | ✅ | Agent run sends Telegram/Slack notification via `/api/agents/notify` |
| New idea → auto-assign to Thiel | ✅ | IdeaBrowser sync assigns to agent-research |

#### Agent System

| Feature | Status | Detail |
|---------|--------|--------|
| Observe-Think-Act loop | ✅ | Full implementation with department-specific observations, LLM think step, skill execution act step |
| LLM fallback (Claude → Ollama) | ✅ | `callLLM()` supports anthropic (Claude Agent SDK), ollama, and openai-compatible. Fallback on primary failure |
| Inter-agent messaging | ✅ | Messages table with from/to, types (info/request/handoff/alert), read tracking |
| Delegation chains | ✅ | Handoff/request messages trigger target agent's chat endpoint |
| Agent memory | ✅ | Persistent memory in JSON, updated per-run via `memory_update` |
| Expert persona names | ⚠️ | Think prompt includes expert names (Alex Hormozi, etc.) in team table, but DB-stored names are generic ("Head of Marketing") |
| System admin (Marty only) | ✅ | `system_action` field processed only for agent-product. Can create/update skills, assign skills, update agent config, add MCP tools, clear messages |
| Telegram bot | ⚠️ | Webhook endpoint exists with command routing (`/marketing`, `/sales`, etc.). But requires manual setup and bot token configuration |
| Slack bot | ⚠️ | Webhook endpoint exists. Routes via `@marketing`, `@sales` mentions. Basic implementation |
| Generic webhook | ✅ | Simple POST `{agent_id, message}` handler |
| Notifications | ✅ | `/api/agents/notify` sends to Telegram and Slack when agents complete work |
| Agent Activity Kanban | 🚫 | **P0 MISSING — no `agent_tasks` table, no task-level tracking, no Kanban view** |

#### Brand Voice

| Feature | Status | Detail |
|---------|--------|--------|
| Brand voice CRUD | ✅ | `/api/brand-voice` manages brand_voices table |
| Injection into skills | ✅ | Skill execution queries brand_voices and injects tone/rules into prompt |
| Injection into landing pages | ❌ | `/api/landing-pages` doesn't query brand_voices |

#### MCP Tools

| Feature | Status | Detail |
|---------|--------|--------|
| 11 tools registered | ✅ | Seeded in schema with name, description, category, connection_type |
| Tool registry API | ✅ | `/api/mcp/tools` lists all tools with connect/disconnect actions |
| OAuth for social tools | ✅ | Full OAuth flows via `/api/auth/[platform]` for Twitter, LinkedIn, Facebook, Instagram, TikTok, YouTube |
| Actual MCP execution | ❌ | **No MCP protocol execution. Tools can be linked to platform_connections but agents can't invoke them to perform actions (send email, create page, etc.)** |
| Tool usage by agents | ❌ | Agent think prompt lists MCP tools but agents can't actually use them |

---

### Audit Summary

| Category | ✅ Complete | ⚠️ Partial | ❌ Stub/Broken | 🚫 Missing |
|----------|------------|------------|---------------|------------|
| Command Center | 3 | 8 | 4 | 5 |
| Ideas | 2 | 5 | 1 | 0 |
| Arsenal | 2 | 6 | 1 | 1 |
| Growth | 5 | 8 | 10 | 2 |
| Sales | 3 | 3 | 3 | 4 |
| Cross-cutting | 12 | 8 | 6 | 2 |
| **Total** | **27** | **38** | **25** | **14** |

**Overall**: 27 features fully complete, 38 partial, 25 stub/broken, 14 missing. **26% complete, 37% partial, 37% broken or missing.**

### Infrastructure Issues

| Issue | Severity | Detail |
|-------|----------|--------|
| **Missing database indexes** | Medium | No `CREATE INDEX` for frequently queried columns: `projects(status)`, `deals(stage)`, `outbound_contacts(lead_score)`, `content_pieces(project_id, status)`, `activity_log(created_at)`, `ideabrowser_ideas(overall_score)`. Will cause performance degradation at scale |
| **API keys stored plaintext** | High | `api_key_encrypted` column name is misleading — no encryption implementation exists. Keys stored as plain text in SQLite |
| **No cron/scheduler for automation** | High | Automation heartbeat endpoint exists but nothing triggers it automatically. No cron job, no setInterval, no external scheduler configured |

---

## Phase 2 — Competitive Benchmark

### AI Agent Command Centers

| Feature | Copilot Studio | Vertex AI | watsonx | Bedrock | CrewAI | **Five Rails** |
|---------|---------------|-----------|---------|---------|--------|----------------|
| Agent monitoring dashboard | ✅ Real-time traces | ✅ Agent dashboard | ✅ Skill flows | ✅ CloudWatch | ✅ Crew dashboard | ⚠️ Activity feed only |
| Task-level Kanban | ✅ Topic tree | ⚠️ | ✅ Skill cards | ⚠️ | ✅ Task board | 🚫 Missing |
| Multi-agent coordination | ✅ | ⚠️ Sequential | ✅ Orchestration | ⚠️ | ✅ Crews + tasks | ⚠️ Messages only |
| Agent observability | ✅ Full traces | ✅ Trace viewer | ✅ Logs + traces | ✅ CloudWatch | ✅ Verbose logging | ❌ Decision log only |
| Error/retry handling | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ Fallback only |
| Agent state machine | ✅ | ✅ | ✅ | ⚠️ | ✅ | ⚠️ 4 states, no blocked |

### Solopreneur AI Stacks

| Feature | Clay | Instantly/Apollo | Parallel AI | **Five Rails** |
|---------|------|-----------------|-------------|----------------|
| Outbound sequences | ✅ Visual builder | ✅ Multi-channel | ⚠️ | ⚠️ DB-only |
| Lead scoring | ✅ Enrichment | ✅ AI scoring | ⚠️ | ⚠️ Rule-based |
| Pipeline CRM | ⚠️ | ✅ Full CRM | ⚠️ | ⚠️ No drag-drop |
| Email deliverability | ✅ | ✅ Warmup | ⚠️ | ❌ No tracking |
| Contact enrichment | ✅ 75+ sources | ✅ Built-in | ⚠️ | 🚫 Missing |
| Agent task tracking | ⚠️ | ⚠️ | ✅ Kanban | 🚫 Missing |

### Feature-Specific Competitors

| Feature | Beehiiv | HubSpot | n8n | Amplitude | **Five Rails** |
|---------|---------|---------|-----|-----------|----------------|
| Newsletter A/B testing | ✅ Auto-winner | ✅ | N/A | N/A | ❌ Schema only |
| CRM pipeline | N/A | ✅ Drag-drop + forecasting | N/A | N/A | ⚠️ No drag-drop |
| Workflow automation | N/A | ✅ | ✅ Visual builder | N/A | ⚠️ Heartbeat only |
| Funnel analytics | N/A | ✅ | N/A | ✅ Full funnel | ❌ Table only |
| Lead scoring | N/A | ✅ AI + rule-based | N/A | N/A | ⚠️ Basic rules |
| Real-time analytics | ✅ | ✅ | ✅ | ✅ | ❌ No real data |

### Key Competitive Insights

1. **Agent observability**: 4/5 competitors have full trace/monitoring. Microsoft has fleet-level dashboards + ROI per agent. AWS has three-view (Agents/Sessions/Traces). IBM has step-by-step telemetry. Google has trace flyout visualization. Five Rails has only a decision log.

2. **Multi-agent delegation**: CrewAI has hierarchical delegation with `allowed_agents` and manager agents. Google's A2A protocol enables dynamic agent discovery. Both map directly to Five Rails' 5-agent delegation system.

3. **A/B testing**: Beehiiv has dedicated A/B tab with auto-winner selection and 3D analytics visualization. Five Rails has schema columns but zero implementation.

4. **CRM pipeline**: HubSpot has drag-and-drop Kanban extended to Deals + Tasks + Leads + Contacts, two-column deal detail sidebar, AI forecasting. Apollo has dynamic AI lead scoring. Five Rails has static Kanban with no interaction.

5. **Workflow automation**: n8n has real-time execution preview, dedicated error workflows, save/resume on failure, execution logs. Five Rails has a heartbeat endpoint with no scheduler.

6. **Analytics**: Amplitude has funnel-to-pathfinder bridge + session replay. Mixpanel has Metric Trees connecting business KPIs to product inputs. Five Rails has empty tables.

### Priority UX Patterns to Adopt

| Pattern | Source | Five Rails Application |
|---------|--------|----------------------|
| Step-by-step execution trace | Google/AWS/IBM | Agent Kanban — show observe→think→act steps per card |
| Error classification (server vs client) | AWS Bedrock | Kanban blocked column — categorize blocker type |
| ROI per agent/skill | Microsoft Copilot Studio | Dashboard — time/money saved per agent |
| A/B test tab with auto-winner | Beehiiv | Newsletter page — dedicated A/B tab |
| Two-column deal detail | HubSpot | Pipeline — context + actions in one pane |
| Real-time execution preview | n8n | Skill execution — show intermediate output |
| Waterfall enrichment | Clay | Multi-LLM fallback (already partial) |
| Metric Trees | Mixpanel | Dashboard — connect KPIs to underlying metrics |
| Tab-by-tab campaign builder | Instantly | Outbound sequences — Leads→Sequence→Timing→Send |
| Dynamic lead scoring | Apollo/HubSpot | Pipeline — scores update with every interaction |

---

## Phase 3 — Gap Analysis

| # | Feature | Page/URL | Status | What's Broken/Missing | Competitor Coverage | Priority | Effort |
|---|---------|----------|--------|----------------------|--------------------|---------:|--------|
| 1 | **Agent Activity Kanban** | `/agents` (new tab or `/agents/kanban`) | 🚫 Missing | No `agent_tasks` table, no task cards, no state machine, no Kanban view. Must extend agents table, create new tables + API routes, hook into agent run + automation | 4/5 command centers have this | **P0** | L |
| 2 | **Expert persona names in DB** | `/agents`, seed data | ❌ Broken | Agents seeded as "Head of Marketing" not "Alex Hormozi". Think prompt has expert names but DB and UI don't | Core identity feature | **P0** | S |
| 3 | **Pipeline drag-and-drop + stage change UI** | `/pipeline` | 🚫 Missing | API PATCH for stage change exists but UI has no way to move deals. No drag-and-drop, no stage buttons | 5/5 CRM competitors | **P0** | M |
| 4 | **Deal detail view + activity timeline** | `/pipeline` | 🚫 Missing | deal_activities logged but no UI to view. No deal detail page | 5/5 CRM competitors | **P0** | M |
| 5 | **Newsletter A/B testing** | `/newsletters` | ❌ Stub | Schema columns exist but API never reads/writes them. No split logic, sends A to everyone | 5/5 newsletter competitors | **P0** | M |
| 6 | **Missing skill: Human Tone Writer** | `/skills` | ❌ Missing | Only 14/15 skills seeded. `skill-human-tone-writer` not in seedSkills or seedNewSkills | Spec requirement | **P0** | S |
| 7 | **Voice input in agent chat** | `/agents/[id]/chat` | ❌ Broken | Button renders but Web Speech API never initialized | Chat feature spec | **P0** | S |
| 8 | **Email publish sends to self** | `/audience` | ❌ CRITICAL BUG | Line 515 in `content/[id]/publish/route.ts` — `to: [conn.from_email]` sends to sender, not recipients. Must change to actual recipient list | Fundamental bug | **P0** | S |
| 9 | **Lead scoring SQLite bug** | `/api/deals` | ❌ CRITICAL BUG | Line 90 uses `MAX(0, lead_score + ?)` in SET clause — invalid SQLite. Lead scores silently never update on deal stage changes. Fix: use `CASE WHEN` or app logic | Core CRM feature | **P0** | S |
| 10 | **Error states on all pages** | All pages | ❌ Missing | Most pages use `.catch(() => [])` — errors silently swallowed. No error toasts, no retry buttons | Industry standard | **P0** | M |
| 9 | **Dashboard agent KPIs + automation status** | `/dashboard` | 🚫 Missing | No agent state/blocked/running indicators. No automation heartbeat status | Command center requirement | **P1** | M |
| 10 | **MCP tool execution** | `/connections` | ⚠️ Partial | 11 tools registered with connect/disconnect API. OAuth flows exist for social platforms. But **no actual MCP protocol execution** — tools can't be invoked by agents to perform actions (e.g., agents can't actually send Gmail or create Notion pages) | Core architecture claim | **P1** | L |
| 11 | ~~OAuth platform connections~~ | `/connections` | ✅ Complete | **CORRECTED**: Full OAuth flows exist at `/api/auth/[platform]` with PKCE (Twitter), state CSRF protection, token exchange for all 6 platforms | N/A | ~~P1~~ | ~~XL~~ |
| 12 | **Ad platform API integration** | `/ads` | ❌ Stub | Campaigns stored locally only. Never submitted to Facebook/Google/TikTok. No real metrics | Core ads feature | **P1** | XL |
| 13 | **Analytics data pipeline** | `/analytics` | ❌ Stub | content_analytics table always empty. No data from real platforms | Core analytics feature | **P1** | L |
| 14 | ~~Affiliate commission auto-creation~~ | `/affiliates` | ✅ Complete | **CORRECTED**: Subscriptions DO auto-create commissions via referral_code lookup | N/A | ~~P1~~ | ~~M~~ |
| 15 | **Payment retry with Stripe** | `/api/automation/process` | ⚠️ Partial | Schedules retries but never calls Stripe API. Just increments counter | Revenue feature | **P1** | L |
| 16 | **Automation heartbeat scheduler** | Cross-cutting | ❌ Missing | Endpoint exists but nothing triggers it. No cron, no setInterval | Core automation | **P1** | S |
| 17 | **Webinar → post-webinar sequence** | `/api/webinars` | ⚠️ Partial | **CORRECTED**: Registration DOES create contacts + tags + lead scoring. But post-webinar sequence enrollment is still missing | Automation gap | **P2** | M |
| 18 | **Engagement history tracking** | `/outbound` | ❌ Broken | `engagement_history` column always `[]`. Never populated | CRM requirement | **P1** | M |
| 19 | **Contact tags UI** | `/outbound` | ⚠️ Missing UI | Tags column exists but no UI to add/filter by tags | Standard CRM feature | **P2** | S |
| 20 | **Landing page brand voice** | `/api/landing-pages` | ❌ Broken | Doesn't inject brand voice when generating pages | Spec requirement | **P2** | S |
| 21 | **Skill scheduling UI** | `/skills` | 🚫 Missing | `skill_schedules` table + automation step work but no UI to create/manage | Useful feature | **P2** | M |
| 22 | **Connection testing button** | `/connections` | 🚫 Missing | No "test connection" to verify LLM/platform credentials | UX quality | **P2** | S |
| 23 | ~~Delete project button~~ | `/projects/[id]` | ✅ Complete | **CORRECTED**: Delete button exists with confirmation dialog | N/A | ~~P2~~ | ~~S~~ |
| 24 | **Browse page cleanup** | `/browse` | ❌ Legacy | Page exists but isn't in spec. Should be merged into IdeaBrowser or removed | Cleanup | **P2** | S |
| 25 | **Funnel analytics visualization** | `/analytics` | ❌ Stub | funnel_events tracked but never visualized | Analytics competitor parity | **P2** | M |
| 26 | **Newsletter open/click tracking** | `/newsletters` | ❌ Broken | open_rate/click_rate always 0. No tracking pixel or link wrapping | Newsletter competitor parity | **P2** | L |
| 27 | **Loading skeletons** | All pages | ⚠️ Partial | All pages use simple spinners, not skeleton screens | UX quality | **P3** | M |
| 28 | **Advanced contact filters** | `/outbound` | ⚠️ Missing | Only basic name/email search. No filter by score, status, tags, sequence | CRM standard | **P3** | M |

**Effort key**: S = Small (< 2 hours), M = Medium (2-6 hours), L = Large (6-20 hours), XL = Extra Large (20+ hours)

---

## Phase 4 — Implementation Specs

### Phased Rollout Plan
- **v1.1**: P0 fixes (Agent Kanban, persona names, pipeline UX, A/B testing, missing skill, voice input, error states)
- **v1.2**: P1 features (MCP integration, OAuth flows, ad platforms, analytics pipeline, automation scheduler)
- **v1.3**: P2/P3 polish (skill scheduling UI, funnel visualization, advanced filters, loading skeletons)

---

### P0-1: Agent Activity Kanban Board

**What it does**: Real-time task-level Kanban showing what each of the 5 agents is actively working on, what's queued, what's blocked, and what's done.

**Key user flows**:
1. User opens `/agents` → sees new "Kanban" tab alongside existing Overview/Decisions/Messages/Content tabs
2. Board shows 5 columns: Idle, Queued, Working, Blocked, Done
3. Each card shows task name, agent avatar, current step, skill being used, progress, elapsed time, delegation source
4. When agent runs via `/api/agents/[id]/run`, cards move in real-time (5s polling or SSE)
5. User can create tasks and assign to specific agents
6. "Resolve blocker" button on blocked cards links to relevant fix page (e.g., `/connections` for missing API key)

**Component connections**:
- **API routes to modify**: `/api/agents/[id]/run/route.ts` (create/update task cards during observe-think-act), `/api/automation/process/route.ts` (create task cards when heartbeat triggers agents)
- **New API routes**:
  - `GET /api/agents/tasks` — list all tasks, filterable by agent_id, status
  - `POST /api/agents/tasks` — create task and assign to agent
  - `GET /api/agents/tasks/board` — board view grouped by status, with agent info
  - `PATCH /api/agents/tasks/[id]/status` — state transition with validation
  - `POST /api/agents/tasks/[id]/resolve` — clear blocker, transition blocked→queued
- **New SQLite tables**:
  ```sql
  CREATE TABLE IF NOT EXISTS agent_tasks (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'idle' CHECK(status IN ('idle','queued','working','blocked','done')),
    agent_id TEXT NOT NULL,
    skill_id TEXT,
    progress_pct INTEGER DEFAULT 0,
    current_step_label TEXT,
    blocker_reason TEXT,
    delegated_by TEXT,
    depends_on TEXT DEFAULT '[]',
    started_at TEXT,
    completed_at TEXT,
    output_ref TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS agent_task_transitions (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    from_status TEXT NOT NULL,
    to_status TEXT NOT NULL,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (task_id) REFERENCES agent_tasks(id) ON DELETE CASCADE
  );
  ```
- **Agent hooks**: Agent run creates a task (status: working), updates current_step_label during observe/think/act, moves to done on completion or blocked on error
- **Automation hooks**: Heartbeat step 6 creates queued tasks for due agents before running them
- **State machine**: idle→queued, queued→working, working→blocked, working→done, blocked→queued (resolve), done→idle (only valid transitions)

**Data flow**:
1. User or automation triggers agent run → API creates `agent_task` row (status: queued)
2. Agent enters observe → task status: working, current_step_label: "Observing content_pieces..."
3. Agent enters think → current_step_label: "Analyzing observations, deciding next action..."
4. Agent enters act → current_step_label: "Executing skill-content-engine", progress_pct increments
5. Agent completes → status: done, output_ref: decision_id or content_piece_id
6. If LLM fails + fallback fails → status: blocked, blocker_reason: "No LLM connection available"
7. User resolves → POST `/resolve` → status: queued → re-run

**Edge cases**:
- Both LLMs down: task moves to blocked with "No LLM connection available" and link to `/connections`
- Missing MCP token: blocked with specific tool name and link to `/connections`
- SQLite lock during concurrent agent runs: use WAL mode (already enabled), catch SQLITE_BUSY and retry
- Agent stuck in working >5 min: show amber warning, offer "Force Reset" button
- All 5 agents running simultaneously: queue them, process sequentially with task cards showing order

**Acceptance criteria**:
- [ ] Cards move between columns within 5s of state change
- [ ] Blocked notifications fire to Telegram/Slack via existing `/api/agents/notify`
- [ ] Progress updates show during observe-think-act cycle
- [ ] Delegation chains render (source agent shown on card)
- [ ] State machine rejects invalid transitions (returns 400)
- [ ] Board survives page navigation and returns to correct state
- [ ] "Resolve blocker" links to correct fix page

**Files to modify**:
- `src/lib/db/schema.ts` — add agent_tasks + agent_task_transitions tables
- `src/lib/db/index.ts` — add task CRUD functions
- `src/app/api/agents/[id]/run/route.ts` — create/update tasks during run
- `src/app/api/automation/process/route.ts` — create queued tasks for step 6
- `src/app/agents/page.tsx` — add Kanban tab
- New: `src/app/api/agents/tasks/route.ts` — GET/POST tasks
- New: `src/app/api/agents/tasks/[id]/route.ts` — PATCH status
- New: `src/app/api/agents/tasks/[id]/resolve/route.ts` — POST resolve

---

### P0-2: Fix Expert Persona Names

**What it does**: Update seeded agent names from generic to expert personas.

**Files to modify**: `src/lib/db/schema.ts` — `seedAgents()` function

**Migration SQL**:
```sql
UPDATE agents SET name = 'Alex Hormozi' WHERE id = 'agent-marketing';
UPDATE agents SET name = 'Chris Voss' WHERE id = 'agent-sales';
UPDATE agents SET name = 'Marty Cagan' WHERE id = 'agent-product';
UPDATE agents SET name = 'Peter Thiel' WHERE id = 'agent-research';
UPDATE agents SET name = 'Ray Dalio' WHERE id = 'agent-executive';
```

Also update system_prompt for each agent to reference their expert frameworks:
- Hormozi: $100M Offers, Value Equation, Grand Slam Offers
- Voss: Never Split the Difference, Tactical Empathy, Calibrated Questions
- Cagan: Inspired, Empowered, Product Operating Model
- Thiel: Zero to One, Contrarian Question, Monopoly Theory
- Dalio: Principles, Radical Transparency, Idea Meritocracy

---

### P0-3: Pipeline Drag-and-Drop + Deal Detail

**What it does**: Add drag-and-drop stage changes and deal detail view to pipeline.

**Key user flows**:
1. User drags deal card from "Lead" to "Qualified" → PATCH `/api/deals` with new stage → lead score updated → activity logged
2. User clicks deal card → deal detail slide-out shows: title, value, contact info, stage history, notes, activity timeline
3. Stage change buttons on deal detail as fallback to drag-and-drop

**Component connections**:
- API: `PATCH /api/deals` (already exists and works)
- Tables: `deals`, `deal_activities`, `outbound_contacts` (lead_score update)
- Automation: step 4 auto-creates follow-up tasks from stage changes

**Files to modify**:
- `src/app/pipeline/page.tsx` — add HTML5 drag-and-drop, deal detail slide-out, stage buttons

---

### P0-4: Newsletter A/B Testing

**What it does**: Actually implement A/B split testing for newsletter subjects.

**Key user flows**:
1. User creates newsletter with subject_a (primary) and subject_b, optionally subject_c
2. User sets sample size (default 20%)
3. On send: system sends variant A to 20% and variant B to 20%, waits for results
4. After 4 hours: auto-selects winner based on open rate
5. Winner sent to remaining 60%

**Component connections**:
- API: Modify `POST /api/newsletters/[id]/send` (new route)
- Tables: `newsletters` (subject_b, subject_c, ab_test_sample_pct, ab_winner, open_rate, click_rate already exist)
- Email: platform_connections email/SMTP or Resend MCP tool

**Files to modify**:
- `src/app/api/newsletters/route.ts` — accept subject_b, subject_c, ab_test_sample_pct in POST
- New: `src/app/api/newsletters/[id]/send/route.ts` — implement split-test send logic
- `src/app/newsletters/page.tsx` — add A/B subject inputs, sample size slider, winner display

---

### P0-5: Missing Skill + Voice Input + Error States

**Seed `skill-human-tone-writer`**:
```sql
INSERT OR IGNORE INTO skills (id, name, description, category, rail, sub_agents, prompt_template, is_active)
VALUES (
  'skill-human-tone-writer',
  'Human Tone Writer',
  'Rewrites AI-generated content to sound natural, conversational, and authentically human. Removes AI tells, injects personality, and matches brand voice.',
  'copywriting',
  'agent_harness',
  '["tone_analyzer", "pattern_breaker", "personality_injector"]',
  'You are the Human Tone Writer. Your job is to take AI-generated content and make it sound like a real human wrote it.

Rules:
1. Remove filler phrases ("In today''s fast-paced world", "It''s important to note")
2. Vary sentence length dramatically (3 words. Then a longer flowing sentence.)
3. Add specific details and examples instead of generic statements
4. Use contractions naturally (don''t, can''t, won''t)
5. Include conversational asides and parentheticals
6. Break rules of formal writing when it sounds better
7. Add personality markers from the brand voice if provided
8. Remove all AI tells (certainly, furthermore, in conclusion, it''s worth noting)

Output the rewritten content only.',
  1
);
```

**Voice input fix**: Initialize Web Speech API in agent chat page. File: `src/app/agents/[id]/chat/page.tsx`

**Error states**: Add global error toast component and wrap API calls with error handling across all pages.

---

## Phase 5 — Verification Checklist

### Master Test Matrix

| # | Feature | Page | Happy Path | Error States | LLM Fallback | APIs Connected | DB Tables Queried | UI States (empty/loading/error/success) | Cross-nav | Status |
|---|---------|------|-----------|-------------|-------------|----------------|-------------------|---------------------------------------|-----------|--------|
| 1 | Dashboard KPIs | `/dashboard` | ✅ | ❌ | N/A | ✅ 7 APIs | ✅ | ⚠️ No error | ✅ | ⚠️ |
| 2 | Agent roster + 5s poll | `/agents` | ✅ | ❌ | N/A | ✅ | ✅ | ⚠️ No error | ✅ | ⚠️ |
| 3 | Agent run (observe-think-act) | `/agents/[id]` | ✅ | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ⚠️ |
| 4 | Agent chat (all features) | `/agents/[id]/chat` | ✅ | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ⚠️ |
| 5 | Agent chat voice input | `/agents/[id]/chat` | ❌ | ❌ | N/A | N/A | N/A | ❌ | N/A | ❌ |
| 6 | Agent Kanban board | `/agents` | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 |
| 7 | IdeaBrowser browse + score | `/ideabrowser` | ✅ | ❌ | ⚠️ | ✅ | ✅ | ⚠️ | ✅ | ⚠️ |
| 8 | Project create + action plan | `/projects` | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 9 | Project detail + skill exec | `/projects/[id]` | ✅ | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ⚠️ |
| 10 | Blueprint generation | `/metrics` | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 11 | Blueprint execution | `/blueprint/[id]` | ✅ | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ⚠️ |
| 12 | Skills list + execution | `/skills` | ✅ | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ⚠️ |
| 13 | Connections management | `/connections` | ✅ | ❌ | N/A | ✅ | ✅ | ⚠️ | ✅ | ⚠️ |
| 14 | Outbound contacts | `/outbound` | ✅ | ❌ | N/A | ✅ | ✅ | ⚠️ | ✅ | ⚠️ |
| 15 | Content creation + publish | `/audience` | ✅ | ⚠️ | ⚠️ | ✅ | ✅ | ⚠️ | ✅ | ⚠️ |
| 16 | Newsletter create + A/B | `/newsletters` | ⚠️ | ❌ | ⚠️ | ⚠️ | ⚠️ | ❌ | ✅ | ❌ |
| 17 | Ad campaigns | `/ads` | ⚠️ | ❌ | ⚠️ | ❌ | ✅ | ❌ | ✅ | ❌ |
| 18 | Analytics dashboard | `/analytics` | ❌ | ❌ | N/A | ❌ | ❌ | ❌ | ✅ | ❌ |
| 19 | Pipeline Kanban | `/pipeline` | ⚠️ | ❌ | N/A | ⚠️ | ✅ | ⚠️ | ✅ | ⚠️ |
| 20 | Affiliates | `/affiliates` | ⚠️ | ❌ | N/A | ⚠️ | ✅ | ⚠️ | ✅ | ⚠️ |
| 21 | Automation heartbeat | Cross-cutting | ✅ | ⚠️ | ✅ | ✅ | ✅ | N/A | N/A | ⚠️ |
| 22 | All 15 skills | Cross-cutting | ⚠️ (14/15) | ⚠️ | ✅ | ✅ | ✅ | N/A | N/A | ⚠️ |
| 23 | Telegram/Slack bots | Cross-cutting | ⚠️ | ❌ | N/A | ✅ | ✅ | N/A | N/A | ⚠️ |
| 24 | MCP tools | Cross-cutting | ❌ | ❌ | N/A | ❌ | ✅ | N/A | N/A | ❌ |

### Agent Activity Kanban Verification

- [ ] Cards move between columns in real-time (≤5s with polling)
- [ ] Blocked notifications fire to Telegram/Slack within 5s via `/api/agents/notify`
- [ ] Progress updates during agent observe-think-act cycle
- [ ] Delegation chains render (Dalio → Hormozi → skill → output)
- [ ] Activity log merges with existing `/api/agents/activity` feed
- [ ] Task creation from board triggers correct agent via `/api/agents/[id]/run`
- [ ] State machine rejects invalid transitions (e.g., `idle→done` blocked)
- [ ] Board survives page navigation and returns to correct state
- [ ] Handles all 5 agents running simultaneously without SQLite lock errors
- [ ] "Resolve blocker" button links to correct page (e.g., `/connections`)

### Cross-Module Verification

- [ ] Outbound contact added → auto-enrolled in welcome sequence → sequence steps send via email
- [ ] Content created in Audience → auto-scheduled by `/api/social-schedule` → published with UTM → appears in Analytics
- [ ] Deal stage change in Pipeline → lead score recalculated by `/api/deals` PATCH → auto-task created by automation → Voss notified
- [ ] Blueprint layer executed → content generated → auto-assigned to Hormozi for publishing
- [ ] IdeaBrowser new idea → auto-assigned to Peter Thiel → Thiel's observe loop picks it up → analysis stored in agent_decisions
- [ ] Webinar registration → contact created in outbound_contacts with tags (**WORKS**) → auto-enrolled in post-webinar sequence (**STILL MISSING**)
- [ ] Subscription with referral code → affiliate commission created (**WORKS**) → affiliate dashboard updated (**WORKS**)
- [ ] Deal stage change → lead score update (**BROKEN — SQLite MAX() bug**)
- [ ] Agent completes skill execution → Telegram/Slack notification sent → activity log updated → Dashboard reflects new activity
- [ ] All 15 skills execute end-to-end with brand voice injection and correct agent persona (**14/15 — skill-human-tone-writer MISSING**)
- [ ] All 11 MCP tools authenticate and return data (**CURRENTLY BROKEN — no real MCP integration**)
- [ ] Automation heartbeat all 7 steps execute without error when triggered (**WORKS but must be triggered manually**)
- [ ] All 9 event-driven triggers fire correctly (**7/9 working, 2 broken: webinar→contact, subscription→commission**)

---

## Implementation Priority Summary

### v1.1 — P0 Fixes (Ship next)

| # | Item | Effort | Impact |
|---|------|--------|--------|
| 1 | Agent Activity Kanban board | L | Core differentiator |
| 2 | Fix expert persona names (Hormozi, Voss, etc.) | S | Brand identity |
| 3 | Pipeline drag-and-drop + deal stage change UI | M | Core CRM |
| 4 | Pipeline deal detail + activity timeline | M | Core CRM |
| 5 | Newsletter A/B testing implementation | M | Growth feature |
| 6 | Seed `skill-human-tone-writer` (15th skill) | S | Completeness |
| 7 | Create missing `/api/activity` endpoint | S | Dashboard activity feed broken |
| 8 | Add error states/toasts across all pages | M | UX quality |

### v1.2 — P1 Features (Competitive parity)

| # | Item | Effort | Impact |
|---|------|--------|--------|
| 9 | Dashboard agent KPIs + automation status | M | Command center |
| 10 | Automation heartbeat scheduler (cron/interval) | S | Core automation |
| 11 | Affiliate commission auto-creation from subscriptions | M | Revenue |
| 12 | Webinar → contact → sequence flow | M | Growth automation |
| 13 | Analytics data pipeline + real metrics | L | Analytics |
| 14 | Payment retry Stripe integration | L | Revenue |
| 15 | Engagement history tracking | M | CRM |

### v1.3 — P2/P3 Polish (Differentiators)

| # | Item | Effort | Impact |
|---|------|--------|--------|
| 16 | MCP tool agent execution (invoke tools) | L | Platform |
| 18 | Ad platform API integration | XL | Growth |
| 19 | Skill scheduling UI | M | Arsenal |
| 20 | Funnel analytics visualization | M | Analytics |
| 21 | Newsletter open/click tracking | L | Growth |
| 22 | Contact tags UI + advanced filters | M | CRM |
| 23 | Connection testing button | S | UX |
| 24 | Delete project button | S | CRUD |
| 25 | Browse page cleanup/merge | S | Cleanup |
| 26 | Loading skeletons | M | UX |
| 27 | Landing page brand voice injection | S | Quality |

---

*Nothing ships until every cell in its row is ✅.*
