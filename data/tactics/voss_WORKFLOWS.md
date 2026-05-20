# Chris Voss — Five Rails Workflow Candidates

---

## A. NEW SKILLS

---

**Skill name:** Accusation Audit Generator
**When to invoke:** Before sending any cold outreach, difficult pitch, or price-sensitive message
**Inputs:** `prospect_profile`, `offer_summary`, `deal_context`
**Output:** (1) ranked objection list the prospect is likely carrying, (2) rewritten message opener that surfaces the 2 worst objections *before* the ask, (3) full draft with the audit embedded
**Prompt template (sketched):**
```
You are Chris Voss's pre-send intelligence layer.
Context: {{deal_context}}. Offer: {{offer_summary}}. Recipient: {{prospect_profile}}.
Step 1: List every negative thing this prospect might think about this message — rank worst to mildest.
Step 2: Rewrite the opening line to name the top 2 objections out loud before the ask.
Step 3: Draft the full message with the audit-first structure intact. No softening. No apologies.
Output format: objection_list | rewritten_opener | full_draft.
```
**Source tactic:** Accusation Audit (Pre-Label) + "What I'm about to say is probably going to offend you"

---

**Skill name:** Label-Stack Objection Handler
**When to invoke:** When a prospect reply contains resistance, price pushback, "you're right," or flat affect
**Inputs:** `reply_text`, `deal_context`, `desired_next_step`
**Output:** Response draft opening with 3 sequential labels → one calibrated "what" or "how" question. No pitch. No rebuttal.
**Prompt template (sketched):**
```
You are the tactical empathy engine for Five Rails.
Input: prospect replied with: {{reply_text}}. Deal context: {{deal_context}}.
Step 1: Classify the emotional subtext (frustration, dismissal, confusion, fear of loss, etc.).
Step 2: Write 3 sequential labels — "It sounds like…", "It seems like…", "It looks like…" — each one going one layer deeper.
Step 3: Close with a single calibrated "what" or "how" question. Zero asks, zero pitches.
Flag internally if reply matches "you're right" dismissal pattern vs. genuine "that's right" signal.
```
**Source tactic:** Label → Deactivate + Cadence/Voice (stack three labels before any ask) + "You're right" vs "that's right" decision rule

---

**Skill name:** Dead Deal Detector
**When to invoke:** When a deal shows no movement for 5+ days, or before committing more agent cycles to a contact
**Inputs:** `deal_id`, `recent_message_log`, `stage_history`, `reply_patterns`
**Output:** Risk score (0–8), triggered signal breakdown, binary recommendation: CONTINUE (re-engage) or EXIT (close cleanly now)
**Prompt template (sketched):**
```
You are a negotiation risk analyst trained on high-risk indicator cluster detection.
Input: deal history: {{message_log}}, stage changes: {{stage_history}}, reply patterns: {{reply_patterns}}.
Evaluate four cluster signals: (1) impossible demands, (2) blocked or one-way communication, (3) emotional/public posturing without substance, (4) no implementation discussion across last 3 touches.
Score each signal 0–2. Total /8.
Output: per-signal score, total risk score, recommendation (CONTINUE | EXIT), and if EXIT — draft a clean fast-exit message.
```
**Source tactic:** High-Risk Indicator Clusters + "It's not a sin to not get the deal — it's a sin to take a long time to not get it"

---

**Skill name:** Implementation Pivot Closer
**When to invoke:** The moment a deal reaches verbal agreement, stage moves to "Negotiation" or "Verbal Yes," or a prospect sends a positive signal
**Inputs:** `deal_id`, `agreed_terms_summary`, `counterpart_name`, `rep_name`
**Output:** Next-steps confirmation message anchored to "How do you want to proceed?" + internal `agent_tasks` row list (who, what, by when)
**Prompt template (sketched):**
```
You are the deal implementation layer for Five Rails. The sin is not failing to close — it's leaving a "yes" without next steps.
Input: deal: {{deal_id}}, agreed terms: {{terms_summary}}, parties: {{counterpart}} / {{rep}}.
Draft a message that pivots immediately to implementation. Anchor on: "How do you want to proceed?"
If ambiguity exists, use: "Is it a ridiculous idea if I walk through what happens from here?"
Output: (1) send-ready message, (2) structured task list — action | owner | due date — formatted for agent_tasks insertion.
```
**Source tactic:** Implementation Pivot + "The big problem in all negotiations is a lack of discussion of next steps"

---

## B. NEW ROUTINES

---

**Routine name:** Daily Deal Risk Scan
**Cadence:** Daily, 8 AM
**Skill invoked:** Dead Deal Detector
**Why:** Open deals drift toward unrecoverable ghost states silently. This routine runs the cluster-signal check across every active deal each morning and surfaces any scoring ≥ 5 as a flagged triage item for the agent — before another day of cycles gets wasted on a contact who stopped negotiating three touches ago.

