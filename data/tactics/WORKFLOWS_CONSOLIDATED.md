# Five Rails — Consolidated Workflow Proposals (transcript-derived)

---

## RANKING (top 20 by leverage)

---

### 1. Churn Watchdog — routine — from Hormozi
Fires daily at 6 AM; if `monthly_churn_rate > 20%`, creates a `priority: critical` agent task and halts active acquisition campaigns via `system_action`. The leaky bucket compounds silently — no existing Five Rails primitive gates acquisition spend on retention health.
**Impact:** Prevents compounding loss of acquisition investment into a broken funnel. **Build cost:** ~20 min (cron + query + system_action write). **Decision:** ship

---

### 2. Inbound Lead Speed Check — routine — from Hormozi
Fires every 15 minutes (or on `outbound_contacts` INSERT); any lead created >5 minutes ago with no outbound activity triggers a flagged agent message. Decision Rule: contact within 60 seconds or close rate drops 80% by minute 5.
**Impact:** Highest-leverage inbound variable; currently no latency enforcement exists anywhere in the system. **Build cost:** ~20 min. **Decision:** ship

---

### 3. Post-Mortem Extractor — skill — from Dalio
After any failure logged to `activity_log`: extracts the broken assumption (not the symptom), traces to root cause, encodes a one-liner decision rule ("When [condition], do [X] because [mechanism]"), and identifies the earliest detectable warning signal. Writes to a persistent principles store.
**Impact:** Closes the single most costly gap — failures that never produce principles. Every existing `activity_log` failure event is immediately addressable. **Build cost:** ~30 min. **Decision:** ship

---

### 4. Grand Slam Offer Builder — skill — from Hormozi
Given avatar + dream outcome + known objections: lists every obstacle as a named solution module, scores delivery mechanisms on perceived value vs. cost to deliver, stacks bonuses each individually worth the full price, outputs a complete Offer Brief (name, headline, feature stack, bonus stack, risk reversal, price anchor).
**Impact:** Upstream of every sales page, pricing page, ad, and outbound sequence in the app. Every offer benefits. **Build cost:** ~45 min. **Decision:** ship

---

### 5. Accusation Audit Generator — skill — from Voss
Before any cold outreach, difficult pitch, or price-sensitive send: ranks every negative thing the prospect is likely thinking, rewrites the opener to surface the two worst objections *before* the ask, outputs full draft with audit-first structure intact.
**Impact:** Highest-leverage outbound differentiator; reframes every cold open and directly increases reply rates on sequences the Email Wizard already generates. **Build cost:** ~30 min. **Decision:** ship

---

### 6. Riskiest Assumption Extractor — skill — from Cagan
Before any project receives engineering effort: lists every assumption the solution depends on, ranks by (probability of being wrong × cost if wrong), and for the top 3 prescribes the cheapest prototype or test that kills it in <1 week. Output is kill tests, not demos.
**Impact:** Closes the "build the wrong thing faster" gap. Nothing in the existing 14 skills gates engineering commitment on validated assumptions. **Build cost:** ~20 min. **Decision:** ship

---

### 7. Red Flag Pitch Auditor — skill — from Thiel
Checks any pitch or idea against 10 anti-patterns: large market on slide 1, buzzword niche, copying a proven model, competition density as validation, growth overweighted/durability ignored, single-breakthrough with no follow-through, lean iterating on the core thesis, social validation as low risk, hidden monopoly in narrow market, value creation without capture structure. Each flag: TRIGGERED / CLEAR, severity (low/medium/fatal), one-sentence correction.
**Impact:** Catches fatal structure errors at idea intake before any resource commitment. **Build cost:** ~30 min. **Decision:** ship

---

### 8. Dead Deal Detector — skill — from Voss
Scores any deal 0–8 across four cluster signals: impossible demands, blocked communication, public posturing without substance, no implementation discussion across last 3 touches. Binary output: CONTINUE (re-engage) or EXIT (generates clean fast-exit message). Prevents cycles wasted on contacts who already stopped negotiating.
**Impact:** Eliminates the silent drift of open deals toward unrecoverable ghost states. **Build cost:** ~30 min. **Decision:** ship

---

