# Ray Dalio — Five Rails Workflow Candidates

---

## A. NEW SKILLS

---

**Skill name: Post-Mortem Extractor**
**When to invoke:** After any failed campaign, launch, outbound sequence, or high-stakes bet — triggered by negative outcome logged to `activity_log` or manually by an agent.
**Inputs:** `what_was_attempted`, `expected_outcome`, `actual_outcome`, `context_snapshot`
**Output:** Broken assumption identified; root cause (not symptom); encoded principle as a one-liner decision rule; recommended safeguard for next recurrence.
**Prompt template:**
```
You are a root-cause investigator, not a blame-assigner.
Given: attempted action, expected vs actual outcome.
Step 1: Name the broken assumption — not what went wrong, but what you believed that turned out false.
Step 2: Trace to root cause. Reject the first two answers; they are symptoms.
Step 3: Draft the principle: "When [condition], do [X] because [mechanism]."
Step 4: Name the earliest detectable signal that should have triggered a different path.
Return: assumption_broken, root_cause, encoded_principle, early_warning_signal.
```
**Source tactic:** Pain + Reflection = Progress; Five-Step Process (Step 3 diagnosis); post-mortem script

---

**Skill name: Contrarian Stress-Tester**
**When to invoke:** Before committing to any high-conviction decision — a new hire, a pricing change, a campaign bet, a platform expansion. Triggered when Dalio agent flags decision confidence ≥ 80%.
**Inputs:** `proposed_action`, `stated_rationale`, `confidence_level`, `relevant_context`
**Output:** Steelmanned opposition case; specific falsifiability condition ("this is wrong if X"); recommended credible dissenter to consult; go / pause / kill recommendation.
**Prompt template:**
```
You are the smartest, best-informed person who believes the opposite of this proposal.
Construct the strongest possible case against it — not a straw man, the real case.
Then: state the single most specific condition under which the proposal is dead wrong.
Then: name the type of person (by track record and domain) whose disagreement should shift the probability estimate.
Do NOT: hedge everything. Pick a side on whether this holds up.
Return: opposition_case, falsifiability_condition, dissenter_profile, recommendation.
```
**Source tactic:** High-conviction bet decision rule; "who is the smartest person who disagrees with you" script; ego barrier vs. blind spot framework

---

**Skill name: Believability-Weighted Decider**
**When to invoke:** When multiple agents or advisors have conflicting recommendations on the same decision — Dalio invokes this to arbitrate rather than vote.
**Inputs:** `decision_context`, `advisor_inputs[]` (each: name, recommendation, rationale, relevant_track_record)
**Output:** Believability weight assigned to each input; synthesis that starts from highest-weight reasoning; final recommendation with explicit weighting chain.
**Prompt template:**
```
Do not count votes. Weight them.
For each input, assess: what is this person's verifiable track record on THIS specific type of question?
Assign relative believability weights (not arbitrary — base on evidence in track record).
Start your synthesis from the highest-weight reasoning, then layer in credible divergences.
Flag: any low-weight view that contains a claim the high-weight views haven't addressed.
Return: weight_assignments (with rationale), synthesis, final_recommendation, unresolved_flag.
```
**Source tactic:** Idea Meritocracy + Believability-Weighted Decision Making; "let's not vote" script; Dalio arbitration role in Five Rails

---

**Skill name: Bubble-Gauge Opportunity Checker**
**When to invoke:** When evaluating a new market, niche, or IdeaBrowser opportunity — especially when initial scoring is high and enthusiasm is strong. Also triggered before entering any new content vertical or ad spend category.
**Inputs:** `opportunity_name`, `opportunity_description`, `market_signals[]`, `price_trend`, `buyer_behavior_notes`
**Output:** Score 0–6 on the six-indicator checklist; interpretation (noise / watch / signal); specific risk flags; recommended next validation step.
**Prompt template:**
```
Apply the six-indicator bubble checklist to this opportunity:
1. Prices/CAC/CPM high relative to historical norms?
2. Projections require unsustainable conditions to hold?
3. New entrants flooding in driven by FOMO, not fundamentals?
4. Consensus sentiment: "not being in this feels foolish"?
5. Speculative or forward positioning beyond immediate need?
6. Debt or leverage financing the growth?
Score each 0/1. Report total. One indicator = noise. Four or more = structural risk signal.
Return: indicator_scores, total, interpretation, top_risk_flag, recommended_next_step.
```
**Source tactic:** Six-Indicator Bubble Gauge; "investor asks if we're in a bubble" script; anti-pattern "concentrating in what worked last paradigm"