---

**Routine name:** Weekly Sequence Dismissal Audit
**Cadence:** Every Monday, 7 AM
**Skill invoked:** Label-Stack Objection Handler
**Why:** "You're right" replies accumulate invisibly inside email sequences that look engaged on the surface. This routine scans the prior week's inbound replies for dismissal-pattern language, classifies each as genuine engagement vs. brush-off, and queues re-engagement tasks for any contacts that have been politely sidelining the agent.

---

## C. NEW PLAYBOOKS

---

**Playbook name:** Voss Cold Outreach Playbook
**Trigger:** New `outbound_contact` added with tag `cold` or sequence type `new_prospect`
**Steps:**
1. **Accusation Audit Generator** — scan prospect profile + offer, produce objection-first opener
2. **Email Wizard** — draft full sequence using accusation-audited opener as a hard constraint (not optional framing)
3. **[Wait for reply]** → **Label-Stack Objection Handler** — classify reply as `that's_right` / `you're_right` / `resistant` / `silent`
4. If `you're_right` dismissal → re-run Label-Stack with calibrated question only, no pitch
5. If `resistant` with price signal → Label-Stack + "It sounds like that number landed wrong — what does fair look like to you?"
6. If positive signal → **Implementation Pivot Closer** — generate next-steps message + create `agent_tasks`
7. If 3 touches, no real engagement → **Dead Deal Detector** → score ≥ 5: generate clean exit, mark lost, log to `activity_log`

**Success metric:** `that's_right` reply rate > 15% on initial sequence; deals that reach Implementation Pivot within 5 touches

---

**Playbook name:** Stuck Deal Revival Playbook
**Trigger:** Deal has no `deal_activities` entry for 7+ days and status is not `Closed Won` or `Closed Lost`
**Steps:**
1. **Dead Deal Detector** — score the deal against cluster signals
2. Score 0–3 (recoverable): **Label-Stack Objection Handler** — generate re-engagement message, 3-label stack + single calibrated question, no offer refresh
3. Score 4–5 (borderline): **Label-Stack** + append Future Vision framing — "Let's look at where we could both be in 12 months — what would need to be true for that to happen?"
4. Score 6–8 (gone): generate fast, clean exit message ("It sounds like the timing isn't right. If that changes, here's how to reach us."), update deal to `Closed Lost`, log reason to `activity_log`
5. On any re-engagement reply within 72h → **Implementation Pivot Closer** immediately

**Success metric:** Stuck deals resolved (closed won or cleanly closed lost) within 5 business days of trigger; zero deals left open > 30 days without a scored status

---

## D. DROP THESE

- **Three Voices framework** — meta-coaching, no discrete trigger or output; cannot be operationalized as a prompt without knowing which voice *the user* defaults to
- **Shu Ha Ri progression** — skill development philosophy; no system hook, no input/output boundary
- **Abundance Frame as Foundation** — mindset prerequisite, not a workflow primitive; cannot be scheduled or invoked
- **Low-stakes practice cadence** (label the Lyft driver) — human behavioral training; outside system boundary
- **Voice and pace patterns** (FM DJ voice, downward inflection) — verbal delivery coaching; not composable in text-based agent outputs
- **Strategic umbrage anti-pattern** — a decision rule to *avoid* a behavior, already covered as a constraint in Label-Stack and Email Wizard prompt constraints
- **"Fair" F-Bomb counter-script** — this is a one-liner embedded response; redundant with Label-Stack Objection Handler which already handles price/fairness pushback as a sub-case
- **Cultural universality of limbic response** — framing note for the practitioner, not a discrete workflow output

---

## E. ONE-LINE RANKING

**Ranked by `(impact × cheapness to ship)`:**

1. **Skill: Accusation Audit Generator** — highest-leverage outbound differentiator, reframes every cold open, 30 min build
2. **Skill: Dead Deal Detector** — prevents wasted cycles on ghost deals that already ended, 30 min build
3. **Playbook: Stuck Deal Revival** — direct revenue recovery on deals already in the DB, ~2h build, most primitives already exist
4. **Skill: Label-Stack Objection Handler** — fills the emotional-intelligence gap in reply handling, turns rejections into data, 45 min build
5. **Routine: Daily Deal Risk Scan** — passive triage, free once Dead Deal Detector exists, 15 min wiring
6. **Skill: Implementation Pivot Closer** — kills the single most common deal failure mode (verbal yes → silence), 30 min build
7. **Playbook: Voss Cold Outreach Playbook** — orchestrates 4 skills into a full sequence, ~3h build, highest dependency count
8. **Routine: Weekly Sequence Dismissal Audit** — surfaces hidden brush-offs before they age out, 20 min build once Label-Stack exists