### 9. Value Equation Auditor — skill — from Hormozi
When conversion rate is below target: scores the four Value Equation levers (Dream Outcome × Likelihood ÷ Time Delay × Effort), identifies the single weakest lever, and proposes exactly 3 fixes for that lever only. No multi-lever recommendations — one root cause, one fix.
**Impact:** Replaces the default "add features" response to low conversion; focuses effort on the actual bottleneck. **Build cost:** ~30 min. **Decision:** ship

---

### 10. Business Constraint Diagnostic — skill — from Hormozi
Given monthly leads, close rate, churn, capacity utilization, gross margin, and LTGP:CAC ratio: delivers one verdict (supply vs. demand constrained), one bottleneck, and one prescribed action. Tests whether doubling ad spend would double revenue or create fulfillment chaos.
**Impact:** Prevents marketing spend into a supply-constrained business — one of the most expensive recurring mistakes at the growth stage. **Build cost:** ~30 min. **Decision:** ship

---

### 11. New Offer Launch — playbook — from Hormozi
Triggered when a `projects` row is created with `type = 'offer'`. Chains: Grand Slam Offer Builder → Value Equation Auditor (stress-test before any copy) → human approval gate → Pricing Page Generator → Sales Page Surgeon → Pain Cycle Script Generator → Ad Copy Generator (3 variants per weakest Value Equation lever). All copy sourced from the same validated Offer Brief.
**Impact:** End-to-end offer pipeline; no copy written without a validated offer first. Uses 5 existing skills + 2 new ones. **Build cost:** ~1h wiring. **Decision:** ship

---

### 12. Post-Failure Reflection Trigger — routine — from Dalio
Event-driven: fires within 1 hour of any negative outcome logged to `activity_log` (failed campaign, bounced sequence, cancelled deal, sub-threshold skill score). Automatically invokes Post-Mortem Extractor. Zero cost once the skill exists — encoded principle captured while the signal is live.
**Impact:** Ensures no failure goes unprocessed; removes the human tendency to skip reflection exactly when pain is highest. **Build cost:** ~15 min wiring. **Decision:** ship

---

### 13. Build-to-Learn Cycle — playbook — from Cagan
Triggered when a new project is created or an IdeaBrowser idea is promoted to active. Steps: Riskiest Assumption Extractor → Marty agent selects prototype method → Four-Bar Solution Scorer (preliminary instant-kill check) → prototype targeting assumption #1 → Premortem Failure Map → Discovery Readiness Gate (READY / NOT READY binary gate before engineering queue). Zero projects enter engineering without passing the gate.
**Impact:** Largest structural gap in current Five Rails product workflow; no discovery enforcement exists today. **Build cost:** ~2h. **Decision:** ship
*Also incorporates: Four-Bar Solution Scorer, Premortem Failure Map, Discovery Readiness Gate (Cagan) as embedded steps.*

---

### 14. Stuck Deal Revival — playbook — from Voss
Triggered when a deal has no `deal_activities` entry for 7+ days. Dead Deal Detector scores it; score 0–3 → Label-Stack Objection Handler re-engagement (3-label stack + single calibrated question); score 4–5 → Label-Stack + Future Vision frame; score 6–8 → clean fast exit, mark Closed Lost, log reason. On any re-engagement within 72h → Implementation Pivot Closer immediately.
**Impact:** Direct revenue recovery on deals already in the DB; resolves all stuck deals within 5 business days. **Build cost:** ~2h. **Decision:** ship

---

### 15. Feature-to-Outcome Translator — skill — from Cagan
Any time a feature request arrives: translates it to (1) the underlying outcome actually wanted, (2) a measurable key result defining success, (3) two alternative solutions worth exploring, (4) a one-paragraph PM negotiation script redirecting the conversation from feature to outcome.
**Impact:** Highest invocation frequency of any Cagan skill; every stakeholder ask that enters the system as a "build this" becomes an outcome statement before it touches a project. **Build cost:** ~25 min. **Decision:** ship

---

