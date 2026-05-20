# Peter Thiel — Five Rails Workflow Candidates

## A. NEW SKILLS

---

**Skill name:** Monopoly Score  
**When to invoke:** Agent evaluates any idea, project, or business before committing resources  
**Inputs:** `business_name`, `description`, `target_market`, `key_technology`  
**Output:** Structured score (0–10) on each of the four monopoly characteristics + X/Y value capture assessment + go/no-go verdict with one-paragraph rationale  
**Prompt template:**
```
You are Peter Thiel evaluating a business for monopoly potential.
Score {business_name} on four dimensions (0–10 each):
  1. Proprietary tech: Is it 10x better on at least one key dimension?
  2. Network effects: Does value compound as users/nodes grow?
  3. Economies of scale: Near-zero marginal cost, high fixed-cost advantage?
  4. Brand: A concept durably lodged in the market's mind?
Then separately estimate X (total value created) and Y% (fraction captured).
Output: scores, X/Y split, moat verdict (0–1 characteristics = fragile, 2–3 = viable, 4 = dominant), and one mandatory constraint: name the single biggest durability risk in 2035.
```
**Source tactic:** Frameworks 1, 2, 6, 7

---

**Skill name:** Market Intersection Decoder  
**When to invoke:** Agent receives a pitch, idea description, or market claim to evaluate  
**Inputs:** `pitch_text` or `market_description`  
**Output:** Detected framing type (intersection/union/honest), corrected market definition, true competitive structure, and one clarifying question to expose the distortion  
**Prompt template:**
```
Thiel's rule: non-monopolists claim intersection (tiny niche they alone occupy).
Monopolists claim union (vast adjacent space to dilute dominance).
Read this pitch: {pitch_text}
Step 1 — Identify which distortion is present and why the founder has incentive to frame it this way.
Step 2 — Reconstruct the honest market definition: who are the real competitors?
Step 3 — Output the corrected TAM and a single diagnostic question that forces the founder to defend the true structure.
Never accept the framing at face value.
```
**Source tactic:** Framework 3, Tactical Scripts ("British restaurant in Palo Alto")

---

**Skill name:** Concentric Expansion Planner  
**When to invoke:** Agent is building a go-to-market plan or a new project is entering market definition phase  
**Inputs:** `product_description`, `current_audience`, `core_capability`  
**Output:** Identified micro-market (Day 1 target, must feel "embarrassingly small"), three concentric expansion rings in sequence with unlock conditions for each ring  
**Prompt template:**
```
Apply Thiel's market-entry doctrine: dominate a micro-market first, expand concentrically.
Given: {product_description}, audience: {current_audience}, core capability: {core_capability}
Step 1 — Define the Day 1 micro-market: specific enough that 80%+ penetration is achievable in 6 months. If it sounds big, it is wrong.
Step 2 — Map Ring 2: adjacent segment unlocked after micro-market dominance. What is the unlock condition?
Step 3 — Map Ring 3: the broader category, with the condition that makes Ring 2 → Ring 3 credible.
Reference benchmarks: PayPal (20k eBay sellers → payments), Facebook (Harvard → campus-by-campus).
```
**Source tactic:** Framework 4, Tactical Scripts ("small market" defense)

---

**Skill name:** Durability DCF Stress Test  
**When to invoke:** Agent is evaluating whether a project, partnership, or business opportunity is worth a long-term investment of resources  
**Inputs:** `business_description`, `current_growth_signals`, `competitive_dynamics`  
**Output:** Qualitative DCF verdict — where value actually sits (now vs. 10+ years out), the single "why still dominant in 2035?" answer, and a ranked list of durability threats  
**Prompt template:**
```
Apply Thiel's DCF logic: at 30% discount rate, 75–85% of tech company value sits in cash flows 10+ years out.
Growth rate is measurable. Durability is qualitative but dominant.
Given {business_description}, with signals: {current_growth_signals}:
Step 1 — Estimate what fraction of value is locked in current metrics vs. future defensibility.
Step 2 — Answer directly: why is this still the leading player in 2035? One specific structural reason.
Step 3 — Rank the top 3 durability threats that could break that answer.
If you cannot answer Step 2 with specificity, output: "Durability case is unproven — do not commit long-horizon resources."
```
**Source tactic:** Frameworks 5, 10; Tactical Scripts (DCF / last mover)