---

**Skill name: Species Identifier**
**When to invoke:** When an agent or user describes a business situation that feels unprecedented or stuck — competitive threat, team conflict, stalled funnel, failed launch pattern. Dalio triggers this before designing a response.
**Inputs:** `situation_description`, `what_has_been_tried`, `current_emotional_temperature`
**Output:** Named species (category of recurring situation); closest historical analog and its mechanics; predicted pattern of what comes next if untreated; recommended protocol from the historical case.
**Prompt template:**
```
Stop. Do not treat this as unique. Almost everything is another one of those.
Name the species: what category of recurring situation is this?
(Examples: "market saturation inflection," "founder ego-versus-market signal," "feature-before-distribution trap," "team trust collapse post-conflict.")
Identify the closest historical analog — not surface similarity, mechanic similarity.
Trace the cause-effect chain of that historical case to its resolution.
Return: species_name, historical_analog, mechanic_chain, predicted_trajectory_if_unchanged, recommended_protocol.
```
**Source tactic:** Species Thinking / Pattern Recognition; "stop — what species is this?" script; "treating every situation as unique" anti-pattern

---

**Skill name: Blind-Spot Mapper**
**When to invoke:** Before a major strategic decision or hire — specifically when the team making the decision is compositionally similar (same background, same success paradigm, same risk profile). Dalio invokes this when the team is in consensus too fast.
**Inputs:** `decision_context`, `decision_team_profiles[]`, `current_consensus_view`
**Output:** Identified structural gaps in team composition; specific perspectives not represented; distinction between ego-driven resistance (fixable with humility) vs. genuine structural blind spots (fixable only by sourcing differently-wired people); recommended profile to recruit for dissent.
**Prompt template:**
```
Ego barrier and blind spot barrier are different problems requiring different fixes.
Ego barrier: the team can see the risk but is defending against it emotionally. Flag where this is happening.
Blind spot barrier: the team literally cannot perceive a class of risk because no one in the room is wired to see it.
Audit: what backgrounds, incentive structures, and failure histories are absent from this decision?
What would someone with [missing profile] see that everyone present cannot?
Return: ego_barriers_flagged, structural_blind_spots, missing_perspective_profiles, recommended_dissenter_type.
```
**Source tactic:** Ego Barrier vs. Blind Spot Barrier framework; "find three people who disagree with each other" script; "weakness compensation vs. fixing weakness" script

---

**Skill name: Three-Basics Org Diagnostician**
**When to invoke:** Weekly or on-demand when Dalio agent is running cross-department quality control — produces a three-dimension health snapshot that gates strategic escalation.
**Inputs:** `revenue_vs_spend_summary`, `internal_team_status_notes`, `external_threat_signals`
**Output:** Red/yellow/green on each of Dalio's three fundamentals; overall fragility score; which dimension demands immediate attention; one recommended intervention per red.
**Prompt template:**
```
Run the three-basics diagnostic. A red on any one signals systemic fragility even if the others look strong.
Dimension 1 — Economic: Is revenue/value generated exceeding spend? Trend direction matters more than snapshot.
Dimension 2 — Internal: Is the team working together effectively, or is dysfunction accumulating?
Dimension 3 — External: Are competitive, regulatory, or market forces creating existential pressure?
For each: red / yellow / green + one-sentence evidence.
Return: dimension_scores, fragility_assessment, priority_dimension, recommended_interventions[].
```
**Source tactic:** Three-basics diagnostic decision rule; Five Big Forces (scaled to org level); "are you earning more than spending / working well together / at external risk" framework

---

## B. NEW ROUTINES

---