### 16. Monopoly Score — skill — from Thiel
Scores any business or project 0–10 on each of four dimensions: proprietary tech (10x better on one key dimension?), network effects (value compounds as nodes grow?), economies of scale (near-zero marginal cost?), brand (durably lodged in market's mind?). Also estimates X (value created) and Y% (fraction captured). Outputs moat verdict (0–1 = fragile, 2–3 = viable, 4 = dominant) + mandatory 2035 durability risk.
**Impact:** Fills the moat-scoring void — nothing in the existing 14 skills evaluates monopoly characteristics. **Build cost:** ~45 min. **Decision:** ship

---

### 17. Daily Deal Risk Scan — routine — from Voss
Runs Dead Deal Detector across every active deal each morning at 8 AM; surfaces any deal scoring ≥ 5 as a flagged triage item for the agent. Zero marginal cost once Dead Deal Detector exists.
**Impact:** Passive triage that prevents another day of agent cycles wasted on contacts who stopped negotiating. **Build cost:** ~15 min wiring. **Decision:** ship

---

### 18. Contrarian Stress-Tester — skill — from Dalio
Before any high-conviction decision (deal > threshold, strategic pivot, key hire, major spend): constructs the strongest possible case against the proposal (not a straw man), states the single most specific condition under which the proposal is dead wrong, and names the profile of person whose disagreement should shift the probability estimate.
**Impact:** Highest decision-quality ROI per token; prevents expensive high-conviction mistakes by forcing a falsifiability condition before commitment. **Build cost:** ~45 min. **Decision:** ship
*Also-proposed-by: Thiel (Red Flag Pitch Auditor flag #4 + #5 cover the same instinct for pitches specifically)*

---

### 19. High-Stakes Decision Gate — playbook — from Dalio
Triggered when any agent submits a ≥ 80% confidence recommendation with no recorded dissent, or when a deal/hire/strategic pivot is flagged high-stakes. Steps: Contrarian Stress-Tester → if material risk surfaces: Believability-Weighted Decider (weights inputs by verifiable track record, not vote count) → Dalio delivers recommendation with full reasoning chain (not just conclusion) → decision + falsifiability condition logged to `activity_log` as principle candidate.
**Impact:** Zero high-stakes decisions without a recorded falsifiability condition; chains two new skills into Dalio's core arbitration function. **Build cost:** ~1h wiring. **Decision:** ship
*Absorbs: Believability-Weighted Decider (Dalio) as an embedded step.*

---

### 20. Idea → Last Mover Validation Gate — playbook — from Thiel
Triggered when an IdeaBrowser idea scores above threshold or is flagged for deep evaluation. Steps: Red Flag Pitch Auditor (≥ 2 fatal flags → DROP with rationale) → Market Intersection Decoder (corrects true competitive structure if TAM is distorted) → Monopoly Score (avg ≤ 2/10 → DROP) → Concentric Expansion Planner (Day 1 micro-market + 3 rings) → Durability DCF Stress Test (2035 dominance case must be articulable) → handoff to Marty Cagan agent as validated product brief.
**Impact:** Idea exits with a named micro-market, ≥ 2 monopoly characteristics ≥ 6/10, and an articulable durability thesis — or it's killed with a documented reason. **Build cost:** ~60 min wiring + ~2.5h for embedded skills. **Decision:** ship
*Absorbs: Market Intersection Decoder, Concentric Expansion Planner, Durability DCF Stress Test (Thiel) as embedded steps.*

---

## DROPPED (redundant with existing or absorbed into ranked items)

**Absorbed into ranked items:**
- **Blind-Spot Mapper** (Dalio) — core logic absorbed into Contrarian Stress-Tester prompt; prompts the same structural audit as a sub-step
- **Believability-Weighted Decider** (Dalio) — absorbed as step 2 of High-Stakes Decision Gate (#19)
- **Species Identifier** (Dalio) — pattern-recognition logic absorbed into Post-Mortem Extractor (step 3 of encoded principle) and High-Stakes Decision Gate
- **Three-Basics Org Diagnostician** (Dalio) — diagnostic dimensions absorbed into Business Constraint Diagnostic (#10) at a more actionable resolution
- **Bubble-Gauge Opportunity Checker** (Dalio) — six-indicator checklist absorbed into Red Flag Pitch Auditor (#7, flags 1–4) + Monopoly Score (#16) covers it from a structural angle
- **Four-Bar Solution Scorer** (Cagan) — embedded as the preliminary pass in Build-to-Learn Cycle (#13)
- **Premortem Failure Map** (Cagan) — embedded as step 5 of Build-to-Learn Cycle (#13)
- **Discovery Readiness Gate** (Cagan) — embedded as step 6 of Build-to-Learn Cycle (#13)
- **Stakeholder Feature Intake** (Cagan playbook) — Feature-to-Outcome Translator (#15) covers the skill; playbook overhead absorbed into project creation workflow
- **Market Intersection Decoder** (Thiel) — embedded in Idea → Last Mover Validation Gate (#20); Red Flag Pitch Auditor flags #1 and #2 cover the same distortion for general pitches
- **Concentric Expansion Planner** (Thiel) — embedded in Idea → Last Mover Validation Gate (#20)
- **Durability DCF Stress Test** (Thiel) — embedded in Idea → Last Mover Validation Gate (#20)
- **Implementation Pivot Closer** (Voss) — absorbed into Stuck Deal Revival (#14) as the final branch on re-engagement
- **Label-Stack Objection Handler** (Voss) — absorbed into Stuck Deal Revival (#14) and Voss Cold Outreach Playbook logic; too narrow to rank standalone
- **Weekly Sequence Dismissal Audit** (Voss routine) — absorbed into Daily Deal Risk Scan (#17) scope
- **Failure-to-Principle Pipeline** (Dalio playbook) — absorbed into Post-Mortem Extractor (#3) + Post-Failure Reflection Trigger (#12)
- **Opportunity Conviction Validator** (Dalio playbook) — absorbed into Idea → Last Mover Validation Gate (#20) which handles the same gate with stronger Thiel framing
- **Weekly Three-Basics Health Pulse** (Dalio routine) — lower leverage once Business Constraint Diagnostic and Close Rate Price Alert exist
- **Monthly Bubble-Gauge Market Scan** (Dalio routine) — Mimetic Density Monitor + Red Flag Pitch Auditor cover this at lower build cost
- **Voss Cold Outreach Playbook** — Accusation Audit Generator (#5) + Email Wizard (existing) + Stuck Deal Revival (#14) cover the same sequence without a separate playbook
- **Bi-Weekly Discovery Health Scan** (Cagan routine) — absorbed as enforcement logic inside Build-to-Learn Cycle (#13)
- **Weekly Delivery-Impact Gap Review** (Cagan routine) — valuable but falls outside top 20; tracks shipped-vs-outcome ratio via `funnel_events`; defer until post-launch of Build-to-Learn Cycle
- **Weekly Monopoly Re-Score** (Thiel routine) — useful but lower urgency; defer until Monopoly Score (#16) ships and stabilizes
- **Mimetic Density Monitor** (Thiel routine) — covered by existing Competitive Intel skill + Red Flag Pitch Auditor flag #4; no additional primitive needed
- **Vertical Integration Audit** (Thiel) — high upside but narrow trigger (mature projects leaking margin); ship after core 20 land
- **Vertical Integration Discovery Sprint** (Thiel playbook) — depends on Vertical Integration Audit; defer
- **Retention Recovery Playbook** (Hormozi) — Churn Watchdog (#1) → trigger → Email Wizard + Outbound Sequence (existing) covers this; full playbook is lower priority than the trigger
- **Pricing Correction Playbook** (Hormozi) — Close Rate Price Alert → Business Constraint Diagnostic (#10) + Pricing Page Generator (existing) covers this without a separate playbook
- **Responsible Experimentation Launch** (Cagan playbook) — high stakes but lower frequency; defer until Build-to-Learn Cycle ships
- **Pain Cycle Script Generator** (Hormozi) — *also-proposed-by: Voss (emotional labeling arc)*; emotional anchoring belongs as a prompt constraint inside the Outbound Sequence and Email Wizard skills, not a standalone primitive at this stage
- **Sales Call Script Builder CLOSER** (Hormozi) — fills a live-sales gap but Five Rails is currently agent-driven async; defer until a synchronous sales flow is scoped

**Redundant with existing Five Rails primitives:**
- **Email sequences / reactivation scripts** — Email Wizard already handles; Hormozi/Voss voice patterns are style inputs to the existing skill
- **Ad copy variants** — Ad Copy Generator (existing); Value Equation lens added as prompt instruction
- **Landing page / pricing page generation** — Pricing Page Generator + existing landing_pages primitive
- **Social content production** — Social Content Calendar (existing)
- **Competitive analysis** — Competitive Intel (existing)
- **Market Research** — Market Research (existing); Dalio's macro cycle analysis has no business-level trigger