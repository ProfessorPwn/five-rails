# Five Rails — AI Business Incubator

**Version**: 3.0
**Last Updated**: 2026-04-11
**Stack**: Next.js 16 · SQLite · Tailwind CSS · Claude Code SDK + Ollama (primary/fallback)

---

## What It Does

Five Rails is a one-stop-shop AI business automation platform with 5 autonomous department agents modeled after famous business experts. Pick a startup idea, generate a full metrics blueprint, then your AI team executes everything — ads, emails, content, SEO, landing pages, social posts — automatically.

**The flow**: Idea → Metrics Blueprint → Agents Execute → Content Published, Ads Running, Emails Sent

---

## Department Agents (5)

Each agent runs the **observe-think-act loop** autonomously on a schedule, using the real Claude Code SDK.

| Agent | Expert | ID | Department | Schedule | System Powers |
|-------|--------|-----|-----------|----------|--------------|
| **Ray Dalio** | Principles, Idea Meritocracy, Radical Transparency | `agent-executive` | Executive | Daily 8am | Delegates to all agents. Decision arbitration. |
| **Alex Hormozi** | $100M Offers, Value Equation, Grand Slam Offers | `agent-marketing` | Marketing | Daily 9am | Content, social, SEO, ads, email campaigns |
| **Chris Voss** | Never Split the Difference, Tactical Empathy, Calibrated Questions | `agent-sales` | Sales | Daily 8am | Outbound, deals, lead nurturing, proposals |
| **Marty Cagan** | Inspired, Empowered, Product Operating Model | `agent-product` | Product | Daily 10am | Metrics, pricing, funnel. **SYSTEM ADMIN** — only Marty can create/update skills, assign skills, modify agent configs, change settings, add MCP tools, clear stuck messages |
| **Peter Thiel** | Zero to One, Contrarian Question, Monopoly Theory | `agent-research` | Research | Mondays 7am | Competitors, market trends, idea evaluation |

### Agent Persona Enrichment (April 2026)

All 5 agent personas were enriched with transcript-sourced material from their real-person counterparts' verified YouTube videos, long-form interviews, and published essays. Each persona now includes:

- **Verbatim speech patterns** and recurring catchphrases from real transcripts
- **Named frameworks** with step-by-step sequences as actually taught on camera
- **"Sounds like THIS not THAT"** comparisons showing transcript-accurate vs. generic AI output
- **Source citations** with verified URLs for every extracted quote