**Routine name: Weekly Three-Basics Health Pulse**
**Cadence:** Every Monday, 8:00 AM
**Skill invoked:** Three-Basics Org Diagnostician
**Why:** Dalio's arbitration role requires a standing operational baseline before the week's decisions are made. Without a recurring diagnostic, Dalio only sees problems after they've cascaded. This fills the gap between ad-hoc crisis response and proactive cross-department monitoring — and gates whether Dalio escalates to the user or operates autonomously that week.

---

**Routine name: Post-Failure Reflection Trigger**
**Cadence:** Event-driven — fires within 1 hour of a negative outcome logged to `activity_log` (failed campaign, bounced sequence, cancelled deal, sub-threshold skill execution score)
**Skill invoked:** Post-Mortem Extractor
**Why:** Without an automated trigger, reflection is skipped exactly when pain is highest — which is precisely when Dalio's framework says the signal is live and the lesson is cheapest to capture. Making it event-driven rather than scheduled ensures no failure goes unprocessed. The encoded principle gets written to a principles store before the emotional context fades.

---

**Routine name: Monthly Bubble-Gauge Market Scan**
**Cadence:** First Monday of each month, 9:00 AM
**Skill invoked:** Bubble-Gauge Opportunity Checker — run against top 3 active content verticals and any IdeaBrowser ideas scored above 75 in the prior month
**Why:** IdeaBrowser's existing scoring engine measures idea quality at intake, but doesn't re-evaluate whether the market for high-scoring ideas has since become saturated or speculative. This routine catches paradigm shifts before ad spend or content investment is concentrated into a bubble. Complements rather than duplicates the existing scoring engine.

---

## C. NEW PLAYBOOKS

---

**Playbook name: High-Stakes Decision Gate**
**Trigger:** Dalio agent detects a decision flagged as high-stakes (deal > threshold, strategic pivot, key hire, major budget commitment) OR any agent submits a recommendation with confidence ≥ 80% and no dissent recorded.
**Steps:**
1. **Blind-Spot Mapper** → identify structural gaps in who is deciding and what they cannot see
2. **Contrarian Stress-Tester** → construct strongest opposition case; extract falsifiability condition
3. If stress-test surfaces material risk: **Species Identifier** → name the category, consult historical pattern
4. **Believability-Weighted Decider** → synthesize all inputs weighted by track record; output final recommendation
5. Dalio handoff → deliver recommendation to user with full reasoning chain (not just conclusion)
6. Post-decision: log decision + rationale to `activity_log` as a principle candidate for future retrieval

**Success metric:** Zero high-stakes decisions executed without a recorded falsifiability condition and a documented believability-weighted synthesis.

---

**Playbook name: Failure-to-Principle Pipeline**
**Trigger:** Post-Mortem Extractor returns a root cause that matches a prior root cause (recurring failure pattern detected) OR any failure that cost > defined threshold in revenue, time, or relationship capital.
**Steps:**
1. **Post-Mortem Extractor** → extract broken assumption, root cause, encoded principle
2. **Root-Cause Diagnostician check** → confirm the diagnosis reaches actual root cause (not symptom); reject if it stops at the first-order explanation
3. **Species Identifier** → confirm whether this failure belongs to a known category with a historical protocol
4. Agent task: write principle to persistent principles store with trigger condition + decision rule
5. **Believability-Weighted Decider** → if failure involved multiple agents or advisors, weight their post-mortem inputs before encoding the principle
6. Dalio broadcasts updated principle to all relevant agents via `agent_messages` handoff
7. Schedule: re-run **Three-Basics Org Diagnostician** to confirm the failure hasn't cascaded

**Success metric:** Every failure above cost threshold produces one encoded principle logged within 24 hours. Recurrence rate of same root cause drops to zero over 90 days.

---

**Playbook name: Opportunity Conviction Validator**
**Trigger:** IdeaBrowser idea scores above 80, or Marty/Thiel agents flag an opportunity for fast-track execution.
**Steps:**
1. **Bubble-Gauge Opportunity Checker** → score the market on 6 indicators; halt if ≥ 4 indicators are red
2. **Species Identifier** → name the category of opportunity; retrieve historical analog and predicted trajectory
3. **Contrarian Stress-Tester** → construct the strongest case for why this opportunity is a trap
4. If stress-test passes: Marty agent runs existing `validation_campaigns` (Thiel score → market test) — this playbook gates entry into that pipeline, it does not replace it
5. If stress-test surfaces a bubble flag: Dalio holds the opportunity in a "watch" queue, re-runs Bubble-Gauge in 30 days
6. Log conviction score + reasoning chain to `activity_log` for traceability