---

**Skill name:** Red Flag Pitch Auditor  
**When to invoke:** Any idea, project proposal, or partnership pitch is being evaluated before commitment  
**Inputs:** `pitch_text`  
**Output:** Each of Thiel's 10 red flags checked (triggered / not triggered), severity rating per flag, and a one-sentence corrective for each triggered flag  
**Prompt template:**
```
Run this pitch through Thiel's 10 anti-patterns:
1. Large market on slide 1 (minnow-in-ocean trap)
2. Buzzword intersection niche without real uniqueness
3. Copying a proven model (late to a closed door)
4. Competition density treated as validation (mimetic contagion)
5. Growth rate overweighted, durability ignored
6. Single-breakthrough tech with no plan to stay ahead
7. Lean/iterative founding philosophy for core thesis
8. Social validation mistaken for low risk
9. Monopoly power hidden inside narrow market definition
10. Value creation without capture structure (Y≈0% trap)
For each: TRIGGERED or CLEAR, severity (low/medium/fatal), and a one-sentence correction.
Pitch: {pitch_text}
```
**Source tactic:** Red Flags section (all 10), Decision Rules

---

**Skill name:** Vertical Integration Audit  
**When to invoke:** Agent is analyzing a business model or evaluating where margin is being lost to intermediaries  
**Inputs:** `business_description`, `current_vendor_and_partner_list`, `revenue_and_cost_breakdown`  
**Output:** Map of intermediaries extracting value, estimated margin leakage per layer, ranked list of integration candidates by impact-vs-complexity, and one recommended first move  
**Prompt template:**
```
Apply Thiel's vertical integration doctrine: look for value being siphoned by intermediaries.
SpaceX pulled in rent-extracting subcontractors. Tesla cut margin-capturing dealers.
Given: {business_description}, partners: {current_vendor_and_partner_list}
Step 1 — Map every intermediary layer between product creation and customer value capture.
Step 2 — For each layer, estimate what fraction of margin or control they extract.
Step 3 — Rank integration candidates: which internalization move delivers the highest permanent margin or moat improvement at lowest complexity?
Step 4 — Output one concrete first move with rationale.
Integration itself can be the moat — no single technical breakthrough required.
```
**Source tactic:** Framework 8, Tactical Scripts (vertical integration)

---

## B. NEW ROUTINES

---

**Routine name:** Weekly Monopoly Re-Score  
**Cadence:** Every Monday 8am  
**Skill invoked:** Monopoly Score  
**Why:** Projects drift — features get cut, network effects stall, competitors narrow the 10x gap. A weekly re-score forces honest accounting of whether the moat is compounding or eroding. No existing routine checks for monopoly characteristic degradation over time.

---

**Routine name:** Mimetic Density Monitor  
**Cadence:** Every Friday 9am  
**Skill invoked:** Competitive Intel (existing) → output piped into a Thiel-framed summary  
**Why:** Crowd density is a contrarian signal, not a validation signal. A weekly scan of new entrants and funding announcements in active project categories flags when a space is getting crowded — surfacing the "is this mimetic contagion?" question before resources are committed to a closing window.

---

## C. NEW PLAYBOOKS

---

