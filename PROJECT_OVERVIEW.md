# Five Rails — Project Overview

## Purpose

Five Rails is an AI-powered business incubator and automation platform. It replaces an entire startup team with 5 autonomous AI agents — each modeled after a famous business expert — that execute real business operations: writing ads, sending emails, creating content, managing pipelines, and analyzing markets.

The core loop: **Pick an idea → Generate a metrics blueprint → Agents execute everything automatically.**

Instead of hiring a marketing team, a sales team, a product manager, and a researcher, a solo founder plugs in Five Rails and gets autonomous departments that observe their domain, think using expert frameworks, and act by executing skills — all without manual intervention.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, Turbopack) |
| Database | SQLite via better-sqlite3 (~50 tables) |
| Primary LLM | Claude Code SDK (`@anthropic-ai/claude-agent-sdk`) |
| Fallback LLM | Ollama (qwen3:14b, auto-fallback) |
| Styling | Tailwind CSS, dark theme (`bg-[#0a0c14]`) |
| Language | TypeScript |

---

## The 5 Agents

Each agent runs an **observe → think → act** loop autonomously on a schedule. They communicate with each other, delegate tasks, and persist memory across sessions.

| Agent | Modeled After | Department | What They Do |
|-------|--------------|-----------|-------------|
| **Ray Dalio** | Principles, Radical Transparency | Executive | Delegates to all agents. Decision arbitration. Runs daily 8am. |
| **Alex Hormozi** | $100M Offers, Value Equation | Marketing | Content, social, SEO, ads, email campaigns. Runs daily 9am. |
| **Chris Voss** | Never Split the Difference | Sales | Outbound, deals, lead nurturing, proposals. Runs daily 8am. |
| **Marty Cagan** | Inspired, Empowered | Product | Metrics, pricing, funnels. **System admin** — only agent that can create/modify skills and configs. Runs daily 10am. |
| **Peter Thiel** | Zero to One, Contrarian Thinking | Research | Competitors, market trends, idea evaluation. Runs Mondays 7am. |

### Agent Capabilities
- **Observe**: Query department-specific data from the database
- **Think**: LLM analyzes observations using the expert's actual frameworks
- **Act**: Execute skills with expert persona injected into every output
- **Delegate**: Route tasks to the right agent via inter-agent messaging
- **Memory**: Persist preferences, corrections, and learned patterns
- **Chat**: Interactive conversation with session management, markdown, voice input
- **Notify**: Send Telegram/Slack alerts when work completes

---

## Pages (18)

| Page | Route | Purpose |
|------|-------|---------|
| Dashboard | `/dashboard` | Command Center — KPI cards, agent fleet status, activity feed, automation health, What's Next grid |
| Agent Command Center | `/agents` | Live view of all 5 agents — states, decisions, messages, content feed (5s auto-refresh) |
| Agent Detail | `/agents/[id]` | Decision log, memory, skills, config, run button |
| Agent Chat | `/agents/[id]/chat` | Chat with any agent — sessions, markdown, code blocks, voice, model switcher |
| IdeaBrowser | `/ideabrowser` | Browse 229+ startup ideas with scoring and analysis |
| Projects | `/projects` | Project list with action plans |
| Project Detail | `/projects/[id]` | Action plan execution |
| Blueprint List | `/blueprint` | Metrics blueprints with execution progress |
| Blueprint Detail | `/blueprint/[id]` | 12-layer execution dashboard |
| Metrics | `/metrics` | Niche Metrics Blueprint Generator |
| Skills | `/skills` | Browse and execute 15 AI-powered skills |
| Connections | `/connections` | LLM providers + platform OAuth + Claude Code SDK setup |
| Outbound | `/outbound` | Contact management + email sending + sequence builder |
| Audience | `/audience` | Content creation + publishing |
| Newsletters | `/newsletters` | Newsletter creation + A/B testing + sending |
| Ads | `/ads` | Ad campaigns for Facebook, Google, TikTok |
| Analytics | `/analytics` | Conversion funnel + content performance |
| Pipeline | `/pipeline` | CRM Kanban board (7 stages) |
| Affiliates | `/affiliates` | Affiliate program + commission tracking |

---

## Skills (15)

Skills are AI-powered task executors. Each skill has a prompt template, gets the expert persona injected, and runs through the active LLM connection.

| Skill | Category | Assigned Agents |
|-------|----------|----------------|
| Sales Page Surgeon | Copywriting | Hormozi, Voss |
| Email Wizard | Email Marketing | Hormozi, Voss, Dalio |
| Lead Magnet Creator | Lead Generation | Hormozi, Voss |
| Content Engine | Content | Hormozi, Dalio |
| Market Research Agent | Research | Thiel, Dalio |
| Competitive Intel Scout | Research | Thiel, Dalio |
| Outbound Sequence Builder | Sales | Voss, Dalio |
| Ops Dashboard Generator | Operations | Cagan, Dalio |
| Front-end Design | Development | Cagan |
| Leveraged Agency Strategist | Operations | Dalio |
| SEO Strategist | Marketing | Hormozi |
| Ad Copy Generator | Marketing | Hormozi |
| Pricing Page Generator | Development | Cagan |
| Social Content Calendar | Marketing | Hormozi |
| Human Tone Writer | Copywriting | All agents |