**Success metric:** No opportunity enters the validation pipeline without a recorded species identification and a passed stress-test. False-positive rate on high-scoring ideas (ideas that fail in market test) decreases quarter-over-quarter.

---

## D. DROP THESE (redundant with existing primitives)

- **Market Research / Competitive Intel implications of the "Three-Force Economic Model" and "Five Big Forces"** — macro debt cycle analysis has no discrete trigger or output in a business-tool context; already covered conceptually by existing Market Research and Competitive Intel skills at the level Five Rails operates.
- **"Radical Transparency as Organizational Infrastructure"** — systemic org design advice with no discrete trigger or output. Not a skill, routine, or playbook — it's an architectural philosophy. Implement it in Dalio's persona configuration, not as a workflow.
- **"Two Types of Inflation / Wealth Storage Problem"** — macro capital allocation advice irrelevant to Five Rails' business context. No actionable primitive.
- **"Beautiful Deleveraging / Four-Lever Framework"** — macroeconomic policy framework; no business-level trigger or output.
- **"Big Cycle of Empire Rise and Decline"** — historical pattern analysis at 250-year resolution; not operationalizable as a business workflow.
- **Cadence/Voice Patterns section** — persona-level voice calibration for Dalio's agent character, not a workflow primitive. Encode in `DALIO_AGENT_PERSONA.md`.
- **"Verbatim Signature Lines"** — same as above; persona, not workflow.
- **"Cash is trash / don't hold cash" decision rule** — macro investing advice; not relevant to Five Rails business operations.
- **Content Engine / Social Content Calendar** — several tactical scripts around communication and framing ("zoom out before zooming in," "state mechanics then implication") are voice patterns for Dalio's outputs, not new skills. Already covered by Content Engine and Social Content Calendar.

---

## E. ONE-LINE RANKING

Ordered by `(impact × cheapness to ship)`:

1. **Skill: Post-Mortem Extractor** — closes the single most costly gap (failures that don't produce principles), 30-min build, immediately applicable to every existing `activity_log` failure event
2. **Routine: Post-Failure Reflection Trigger** — zero-code after Post-Mortem Extractor ships; event-driven cron on `activity_log` makes the skill automatic, multiplying its leverage
3. **Skill: Contrarian Stress-Tester** — highest decision-quality ROI per token; prevents expensive high-conviction mistakes; 45-min build
4. **Playbook: High-Stakes Decision Gate** — chains three already-proposed skills into Dalio's core arbitration function; no new skills needed after A/B/C above ship
5. **Skill: Believability-Weighted Decider** — native to Dalio's cross-department arbitration role; 45-min build; directly enables the Decision Gate playbook
6. **Skill: Bubble-Gauge Opportunity Checker** — extends existing IdeaBrowser scoring with a specific anti-bubble checklist; 30-min build; composable into Opportunity Validator playbook
7. **Routine: Weekly Three-Basics Health Pulse** — zero-cost after Three-Basics Diagnostician ships; gives Dalio a standing operational baseline every Monday
8. **Skill: Three-Basics Org Diagnostician** — simple three-dimension diagnostic, narrow scope, fast build; feeds the weekly routine and the Failure-to-Principle playbook
9. **Playbook: Failure-to-Principle Pipeline** — highest compounding value over time (principles accumulate); moderate build complexity because it chains multiple skills
10. **Skill: Species Identifier** — high conceptual leverage, moderate prompt complexity; most valuable when chained in playbooks rather than invoked standalone
11. **Playbook: Opportunity Conviction Validator** — integrates with existing `validation_campaigns` gate; strong ROI but depends on Bubble-Gauge and Contrarian skills shipping first
12. **Skill: Blind-Spot Mapper** — important structural complement to Contrarian Stress-Tester but narrower use case (triggers mainly on fast-consensus decisions); 45-min build, lower invocation frequency than other skills