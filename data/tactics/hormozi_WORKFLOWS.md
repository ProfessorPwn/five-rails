# Alex Hormozi — Five Rails Workflow Candidates

---

## A. NEW SKILLS

---

**Skill name:** Grand Slam Offer Builder
**When to invoke:** When a new product/offer is being constructed or an existing offer has stalled conversion.
**Inputs:** `product_name`, `avatar_description`, `dream_outcome`, `current_price`, `known_objections[]`
**Output:** Structured offer doc — dream outcome statement, problem list reframed as solutions, delivery mechanism options ranked by value/cost, bonus stack with objection mapping, suggested name + price anchor.
**Prompt template:**
```
You are Alex Hormozi building a Grand Slam Offer for {{product_name}} targeting {{avatar_description}}.
Dream outcome: {{dream_outcome}}.
Step 1 — List every obstacle between the avatar and the dream outcome. These ARE the product features.
Step 2 — Rename each obstacle as a named solution module.
Step 3 — Propose delivery mechanisms for each (group, 1:1, async, done-for-you, tool).
Step 4 — Score each on (perceived value to buyer) vs (cost to deliver). Prioritize high/low first.
Step 5 — Stack bonuses that each individually justify the full price of {{current_price}}.
Output: Offer Brief with name, headline, feature stack, bonus stack, risk reversal, and price anchor.
```
**Source tactic:** Framework #5 (Grand Slam Offer Build)

---

**Skill name:** Value Equation Auditor
**When to invoke:** When offer conversion rate is below target or ad spend is not producing expected yield.
**Inputs:** `offer_description`, `current_conversion_rate`, `customer_complaints[]`, `avg_time_to_result`, `onboarding_effort_description`
**Output:** Scored diagnosis across the four Value Equation levers + highest-leverage fix recommendation.
**Prompt template:**
```
Analyze this offer through Hormozi's Value Equation: Value = (Dream Outcome × Likelihood) ÷ (Time Delay × Effort).
Offer: {{offer_description}}. Current conversion: {{current_conversion_rate}}.
Score each lever 1–10 based on inputs. Identify the single weakest lever.
For that lever only, propose 3 specific copy/structure/delivery changes.
Do not touch other levers. One root cause, one fix.
Output: Lever scores, weakest lever, 3 actionable fixes ranked by implementation speed.
```
**Source tactic:** Framework #1 (The Value Equation)

---

**Skill name:** Pain Cycle Script Generator
**When to invoke:** Before writing outbound sequences or sales call openers for a new avatar or campaign.
**Inputs:** `avatar_description`, `dream_outcome`, `known_prior_solutions[]`, `cost_of_failure_estimate`
**Output:** Pain-anchored script block covering: problem acknowledgment, prior failure loop (2 cycles), cost-of-inaction anchor, transition to pitch.
**Prompt template:**
```
Write a Hormozi-style pain cycle script for {{avatar_description}} targeting {{dream_outcome}}.
Prior solutions they've tried: {{known_prior_solutions}}.
Phase 1 — Acknowledge the problem without pitching. Ask "What have you tried?"
Phase 2 — Run two prior-failure loops: what did they try, how did it go, what did it cost (money, time, status)?
Phase 3 — Anchor the cost of continued inaction: daily, monthly, and identity cost.
Phase 4 — Bridge: "Based on what you've told me, I think I might have something for you."
Output: Full script block, under 400 words, with bracketed stage labels.
```
**Source tactic:** Framework #9 (The Pain Cycle) + Tactical Scripts

---

**Skill name:** Sales Call Script Builder (CLOSER)
**When to invoke:** When configuring a new sales flow, onboarding a new sales rep, or refreshing a sales sequence for a product.
**Inputs:** `product_name`, `price_point`, `common_objections[]`, `dream_outcome`, `avatar_description`
**Output:** Full CLOSER-structured call script with BANT pre-qual checklist, stage-by-stage dialogue, and objection handling inserts.
**Prompt template:**
```
Build a CLOSER sales call script for {{product_name}} at {{price_point}} for {{avatar_description}}.
Pre-call: BANT checklist (Budget confirmed, Authority to decide, Need established, Timing this month).
C — Clarify: open question to surface why they showed up today.
L — Label: restate their problem in one sentence and confirm.
O — Overview: run two pain cycle loops (prior attempts, cost of failure).
S — Sell the vacation: describe the outcome, never the process.
E — Explain objections: handle each from {{common_objections}} with validate-then-redirect.
R — Reinforce: post-close confirmation script. Stop selling the moment they say yes.
Output: Full script with stage headers, silence markers, and objection branches.
```
**Source tactic:** Framework #3 (CLOSER + BANT)

---