---

## Automation Engine

### Central Heartbeat (`/api/automation/process`)

A 7-step pipeline that runs on schedule:

1. **Scheduled posts** → auto-publish due content
2. **Email sequences** → send next step to enrolled contacts
3. **Payment retries** → retry failed subscription payments
4. **Deal follow-ups** → create tasks for stale deals
5. **Skill schedules** → execute cron-based skill jobs
6. **Agent runs** → execute all due agents
7. **IdeaBrowser sync** → daily idea import → assign to Peter Thiel

### Event-Driven Triggers

| Trigger Event | Automatic Action |
|--------------|-----------------|
| Project created | Generate action plan |
| Contact added | Enroll in welcome sequence |
| Content created | Schedule at platform's best time |
| Deal stage changes | Update lead score + create follow-up task |
| Webinar attendance >75% | Enroll in post-webinar sequence |
| Subscription with referral | Create affiliate commission |
| Content repurposed | Schedule across platforms at best times |
| Agent completes work | Notify via Telegram/Slack |
| New IdeaBrowser idea | Assign to Peter Thiel for analysis |

---

## Database (50+ Tables)

### Core
`projects`, `skills`, `content_pieces`, `connections`, `platform_connections`, `activity_log`, `tasks`, `files`, `market_insights`

### Agents
`agents`, `agent_decisions`, `agent_messages`, `agent_conversations`, `agent_remote_config`, `chat_sessions`, `mcp_tools`

### IdeaBrowser & Blueprints
`ideabrowser_ideas`, `ideabrowser_trends`, `ideabrowser_market_insights`, `ideabrowser_config`, `blueprints`

### Growth & Marketing
`outbound_contacts`, `newsletters`, `ad_campaigns`, `ad_rules`, `content_analytics`, `scheduled_posts`, `rss_feeds`

### CRM & Sales
`deals`, `deal_activities`, `email_sequences`, `landing_pages`, `brand_voices`

### Referrals & Affiliates
`referrals`, `affiliates`, `commissions`

### Analytics & Tracking
`funnel_events`, `competitors`, `competitor_alerts`

### Subscriptions & Webinars
`webinars`, `webinar_registrations`, `subscriptions`, `payment_attempts`

### Automation
`automation_settings`, `automation_runs`, `skill_schedules`, `onboarding_checklists`

---

## External Integrations

### MCP Tools (11)

| Tool | Category |
|------|----------|
| Gmail | Communication |
| Google Calendar | Calendar |
| Notion | Storage |
| Stripe | Payments |
| Slack | Communication |
| Google Drive | Storage |
| Resend | Email delivery |
| Twitter/X | Social |
| LinkedIn | Social |
| Facebook | Social |
| Google Analytics | Analytics |

### Remote Access Channels

| Channel | How It Works |
|---------|-------------|
| Telegram Bot | Message the bot → routes to the right agent. `/marketing`, `/sales`, etc. |
| Slack Bot | `@marketing`, `@sales` mentions route to agents |
| Generic Webhook | POST `{agent_id, message}` from any source |
| Notifications | Agents push alerts to Telegram/Slack when they finish work |

---

## LLM Connection Strategy

| Priority | Provider | Model | Role |
|----------|----------|-------|------|
| 1 (Primary) | Anthropic | claude-opus-4-6 | All agents, skills, blueprints |
| 2 (Fallback) | Ollama | qwen3:14b | Auto-fallback if Claude fails |

The `getActiveConnection()` function always picks the lowest priority number. If Claude errors, the system automatically falls back to Ollama. Users can switch models mid-chat via a dropdown.

---

## Key Workflows

### Idea → Revenue (Full Loop)

1. **Browse ideas** in IdeaBrowser (229+ scored ideas)
2. **Pick an idea** → create a Project
3. **Generate a Metrics Blueprint** → 12-layer execution plan
4. **Agents activate** → each department starts executing:
   - Hormozi writes ads, emails, content, social posts
   - Voss builds outbound sequences, manages deals
   - Cagan sets up pricing pages, funnels, metrics
   - Thiel monitors competitors and market trends
   - Dalio orchestrates and arbitrates decisions
5. **Automation engine** handles scheduling, publishing, retries, and follow-ups
6. **Revenue tracked** via subscriptions, MRR/ARR, affiliate commissions

### Agent Observe-Think-Act Loop

1. Agent wakes up on schedule
2. **Observe**: queries department data (e.g., Hormozi checks content pipeline, ad performance)
3. **Think**: LLM analyzes with expert framework, decides next actions
4. **Act**: executes relevant skills (e.g., writes email sequence, generates ad copy)
5. **Delegate**: if a task belongs to another department, sends inter-agent message
6. **Log**: records decision with reasoning, confidence, and action taken
7. **Notify**: sends alert to Telegram/Slack

---

## Project Stats

- **Source files**: ~118
- **Lines of code**: ~23,000+
- **API routes**: 35+
- **Database tables**: 50+
- **Seeded ideas**: 229+
- **AI skills**: 15
- **Autonomous agents**: 5
- **MCP integrations**: 11