**Playbook name:** Idea → Last Mover Validation Gate  
**Trigger:** New idea added to IdeaBrowser with score ≥ threshold, or user flags idea for deep evaluation  
**Steps:**
1. **Red Flag Pitch Auditor** — screen for fatal anti-patterns; if ≥2 fatal flags, route to DROP with rationale
2. **Market Intersection Decoder** — reconstruct true market structure; if honest TAM > $50B with no identified micro-wedge, require micro-market reframe before continuing
3. **Monopoly Score** — score on all four dimensions + X/Y split; if total ≤ 2/10 avg, route to DROP
4. **Concentric Expansion Planner** — only if score ≥ 3/10 avg; output Day 1 micro-market + 3 expansion rings
5. **Durability DCF Stress Test** — confirm the 2035 dominance case is articulable; if not, flag as "structurally incomplete"
6. **Handoff to Marty Cagan agent** — package the validated idea as a product brief with moat score, micro-market, expansion roadmap, and durability thesis
7. **Outbound Sequence** (optional) — if micro-market validation requires customer signal, generate 10-person outreach sequence targeting exact micro-market profile

**Success metric:** Idea exits the gate with a named micro-market, ≥2 monopoly characteristics scored ≥6/10, and an articulable 2035 dominance answer — or it is killed with a documented reason.

---

**Playbook name:** Vertical Integration Discovery Sprint  
**Trigger:** Project revenue or margin below target for 2+ consecutive weeks, or user initiates margin audit  
**Steps:**
1. **Vertical Integration Audit** — map all intermediary extraction in the current business model
2. **Competitive Intel** (existing skill) — identify whether competitors have already internalized the same layers
3. **Monopoly Score** — re-score the business assuming top integration candidate is executed; compare before/after moat score
4. **Market Research** (existing skill) — validate demand-side impact: does integration improve customer pricing or quality enough to matter?
5. If integration candidate clears all gates: **Ops Dashboard** (existing skill) — model the operational cost of internalization
6. **Handoff to Chris Voss agent** — if integration requires a vendor negotiation or contract restructure, route with context

**Success metric:** Output is a go/no-go memo on the top integration candidate with moat delta, margin recovery estimate, and an operational complexity rating.

---

## D. DROP THESE

- **"Lean startup is bad" tactic** — generic philosophical advice, no discrete trigger or output; cannot be operationalized as a skill
- **"Define which risk you're accepting" (Risk Inversion)** — useful mental model for a human, not a composable agent workflow
- **"Scientists don't capture value" (Science as Y=0%)** — this is a warning, not a workflow; the capture-structure concern is already handled by the Red Flag Pitch Auditor (flag #10) and the X/Y component of Monopoly Score
- **Monopolist defensive framing script** ("We operate in a vast global technology market...") — tactical script for regulatory communications, not a Five Rails primitive; no appropriate output table to write to
- **"Don't copy proven models" advice** — pure heuristic absorbed into Red Flag Pitch Auditor (flag #3); redundant as a standalone skill
- **Cadence/voice pattern tactics** — these are Thiel's rhetorical style for human output, not agent-executable workflows
- **General market sizing critique** — subsumed by Market Intersection Decoder and Red Flag Pitch Auditor; no additional primitive needed

---

## E. ONE-LINE RANKING

```
1.  Skill: Red Flag Pitch Auditor — catches fatal structure errors at intake, prevents wasted cycles; 30 min build
2.  Skill: Monopoly Score — fills the moat-scoring void (nothing like it in existing 14 skills); 45 min build
3.  Playbook: Idea → Last Mover Validation Gate — chains existing + new skills into a full kill-or-ship decision; 60 min build
4.  Skill: Market Intersection Decoder — surfaces narrative distortion in pitches/ideas before resources commit; 30 min build
5.  Routine: Weekly Monopoly Re-Score — prevents moat-drift blind spots; 20 min build on top of Monopoly Score skill
6.  Skill: Durability DCF Stress Test — unique long-horizon thinking no existing skill covers; 45 min build
7.  Skill: Concentric Expansion Planner — sharpens go-to-market at project start, reusable for every new initiative; 40 min build
8.  Routine: Mimetic Density Monitor — competitive crowding early warning, low overhead (wraps existing Competitive Intel); 20 min build
9.  Skill: Vertical Integration Audit — highest upside for mature projects leaking margin, more narrow trigger; 60 min build
10. Playbook: Vertical Integration Discovery Sprint — high-value but narrower trigger set, chains 5 existing + 1 new skill; 90 min build
```