**Skill name:** Business Constraint Diagnostic
**When to invoke:** When growth is stalling, ad spend isn't converting, or the team is considering a new channel/product.
**Inputs:** `monthly_leads`, `close_rate`, `monthly_churn_rate`, `current_capacity_utilization`, `gross_margin_pct`, `ltgp_cac_ratio`
**Output:** Single-verdict diagnosis (supply-constrained vs. demand-constrained), primary bottleneck, and the one prescribed next action. No multi-action lists.
**Prompt template:**
```
Diagnose this business using Hormozi's constraint framework.
Inputs: {{monthly_leads}}, close rate {{close_rate}}, churn {{monthly_churn_rate}},
capacity {{current_capacity_utilization}}, gross margin {{gross_margin_pct}}, LTGP:CAC {{ltgp_cac_ratio}}.
Test 1 — If ad spend doubled tomorrow, would revenue double or create fulfillment chaos?
Test 2 — Is gross margin ≥80%? If not, scaling is blocked at the foundation.
Test 3 — Is churn >20% monthly? If yes, acquisition spending is destroying value.
Output: ONE verdict (supply or demand constrained), ONE bottleneck, ONE prescribed action. No lists.
```
**Source tactic:** Frameworks #4, #8, Decision Rules #2, #5, #8

---

## B. NEW ROUTINES

---

**Routine name:** Close Rate Price Alert
**Cadence:** Every Monday 8am
**Skill invoked:** Business Constraint Diagnostic → writes alert to `activity_log` + sends `agent_message` to Hormozi agent
**Why:** Decision Rule #1 is precise and high-value but never gets checked: if close rate exceeds 80%, the business is underpriced by 3–4x. No existing routine monitors this signal. Left unchecked, the team celebrates high close rates while leaving massive margin on the table.

---

**Routine name:** Churn Watchdog
**Cadence:** Daily 6am
**Skill invoked:** Business Constraint Diagnostic (churn input only) → if `monthly_churn_rate > 20%`, creates agent_task with `priority: critical`, halts any active acquisition campaigns via `system_action`, logs to `activity_log`
**Why:** Decision Rule #5 is explicit: stop acquiring when churn exceeds 20%. No primitive currently gates acquisition spend on retention health. This routine enforces it automatically so the leaky bucket anti-pattern never silently compounds.

---

**Routine name:** Inbound Lead Speed Check
**Cadence:** Every 15 minutes (or on `outbound_contacts` INSERT trigger)
**Skill invoked:** Query: find leads created >5 minutes ago with no outbound activity. For each, fire an `agent_message` to sales agent flagging the contact + elapsed time.
**Why:** Decision Rule #3 is Hormozi's highest-leverage inbound variable: contact within 60 seconds or close rate drops 80% by minute 5. Five Rails captures inbound contacts but has no latency enforcement. This routine is trivial to build and has an outsized impact on any inbound funnel.

---

## C. NEW PLAYBOOKS

---

**Playbook name:** New Offer Launch
**Trigger:** A new `projects` row is created with `type = 'offer'` OR agent receives instruction to build a new offer.
**Steps:**
1. **Skill: Grand Slam Offer Builder** — construct offer skeleton from avatar + dream outcome
2. **Skill: Value Equation Auditor** — stress-test the draft offer against all four levers before writing a word of copy
3. **Handoff → Hormozi agent** — review output, confirm offer logic, approve or request revision
4. **Skill: Pricing Page Generator** — generate pricing page from approved offer brief
5. **Skill: Sales Page Surgeon** — write full sales page using approved offer brief as source-of-truth
6. **Skill: Pain Cycle Script Generator** — generate outbound + sales call opener anchored to this offer's specific avatar pain
7. **Skill: Ad Copy Generator** — generate 3 ad variants per Value Equation lever (one per weakest lever identified in step 2)
8. **Log all outputs to `activity_log`**, create `landing_pages` record, schedule posts via `scheduled_posts`

**Success metric:** Offer live with sales page, pricing page, pain-cycle outbound sequence, and 3 ad variants — all sourced from the same Grand Slam Offer Brief. No copy written without a validated offer first.

---

**Playbook name:** Pricing Correction
**Trigger:** Close Rate Price Alert fires (close rate >80% for 2 consecutive weeks) OR gross margin dips below 80%.
**Steps:**
1. **Skill: Business Constraint Diagnostic** — confirm constraint type and current LTGP:CAC ratio
2. **Agent task: calculate new price** — Hormozi agent computes 3–4x price increase scenario with break-even close rate analysis (math-out-loud format)
3. **Handoff → human approval** — present math to user; require explicit confirmation before proceeding
4. **Skill: Pricing Page Generator** — regenerate pricing page at new price point
5. **Skill: Value Equation Auditor** — re-audit offer at new price; identify which lever needs strengthening to justify increase
6. **Skill: Sales Page Surgeon** — update sales page hero and price anchor language
7. **Skill: Sales Call Script Builder (CLOSER)** — regenerate call script with updated price delivery script (the "it's super expensive" pre-frame)
8. **Log price change + rationale to `activity_log`**