Research coverage: 90+ verified transcript sources across all 5 agents:
- **Ray Dalio**: 9 sources (Lex Fridman, TED, Economic Machine, Diary of a CEO, Rubenstein/92Y, All-In, Conversations with Tyler, Ritholtz, Diamandis)
- **Alex Hormozi**: 15 sources (Modern Wisdom x3, Diary of a CEO, Young & Profiting, $100M Leads audiobook, School of Greatness x2, Young Smart Money, Stacking Benjamins, Impact Theory, Ed Mylett, Iced Coffee Hour, MFM)
- **Chris Voss**: 19 sources (Jacob Morgan PDF, Talks at Google, Lex Fridman, Knowledge Project, Huberman, Black Swan newsletter, Peterson, Rise With Drew, CNBC, School of Greatness, Ed Mylett, TEDx, Kara Goldin, Pathwise, Game Changing Attorney, Spodek, Diary of a CEO, Impact Theory)
- **Marty Cagan**: 18 sources (Lenny's x2, Make Things That Matter, Age of Product, Hands-on Agile, Mind the Product x3, Product Compass, Goodreads, Tech Lead Journal, CHURN.FM, Product Led Alliance, Digital Disruption, ProductTank Brisbane)
- **Peter Thiel**: 35 sources (CS183 Classes 1-6/9/11/14/18/19, Y Combinator, Conversations with Tyler x2, Founders Fund, Rogan, Peterson, First Things x2, Cato Unbound, Hoover x2, Portal/Weinstein, RNC 2016, Hamilton commencement, Bari Weiss, Rubin, Ross Douthat, Antichrist Lectures, Bill Kristol, All-In Summit, NatCon 2019)

Full dossiers: `RAY_DALIO_AGENT_PERSONA.md`, `HORMOZI_AGENT_PERSONA.md`, `CHRIS_VOSS_AGENT_PERSONA.md`, `MARTY_CAGAN_AGENT_PERSONA.md`, `PETER_THIEL_AGENT_PERSONA.md`

### Agent Capabilities
- **Observe**: Queries department-specific data (content, deals, subscriptions, competitors)
- **Think**: LLM analyzes observations using expert frameworks, decides what to do
- **Act**: Executes skills with expert persona injected into every output
- **Delegate**: Routes tasks to the right agent (name↔ID mapping in every prompt)
- **Memory**: Persists preferences, corrections, learned patterns across sessions
- **Chat**: Interactive conversation with session management, markdown, voice input
- **Notify**: Sends Telegram/Slack notifications when work is completed
- **System Actions** (Marty only): Create skills, update configs, assign capabilities

### Agent Communication
- Inter-agent messages with handoff/request/info types
- Delegation chains (Dalio → Hormozi for marketing, Dalio → Cagan for system changes)
- Activity feed on Command Center (`/agents`) with 5-second auto-refresh

---

## Pages (18)

| Page | URL | Purpose |
|------|-----|---------|
| Dashboard | `/dashboard` | Command Center with 5 KPI hero cards (MRR/ARR, Pipeline, Contacts, Content, Agent Actions), Agent Fleet status bar with run buttons, enriched Activity Feed with department-colored icons, Automation Health panel with 7-step pipeline status, and context-aware What's Next action grid with progress indicators |
| **Agent Command Center** | `/agents` | Live view of all 5 agents — states, decisions, messages, content feed. Auto-polls every 5s |
| **Agent Detail** | `/agents/[id]` | Decision log, memory, skills, config. Live progress bar during runs |
| **Agent Chat** | `/agents/[id]/chat` | Chat with any agent. Sessions, markdown, code blocks, voice input, regenerate, feedback, search, export, model switcher |
| IdeaBrowser | `/ideabrowser` | Browse 229+ startup ideas with scores and analysis |
| Projects | `/projects` | Project list with action plans |
| Project Detail | `/projects/[id]` | Action plan execution |
| Blueprints | `/blueprint` | Metrics blueprint list with execution progress |
| Blueprint Detail | `/blueprint/[id]` | 12-layer execution dashboard |
| Metrics | `/metrics` | Niche Metrics Blueprint Generator |
| Skills | `/skills` | Browse and execute 15 AI-powered skills |
| Connections | `/connections` | LLM providers + platform OAuth. One-click Claude Code SDK setup |
| Outbound | `/outbound` | Contact management + email sending. Tabbed UI: Contacts tab (pipeline, filters, email) and Sequences tab (sequence builder, detail view, enrollment) |
| Audience | `/audience` | Content creation + publishing |
| Newsletters | `/newsletters` | Newsletter creation + A/B testing + sending |
| Ads | `/ads` | Ad campaigns for Facebook/Google/TikTok |
| Analytics | `/analytics` | Tabbed dashboard: Conversion Funnel (Mixpanel-style funnel bars with conversion/drop-off rates, event timeline, quick stats) and Content Performance (platform metrics) |
| Pipeline | `/pipeline` | CRM Kanban board (7 stages) |
| Affiliates | `/affiliates` | Affiliate program + commission tracking |

---

## API Routes (35+)

### Agents
| Route | Purpose |
|-------|---------|
| `/api/agents` | List all agents with stats |
| `/api/agents/[id]` | Agent detail + decisions + conversations |
| `/api/agents/[id]/run` | Execute observe-think-act loop |
| `/api/agents/[id]/chat` | Chat with agent. Sessions, search, export, feedback, regenerate |
| `/api/agents/[id]/messages` | Inter-agent messaging |
| `/api/agents/run-all` | Run all due agents |
| `/api/agents/activity` | Unified activity feed across all agents |
| `/api/agents/notify` | Send Telegram/Slack notification |
| `/api/agents/system-action` | System admin actions (Marty Cagan only) |
| `/api/agents/telegram/webhook` | Telegram bot webhook |
| `/api/agents/telegram/setup` | Telegram bot setup + token verification |
| `/api/agents/slack/webhook` | Slack bot webhook |
| `/api/agents/webhook` | Generic webhook for any integration |

### Dashboard
| Route | Purpose |
|-------|---------|
| `/api/dashboard/stats` | Aggregated KPI data (MRR/ARR, pipeline, contacts, content, agents), agent states, automation health, activity feed, and context for What's Next |

### Core
| Route | Purpose |
|-------|---------|
| `/api/projects` | Project CRUD. Auto-generates action plan on creation |
| `/api/skills` | List all 15 skills |
| `/api/skills/[id]/execute` | Execute skill with LLM + agent persona + brand voice |
| `/api/connections` | LLM providers with priority (primary/fallback) |
| `/api/auth/claude-token` | Auto-detect Claude Code OAuth token |
| `/api/content` | Content CRUD. Auto-schedules at best time |
| `/api/content/[id]/publish` | Publish with UTM tracking. Instagram/TikTok/YouTube support |
| `/api/content-repurpose` | One piece → multiple platforms with brand voice |
| `/api/mcp/tools` | MCP tool registry (11 tools) |

### IdeaBrowser
| Route | Purpose |
|-------|---------|
| `/api/ideabrowser/ideas` | Browse/import ideas. Auto-scores on import |
| `/api/ideabrowser/score` | Score all ideas (instant or LLM) |
| `/api/ideabrowser/trends` | Category trends |
| `/api/ideabrowser/market-insights` | Market insights |
| `/api/metrics/generate` | 12-layer metrics blueprint via LLM |
| `/api/blueprints` | Blueprint CRUD |
| `/api/blueprints/[id]/execute-layer` | Execute one blueprint layer |
| `/api/blueprints/[id]/execute-all` | Execute all 12 layers |

### Growth & Automation
| Route | Purpose |
|-------|---------|
| `/api/automation/process` | Central heartbeat — scheduled posts, sequences, payments, deals, skills, agents, IdeaBrowser sync |
| `/api/automation/settings` | 11 automation toggles |
| `/api/automation/sync-ideabrowser` | Daily IdeaBrowser idea import → assign to Peter Thiel |
| `/api/skill-schedules` | Cron-like skill scheduling |
| `/api/outbound` | Contacts. Auto-enrolls in welcome sequence |
| `/api/deals` | Pipeline with lead scoring + auto-tasks |
| `/api/sequences` | Multi-step email sequences (GET list, POST create) |
| `/api/sequences/[id]` | Sequence detail with enrolled contacts (GET), update (PATCH), delete (DELETE) |
| `/api/lead-scoring` | 11-rule engagement scoring |
| `/api/social-schedule` | Best-time scheduling + evergreen recycling |
| `/api/social-schedule/process` | Auto-publish due posts |
| `/api/newsletters` | Newsletter CRUD + A/B testing |
| `/api/ads` | Ad campaigns |
| `/api/ads/generate-variants` | Combinatorial ad variant generator |
| `/api/ad-rules` | Automated ad rules |
| `/api/analytics` | Platform metrics fetching |
| `/api/media/generate` | AI image generation (DALL-E) |
| `/api/brand-voice` | Brand voice training |
| `/api/funnels` | Funnel event tracking |
| `/api/referrals` | Referral milestones |
| `/api/competitors` | Competitor monitoring |
| `/api/affiliates` | Affiliate program |
| `/api/webinars` | Webinars + auto-contact creation |
| `/api/subscriptions` | MRR/ARR + affiliate commissions + payment retry |
| `/api/onboarding` | Onboarding checklists |
| `/api/landing-pages` | Landing page builder |

---

## Skills (15)

| Skill ID | Name | Category | Assigned To |
|----------|------|----------|-------------|
| skill-sales-page-surgeon | Sales Page Surgeon | copywriting | Hormozi, Voss |
| skill-email-wizard | Email Wizard | email_marketing | Hormozi, Voss, Dalio |
| skill-lead-magnet-creator | Lead Magnet Creator | lead_generation | Hormozi, Voss |
| skill-content-engine | Content Engine | content | Hormozi, Dalio |
| skill-market-research | Market Research Agent | research | Thiel, Dalio |
| skill-competitive-intel | Competitive Intel Scout | research | Thiel, Dalio |
| skill-outbound-sequence | Outbound Sequence Builder | sales | Voss, Dalio |
| skill-ops-dashboard | Ops Dashboard Generator | operations | Cagan, Dalio |
| skill-frontend-design | Front-end Design | development | Cagan |
| skill-leveraged-agency | Leveraged Agency Strategist | operations | Dalio |
| skill-seo-strategist | SEO Strategist | marketing | Hormozi |
| skill-ad-copy-generator | Ad Copy Generator | marketing | Hormozi |
| skill-pricing-page-generator | Pricing Page Generator | development | Cagan |
| skill-social-scheduler | Social Content Calendar | marketing | Hormozi |
| skill-human-tone-writer | Human Tone Writer | copywriting | All agents |

---

## Database Tables (50+)

### Core
`projects`, `skills`, `content_pieces`, `connections` (with priority column), `platform_connections`, `activity_log`, `tasks`, `files`, `market_insights`

### IdeaBrowser
`ideabrowser_ideas` (229+), `ideabrowser_trends`, `ideabrowser_market_insights`, `ideabrowser_config`

### Blueprints
`blueprints`

### Agents
`agents` (5 seeded), `agent_decisions`, `agent_messages`, `agent_conversations`, `agent_remote_config`, `chat_sessions`, `mcp_tools` (11 seeded)

### Growth & Marketing
`outbound_contacts` (with lead_score, tags, sequence enrollment), `newsletters` (with A/B columns), `ad_campaigns`, `ad_rules`, `content_analytics`, `scheduled_posts`, `rss_feeds`

### CRM & Sales
`deals`, `deal_activities`, `email_sequences`, `landing_pages`, `brand_voices`

### Referrals & Affiliates
`referrals`, `affiliates`, `commissions`

### Analytics & Tracking
`funnel_events`, `competitors`, `competitor_alerts`

### Webinars & Subscriptions
`webinars`, `webinar_registrations`, `subscriptions`, `payment_attempts`

### Automation
`automation_settings` (11 toggles), `automation_runs`, `skill_schedules`, `onboarding_checklists`

---

## LLM Connection Priority

| Priority | Provider | Model | Role |
|----------|----------|-------|------|
| 1 (Primary) | Anthropic | claude-opus-4-6 | All agents, skills, blueprints |
| 2 (Fallback) | Ollama | qwen3:14b | Auto-fallback if Claude fails |

The `getActiveConnection()` function always picks the lowest priority number. If Claude errors, it automatically falls back to Ollama. Users can switch models mid-chat via the dropdown in the chat header.

---

## MCP Tools (11)

| Tool | Category | Connection Type |
|------|----------|----------------|
| Gmail | communication | OAuth |
| Google Calendar | calendar | OAuth |
| Notion | storage | API key |
| Stripe | payment | API key |
| Slack | communication | OAuth |
| Google Drive | storage | OAuth |
| Resend | communication | API key |
| Twitter/X | social | OAuth |
| LinkedIn | social | OAuth |
| Facebook | social | OAuth |
| Google Analytics | analytics | OAuth |

---

## Automation Engine

### Central Heartbeat (`/api/automation/process`)
Runs 7 steps when triggered:
1. Scheduled posts → auto-publish
2. Email sequences → send next step
3. Payment retries → retry failed payments
4. Deal follow-ups → create tasks
5. Skill schedules → execute cron jobs
6. Agent runs → execute all due agents
7. IdeaBrowser sync → daily idea import → assign to Peter Thiel

### Event-Driven Triggers
| Event | Auto-Action |
|-------|-------------|
| Project created | Auto-generate action plan |
| Contact added | Auto-enqueue in welcome sequence |
| Content created | Auto-schedule at best time |
| Deal stage changes | Auto-update lead score + create task |
| Webinar attendance >75% | Auto-enqueue in post-webinar sequence |
| Subscription with referral | Auto-create affiliate commission |
| Content repurposed | Auto-schedule at best times |
| Agent completes work | Auto-notify via Telegram/Slack |
| New IdeaBrowser idea | Auto-assign to Peter Thiel for analysis |

---

## Remote Access

| Channel | Endpoint | How It Works |
|---------|----------|-------------|
| **Telegram** | `/api/agents/telegram/webhook` | Message bot → routes to agent. `/marketing`, `/sales`, `/product`, `/research` commands |
| **Slack** | `/api/agents/slack/webhook` | Same routing via `@marketing`, `@sales` mentions |
| **Generic Webhook** | `/api/agents/webhook` | POST `{agent_id, message}` from any source |
| **Setup** | `/api/agents/telegram/setup` | POST bot_token → verifies, sets webhook, sends test message |
| **Notifications** | `/api/agents/notify` | Agents send Telegram/Slack alerts when they complete work |

---

## Chat Features

| Feature | Details |
|---------|---------|
| Sessions | New chat, switch, history sidebar |
| Markdown | Bold, italic, lists, code blocks with copy button |
| Feedback | Thumbs up/down on every response |
| Regenerate | Re-run last response |
| Follow-ups | Suggested next questions |
| Search | Search across all sessions |
| Export | Download as markdown |
| Voice | Web Speech API speech-to-text |
| Model Switcher | Dropdown to switch LLM mid-chat |
| Agent Label | Shows which agent + which model on each message |
| Delegation | Shows which agent handled delegated work |

---

## System Admin Actions (Marty Cagan only)

| Action | What It Does |
|--------|-------------|
| `create_skill` | Create new skill with custom prompt template |
| `update_skill` | Modify any skill's name, description, prompt |
| `assign_skill` | Give a skill to any agent |
| `update_agent` | Change agent name, role, schedule, system prompt |
| `update_setting` | Modify automation settings |
| `clear_messages` | Resolve stuck message queues |
| `add_mcp_tool` | Register new MCP tools |

---

## Environment

- **Dev server**: `npx next dev --port 3000`
- **Database**: `data/fiverails.db` (SQLite, auto-created)
- **Primary LLM**: Claude Code SDK via `@anthropic-ai/claude-agent-sdk` (OAuth token from `~/.claude/.credentials.json`)
- **Fallback LLM**: Ollama at localhost:11434
- **Optional**: OpenAI API key (image generation), Resend API key (email), Telegram bot token (notifications)
