# Marty Cagan — Five Rails Workflow Candidates

---

## A. NEW SKILLS

---

**Skill name:** Riskiest Assumption Extractor

**When to invoke:** Any time a project or idea is about to receive engineering effort, or a prototype decision is being debated.

**Inputs:** `solution_description`, `target_customer`, `key_features_planned`

**Output:** Ranked list of 3-5 assumptions with: the assumption, why it's fatal if wrong, and the cheapest test to kill it fast.

**Prompt template:**
```
You are a product discovery advisor operating in the product model.
Given this proposed solution: {solution_description}
For customer: {target_customer}
List every assumption this solution depends on to succeed.
Rank them by: (probability of being wrong × cost if wrong).
For the top 3, prescribe the cheapest prototype or test that would kill it in <1 week.
Do not design the demo. Design the kill test.
```

**Source tactic:** "What's the riskiest assumption in this solution? That's what we prototype first." + "We're not trying to build the best demo — we're trying to kill the idea fastest if it's wrong."

---

**Skill name:** Four-Bar Solution Scorer

**When to invoke:** Before committing a project to build phase; when evaluating competing solutions in discovery.

**Inputs:** `solution_description`, `target_customer`, `business_constraints`, `known_alternatives`

**Output:** Pass/Fail score across all four bars (Value, Usability, Feasibility, Viability) with a blocking issue for any bar that fails.

**Prompt template:**
```
Evaluate this solution across all four bars. Fail fast — surface blockers, not praise.
Value: Will the customer choose this over {known_alternatives} including doing nothing?
Usability: Can the target customer actually use this without training or friction?
Feasibility: Can a small team build and maintain this reliably?
Viability: Does it clear legal, compliance, revenue model, and ops constraints?
For any failing bar, state the blocker in one sentence and the cheapest fix.
```

**Source tactic:** "The Four Dimensions of a Great Solution" (Value / Usability / Feasibility / Viability); "All four must pass. Value is the battlefield."

---

**Skill name:** Feature-to-Outcome Translator

**When to invoke:** When a stakeholder, founder, or external input arrives as a feature request rather than a problem to solve.

**Inputs:** `feature_request_text`, `requestor_role`, `stated_reason`

**Output:** Reformulated outcome statement + success metric + 2-3 alternative solutions worth exploring + negotiation script.

**Prompt template:**
```
A stakeholder has requested a feature: {feature_request_text}
Stated reason: {stated_reason}
Translate this into: (1) the underlying outcome they actually want,
(2) a measurable key result that defines success,
(3) two alternative solutions that might achieve the same outcome faster or cheaper,
(4) a one-paragraph script the PM can use to redirect the conversation from feature to outcome.
```

**Source tactic:** "I want to understand the outcome you're trying to achieve with this. My team can discover the best solution — which might be this feature, or might be something faster or cheaper."

---

**Skill name:** Premortem Failure Map

**When to invoke:** Before a project is greenlit for build; before a major product bet is committed.

**Inputs:** `solution_description`, `target_outcome`, `timeline`, `team_size`

**Output:** Structured failure map: 5-8 named failure modes, each with likelihood, severity, and one mitigation the team can act on now.

**Prompt template:**
```
We are about to commit to building: {solution_description}
Target outcome: {target_outcome}
It is 6 months from now and the project has failed. What killed it?
Generate 5-8 distinct failure modes. For each:
- Name the failure mode (one phrase)
- Rate likelihood (High/Medium/Low) and severity (Catastrophic/Significant/Minor)
- Prescribe one concrete mitigation action the team can take before building starts.
Ignore generic risks. Surface the ones specific to this solution and market.
```

**Source tactic:** "Premortem as a Discovery Technique" — "explicitly walk through every way this could fail... a structured forcing function to surface assumptions you haven't stress-tested."

---

**Skill name:** Discovery Readiness Gate

**When to invoke:** When a project transitions from ideation to active engineering commitment; used as a go/no-go checkpoint.