**Success metric:** Price updated across all surfaces (pricing page, sales page, call script) with documented LTGP:CAC math. Close rate monitored for 2 weeks post-change.

---

**Playbook name:** Retention Recovery
**Trigger:** Churn Watchdog fires with monthly churn >20%, OR churn increases >5 points week-over-week.
**Steps:**
1. **Skill: Business Constraint Diagnostic** — confirm churn is primary constraint (not secondary to pricing or fulfillment)
2. **Agent task: consumption audit** — query `funnel_events` and `content_analytics` for features/content customers are NOT using. Identify top 3 unused elements.
3. **Handoff → Hormozi agent** — draft simplification recommendation: what to remove or consolidate (addition inflates overwhelm; deletion is the fix)
4. **Handoff → human approval** — present removal plan with churn attribution data
5. **Skill: Email Wizard** — write reactivation email sequence using the Hormozi reactivation script structure ("I owe you $X — we didn't communicate something we gave other customers")
6. **Skill: Outbound Sequence** — generate win-back sequence for churned contacts in `outbound_contacts` tagged `churned`
7. **Block new acquisition campaigns** via `system_action` until churn drops below 15% for 2 consecutive weeks
8. **Log all actions to `activity_log`** with `trigger: retention_recovery`

**Success metric:** Monthly churn below 15% sustained for 4 weeks. Acquisition campaigns unblocked only after threshold is met.

---

## D. DROP THESE (redundant with existing primitives)

- **Reactivation email scripts** — Email Wizard handles template generation; reactivation is a variant, not a new skill (captured in Retention Recovery Playbook above)
- **Social content production** — Social Content Calendar already covers this; Hormozi's voice/cadence patterns are style inputs, not new workflows
- **Competitive analysis** — Competitive Intel skill already covers this
- **Ad copy variants** — Ad Copy Generator already covers this; Value Equation lens is a prompt-level addition, not a new skill
- **Landing page generation** — Landing Pages primitive + Pricing Page Generator already covers this
- **More → Better → New prioritization** — generic advice with no discrete trigger or structured output; folds into Business Constraint Diagnostic as a framing note
- **Management Diamond / STAR diagnostic** — internal team management framework, outside Five Rails' marketing/growth agent scope
- **Opportunity Arc (Informed Pessimism)** — mental model with no discrete trigger or machine-actionable output; skip
- **Puddle → Ocean niche expansion** — subset of Market Research + Competitive Intel; no new primitive needed
- **Cadence/voice patterns** (Math Out Loud, Story → Extract, Triple Suffering, etc.) — style guides that belong in skill prompt templates as instructions, not standalone skills
- **Four Business Risks audit** — subsumed by Business Constraint Diagnostic; doesn't need its own primitive

---

## E. ONE-LINE RANKING

1. **Routine: Churn Watchdog** — fills the single most expensive blind spot (leaky bucket compounds silently), 20 min build
2. **Routine: Inbound Lead Speed Check** — Decision Rule #3 is Hormozi's highest-leverage inbound variable, 20 min build
3. **Skill: Grand Slam Offer Builder** — every offer in the app benefits; upstream of sales page, ads, and outbound, 45 min build
4. **Playbook: New Offer Launch** — chains 5 existing skills into one end-to-end offer pipeline; no new code, 1 hr wiring
5. **Skill: Value Equation Auditor** — fills the conversion diagnosis gap that currently sends teams to "add features", 30 min build
6. **Skill: Business Constraint Diagnostic** — prevents marketing spend into a supply-constrained business; one of Hormozi's hardest rules to enforce, 30 min build
7. **Routine: Close Rate Price Alert** — leaves margin on the table every week it doesn't exist; completely automatable, 20 min build
8. **Playbook: Pricing Correction** — high-impact when triggered; chains existing skills, requires one human gate, 1 hr wiring
9. **Playbook: Retention Recovery** — critical when triggered; covers the full "fix before scaling" protocol, 1.5 hr wiring
10. **Skill: Pain Cycle Script Generator** — deepens every outbound sequence and sales opener; fills the emotional-anchor gap in current Outbound Sequence skill, 30 min build
11. **Skill: Sales Call Script Builder (CLOSER)** — fills the live-sales gap (Sales Page Surgeon handles pages, not calls), 45 min build