**Inputs:** `project_id`, `solution_description`, `validation_evidence` (what's been tested), `riskiest_assumptions_resolved`

**Output:** Binary gate decision (Ready / Not Ready) + specific gaps that must close before engineering starts.

**Prompt template:**
```
Evaluate whether this project has completed build-to-learn before build-to-earn.
Solution: {solution_description}
Evidence gathered: {validation_evidence}
Assumptions resolved: {riskiest_assumptions_resolved}
Check: Has the team validated value (customer will choose this)?
Has the team validated usability (customer can use it)?
Has the team resolved the top feasibility risk?
Has viability been cleared (legal, revenue, ops)?
Return: READY or NOT READY. For NOT READY, list exactly what must be completed.
```

**Source tactic:** "Build to Learn vs. Build to Earn" — "You must complete build-to-learn before committing engineering effort; shipping first and learning after is customer abuse."

---

## B. NEW ROUTINES

---

**Routine name:** Weekly Delivery-Impact Gap Review

**Cadence:** Every Monday, 8am

**Skill invoked:** Market Research (repurposed) + new Delivery-Impact comparison prompt against `projects` table (shipped status vs. `funnel_events` / `content_analytics` movement)

**Why:** Surfaces the exact anti-pattern Cagan flags — engineering velocity increasing while business results don't move. Without a scheduled forcing function, this gap becomes invisible until it's a crisis. No existing Five Rails routine tracks the ratio of shipped features to measurable outcome movement.

---

**Routine name:** Bi-Weekly Discovery Health Scan

**Cadence:** Every other Friday, 4pm

**Skill invoked:** Discovery Readiness Gate (above), run against all active projects in `projects` table where status = `active` and `validation_evidence` is null or >30 days old.

**Why:** Projects silently skip discovery under deadline pressure. This routine catches projects that entered build phase without passing the gate — surfacing them while recovery is still possible rather than post-ship.

---

## C. NEW PLAYBOOKS

---

**Playbook name:** Build-to-Learn Cycle

**Trigger:** New project created in `projects` table OR IdeaBrowser idea promoted to active project status.

**Steps:**
1. **Skill: Riskiest Assumption Extractor** → produces ranked assumption list
2. **Handoff → Marty agent** → reviews list, selects top assumption to kill first, assigns prototype method (qualitative test / landing page / mockup)
3. **Skill: Four-Bar Solution Scorer** → preliminary pass to identify any instant-kill blockers before prototype investment
4. **Agent task: build prototype** → lowest-fidelity artifact targeting assumption #1 (logged to `projects`)
5. **Skill: Premortem Failure Map** → run against the current solution shape post-prototype
6. **Decision gate: Discovery Readiness Gate** → READY → promote to engineering queue; NOT READY → loop back to step 1 with updated evidence
7. **On READY: log to `activity_log`**, update project status, notify via `agent_messages`

**Success metric:** Zero projects enter engineering without passing Discovery Readiness Gate. Measurable via `projects` table gate field.

---

**Playbook name:** Stakeholder Feature Intake

**Trigger:** New feature request arrives (via `agent_messages`, outbound contact note, or manual entry tagged as "feature request").

**Steps:**
1. **Skill: Feature-to-Outcome Translator** → converts request to outcome + success metric + alternative solutions + negotiation script
2. **Handoff → Marty agent** → reviews translated outcome, decides if it maps to an existing project OKR or needs a new project created
3. **If existing project:** attach outcome as a tagged requirement with evidence trail; update `projects`
4. **If new project:** create project with outcome-first framing; trigger Build-to-Learn Cycle playbook
5. **Log stakeholder request + translation to `activity_log`** for audit trail
6. **Send negotiation script back** to originating agent/user via `agent_messages`

**Success metric:** No feature request enters the backlog as a feature specification — all converted to outcome statements with measurable key results before project creation.

---

**Playbook name:** Responsible Experimentation Launch

**Trigger:** Project flagged as "experiment" type with live customer exposure planned.

**Steps:**
1. **Skill: Premortem Failure Map** → run specifically for customer-impact failure modes (data loss, broken trust, rug-pull for customer success)
2. **Skill: Four-Bar Solution Scorer** → viability bar only, focused on compliance + customer experience risk
3. **Decision: Marty agent** → reviews exposure scope, sets minimum viable exposure (smallest cohort that yields a real signal)
4. **Handoff → engineering agent task** → implement exposure controls (feature flags, cohort limits) before experiment runs
5. **Cron monitor** → check experiment metrics at 24h, 72h, 7d intervals against success metric set in step 1
6. **At each checkpoint:** if metrics outside acceptable range → auto-notify + pause experiment pending review
7. **On completion:** log results + decision to `activity_log`, update `funnel_events`

**Success metric:** Zero experiments reach paying customers without documented exposure controls and a pre-defined kill metric.

---

## D. DROP THESE

- **AI Product Coach skill** — the Marty Cagan agent *is* this; building a separate skill re-implements the agent's core function.
- **PM Calendar/Meeting Load Audit** — behavioral advice with no discrete output or database artifact; can't be operationalized as a Five Rails primitive.
- **Mission/Vision/Strategy Separator** — generic definitional exercise, no trigger, no output that connects to a table or downstream action.
- **Triple Threat Hiring Assessment** — org-design advice for scaling companies; Five Rails users are solo founders/small teams where this doesn't apply.
- **Product Model Diagnostic** — interesting framework but produces a label ("you're in project model"), not an artifact or action. Redundant with Marty agent's conversational judgment.
- **OKR-to-Discovery Alignment Check** — already implicit in Discovery Readiness Gate; adding it separately creates two overlapping gates.
- **Competitive Superiority Framing** — "dramatically better than alternatives" test is already covered by the Value bar in Four-Bar Solution Scorer + existing Competitive Intel skill.

---

## E. ONE-LINE RANKING

```
1.  Skill: Riskiest Assumption Extractor     — closes the "build wrong thing faster" gap, 20 min build
2.  Playbook: Build-to-Learn Cycle           — end-to-end discovery enforcement, fills biggest Cagan gap, 2h build
3.  Skill: Feature-to-Outcome Translator     — highest invocation frequency (every stakeholder ask), 25 min build
4.  Playbook: Stakeholder Feature Intake     — operationalizes translator into a full audit trail, 1h build
5.  Skill: Four-Bar Solution Scorer          — immediate quality gate before any engineering commit, 25 min build
6.  Routine: Weekly Delivery-Impact Gap      — makes the silent feature-factory failure visible, 30 min build
7.  Skill: Premortem Failure Map             — highest leverage pre-commit risk reduction, 25 min build
8.  Routine: Bi-Weekly Discovery Health Scan — catches gate-skipping under deadline pressure, 30 min build
9.  Skill: Discovery Readiness Gate          — hard binary enforcer for build-to-learn, 20 min build
10. Playbook: Responsible Experimentation    — high stakes but lower frequency than core discovery, 2h build
```