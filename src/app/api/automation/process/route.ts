import { NextRequest, NextResponse } from "next/server";
import {
  getDb, getAutomationSetting, setAutomationSetting, createAutomationRun, completeAutomationRun,
  getLatestAutomationRun, logActivity,
} from "@/lib/db";
import { createValidationCampaignAssets } from "@/lib/validation/create-test-assets";
import { evaluateGate2 } from "@/lib/validation/gate2";
import { triggerBuild } from "@/lib/validation/trigger-build";

export async function POST(request: NextRequest) {
  try {
    // Concurrency guard: don't run if another run is active
    const latest = getLatestAutomationRun();
    if (latest && latest.status === "running") {
      const startedAt = new Date(latest.started_at).getTime();
      if (Date.now() - startedAt < 5 * 60 * 1000) {
        return NextResponse.json({ skipped: true, reason: "Already running", run_id: latest.id });
      }
    }

    const runId = createAutomationRun("heartbeat");
    const baseUrl = request.nextUrl.origin;
    const results: Record<string, unknown> = {};

    // 1. Process scheduled posts
    if (getAutomationSetting("auto_publish_scheduled") === "true") {
      try {
        const res = await fetch(`${baseUrl}/api/social-schedule/process`, { method: "POST" });
        if (res.ok) {
          const data = await res.json();
          results.scheduled_posts = { processed: data.processed || 0, posted: data.posted || 0 };
        }
      } catch { results.scheduled_posts = { error: "failed" }; }
    }

    // 2. Process email sequences
    try {
      const now = new Date().toISOString();
      const dueContacts = getDb().prepare(`
        SELECT oc.id, oc.email, oc.name, oc.sequence_id, oc.sequence_step, es.steps
        FROM outbound_contacts oc
        JOIN email_sequences es ON oc.sequence_id = es.id
        WHERE oc.next_sequence_step_at IS NOT NULL
          AND oc.next_sequence_step_at <= ?
          AND es.status = 'active'
        LIMIT 20
      `).all(now) as Array<{ id: string; email: string; name: string; sequence_id: string; sequence_step: number; steps: string }>;

      let emailsSent = 0;
      for (const contact of dueContacts) {
        try {
          const steps = JSON.parse(contact.steps || "[]");
          const currentStep = steps[contact.sequence_step || 0];
          if (!currentStep || currentStep.type !== "email") {
            // Skip non-email steps, advance to next
            const nextStep = (contact.sequence_step || 0) + 1;
            if (nextStep < steps.length) {
              const delayDays = steps[nextStep]?.delay_days || 1;
              const nextAt = new Date();
              nextAt.setDate(nextAt.getDate() + delayDays);
              getDb().prepare("UPDATE outbound_contacts SET sequence_step = ?, next_sequence_step_at = ? WHERE id = ?")
                .run(nextStep, nextAt.toISOString(), contact.id);
            } else {
              // Sequence complete
              getDb().prepare("UPDATE outbound_contacts SET sequence_id = NULL, next_sequence_step_at = NULL WHERE id = ?").run(contact.id);
            }
            continue;
          }

          // Send the email via outbound send
          const sendRes = await fetch(`${baseUrl}/api/outbound/${contact.id}/send`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ subject: currentStep.subject, body: currentStep.body }),
          });

          if (sendRes.ok) {
            emailsSent++;
            // Advance to next step
            const nextStep = (contact.sequence_step || 0) + 1;
            if (nextStep < steps.length) {
              const delayDays = steps[nextStep]?.delay_days || 2;
              const nextAt = new Date();
              nextAt.setDate(nextAt.getDate() + delayDays);
              getDb().prepare("UPDATE outbound_contacts SET sequence_step = ?, next_sequence_step_at = ? WHERE id = ?")
                .run(nextStep, nextAt.toISOString(), contact.id);
            } else {
              getDb().prepare("UPDATE outbound_contacts SET sequence_id = NULL, next_sequence_step_at = NULL WHERE id = ?").run(contact.id);
            }
          }
        } catch { /* skip individual failures */ }
      }
      results.email_sequences = { processed: dueContacts.length, sent: emailsSent };
    } catch { results.email_sequences = { error: "failed" }; }

    // 3. Process payment retries
    if (getAutomationSetting("auto_retry_payments") === "true") {
      try {
        const now = new Date().toISOString();
        const dueRetries = getDb().prepare(`
          SELECT pa.*, s.customer_email FROM payment_attempts pa
          JOIN subscriptions s ON pa.subscription_id = s.id
          WHERE pa.status = 'failed' AND pa.next_retry_at IS NOT NULL AND pa.next_retry_at <= ? AND pa.retry_count < 4
          LIMIT 10
        `).all(now) as Array<{ id: string; subscription_id: string; retry_count: number }>;

        let retried = 0;
        for (const attempt of dueRetries) {
          // Schedule next retry
          const nextDays = [1, 3, 7, 14][Math.min(attempt.retry_count, 3)] || 14;
          const nextRetry = new Date();
          nextRetry.setDate(nextRetry.getDate() + nextDays);
          getDb().prepare("UPDATE payment_attempts SET retry_count = retry_count + 1, next_retry_at = ? WHERE id = ?")
            .run(nextRetry.toISOString(), attempt.id);
          retried++;
        }
        results.payment_retries = { processed: dueRetries.length, retried };
      } catch { results.payment_retries = { error: "failed" }; }
    }

    // 4. Create follow-up tasks for recent deal stage changes
    if (getAutomationSetting("auto_create_followup_tasks") === "true") {
      try {
        const recentDeals = getDb().prepare(`
          SELECT d.*, da.description as last_activity
          FROM deals d
          JOIN deal_activities da ON da.deal_id = d.id AND da.type = 'stage_change'
          WHERE d.stage IN ('contacted', 'qualified', 'proposal', 'negotiation', 'won')
            AND da.created_at >= datetime('now', '-1 day')
          GROUP BY d.id
        `).all() as Array<{ id: string; title: string; stage: string; project_id: string | null }>;

        let tasksCreated = 0;
        const taskTemplates: Record<string, string> = {
          contacted: "Qualify lead and assess fit",
          qualified: "Prepare and send proposal",
          proposal: "Schedule negotiation call",
          negotiation: "Follow up and close deal",
          won: "Send onboarding welcome package",
        };

        for (const deal of recentDeals) {
          const template = taskTemplates[deal.stage];
          if (!template || !deal.project_id) continue;

          // Check if task already exists
          const existing = getDb().prepare(
            "SELECT id FROM tasks WHERE project_id = ? AND title LIKE ? AND status != 'completed'"
          ).get(deal.project_id, `%${deal.title}%`);
          if (existing) continue;

          const { v4: uuid } = await import("uuid");
          getDb().prepare(
            "INSERT INTO tasks (id, project_id, title, description, status, priority, rail) VALUES (?, ?, ?, ?, 'pending', 2, 'outbound')"
          ).run(uuid(), deal.project_id, `${template} — ${deal.title}`, `Auto-created from deal stage: ${deal.stage}`);
          tasksCreated++;
        }
        results.deal_tasks = { checked: recentDeals.length, created: tasksCreated };
      } catch { results.deal_tasks = { error: "failed" }; }
    }

    // 5. Process scheduled skills
    try {
      const now = new Date().toISOString();
      const dueSkills = getDb().prepare(`
        SELECT ss.*, s.name as skill_name FROM skill_schedules ss
        JOIN skills s ON ss.skill_id = s.id
        WHERE ss.is_active = 1 AND ss.next_run_at IS NOT NULL AND ss.next_run_at <= ?
        LIMIT 5
      `).all(now) as Array<{ id: string; skill_id: string; skill_name: string; project_id: string | null; input: string | null; cron_expression: string }>;

      let skillsRun = 0;
      for (const sched of dueSkills) {
        try {
          const res = await fetch(`${baseUrl}/api/skills/${sched.skill_id}/execute`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              input: sched.input || `Run scheduled task: ${sched.skill_name}`,
              project_id: sched.project_id,
            }),
          });

          const result = res.ok ? await res.json() : { error: "failed" };

          // Calculate next run from cron expression
          const parts = sched.cron_expression.split(" ");
          const hour = parseInt(parts[1]) || 9;
          const next = new Date();
          next.setDate(next.getDate() + 1);
          next.setHours(hour, parseInt(parts[0]) || 0, 0, 0);
          if (parts[4] !== "*") {
            const targetDay = parseInt(parts[4]);
            while (next.getDay() !== targetDay) next.setDate(next.getDate() + 1);
          }

          getDb().prepare("UPDATE skill_schedules SET last_run_at = datetime('now'), last_result = ?, next_run_at = ? WHERE id = ?")
            .run(JSON.stringify(result).slice(0, 1000), next.toISOString(), sched.id);
          skillsRun++;
        } catch { /* skip */ }
      }
      results.skill_schedules = { due: dueSkills.length, run: skillsRun };
    } catch { results.skill_schedules = { error: "failed" }; }

    // 6a. Auto-launch validation ad campaigns to Meta (PAUSED — user must
    // manually activate to start spend). Uses the existing /api/ads/{id}/launch
    // route which calls the Facebook Graph API. If no FB connection exists,
    // the route returns 503 and we leave the ad as draft + file a capability
    // gap so the watchdog surfaces it.
    try {
      const { reportCapabilityGap } = await import("@/lib/agents/supervisor");
      const draftAds = getDb().prepare(
        "SELECT id, platform FROM ad_campaigns WHERE status = 'draft' AND validation_campaign_id IS NOT NULL LIMIT 10"
      ).all() as Array<{ id: string; platform: string }>;

      let adsLaunched = 0;
      const missingAdPlatforms = new Set<string>();
      for (const ad of draftAds) {
        try {
          const res = await fetch(`${baseUrl}/api/ads/${ad.id}/launch`, { method: "POST" });
          const data = await res.json().catch(() => ({}));
          if (res.ok && (data.action === "launched" || data.action === "ready_to_launch")) {
            adsLaunched++;
          } else if (res.status === 503 || /no .* connect|sign in/i.test(data.error || "")) {
            missingAdPlatforms.add(ad.platform);
          }
        } catch { /* skip */ }
      }
      for (const platform of missingAdPlatforms) {
        try {
          await reportCapabilityGap({
            agent_id: "agent-marketing",
            task_description: `Launching validation ad campaigns on ${platform}`,
            missing_capability: `${platform} platform connection with ads_management scope`,
            proposed_fix: `User must go to /connections and connect ${platform} Business + grant ads_management permission so validation campaigns can drive real traffic to landing pages.`,
          });
        } catch { /* best-effort */ }
      }
      results.ad_launches = { drafts: draftAds.length, launched: adsLaunched, missing_connection: Array.from(missingAdPlatforms) };
    } catch { results.ad_launches = { error: "failed" }; }

    // 6. Create test assets for pending validation campaigns (or recover stuck ones)
    try {
      // Reset campaigns stuck in 'running' with no assets (partial failure recovery)
      getDb().prepare(`
        UPDATE validation_campaigns SET status = 'pending', test_started_at = NULL
        WHERE status = 'running' AND landing_page_id IS NULL
        AND created_at < datetime('now', '-5 minutes')
      `).run();

      const pendingCampaigns = getDb().prepare(
        "SELECT id, idea_id FROM validation_campaigns WHERE status = 'pending'"
      ).all() as Array<{ id: string; idea_id: string }>;

      let assetsCreated = 0;
      for (const campaign of pendingCampaigns) {
        try {
          await createValidationCampaignAssets(campaign.id, campaign.idea_id);
          assetsCreated++;
        } catch (e) {
          console.error(`Asset creation failed for campaign ${campaign.id}:`, e);
        }
      }
      results.validation_assets = { pending: pendingCampaigns.length, created: assetsCreated };
    } catch { results.validation_assets = { error: "failed" }; }

    // 7. Evaluate expired validation campaigns (Gate 2)
    try {
      const expiredCampaigns = getDb().prepare(`
        SELECT id FROM validation_campaigns
        WHERE status = 'running'
        AND test_started_at IS NOT NULL
        AND datetime(test_started_at, '+' || test_duration_hours || ' hours') <= datetime('now')
      `).all() as Array<{ id: string }>;

      let gate2Evaluated = 0;
      for (const campaign of expiredCampaigns) {
        try {
          evaluateGate2(campaign.id);
          gate2Evaluated++;
        } catch (e) {
          console.error(`Gate 2 evaluation failed for campaign ${campaign.id}:`, e);
        }
      }
      results.gate2_evaluation = { expired: expiredCampaigns.length, evaluated: gate2Evaluated };
    } catch { results.gate2_evaluation = { error: "failed" }; }

    // 8. Trigger builds for passed validation campaigns
    try {
      const passedCampaigns = getDb().prepare(
        "SELECT id, idea_id FROM validation_campaigns WHERE status = 'passed' AND build_status = 'not_started'"
      ).all() as Array<{ id: string; idea_id: string }>;

      let buildsTriggered = 0;
      for (const campaign of passedCampaigns) {
        try {
          await triggerBuild(campaign.id, campaign.idea_id);
          buildsTriggered++;
        } catch (e) {
          console.error(`Build trigger failed for campaign ${campaign.id}:`, e);
        }
      }
      results.build_triggers = { passed: passedCampaigns.length, triggered: buildsTriggered };
    } catch { results.build_triggers = { error: "failed" }; }

    // 9. Run due department agents — capped at 2 per heartbeat and spaced out
    // so one heartbeat doesn't saturate the dev server. Each agent run cascades
    // into 2-4 chat delegations + skill executions, and the server is single-
    // threaded for Turbopack compilation. 2 agents × ~30-120s each is already
    // plenty of work per 15-min tick.
    try {
      const now = new Date().toISOString();
      const dueAgents = getDb().prepare(
        "SELECT id, name FROM agents WHERE is_active = 1 AND (next_run_at IS NULL OR next_run_at <= ?) ORDER BY last_run_at ASC NULLS FIRST LIMIT 2"
      ).all(now) as Array<{ id: string; name: string }>;

      let agentsRun = 0;
      for (let i = 0; i < dueAgents.length; i++) {
        const agent = dueAgents[i];
        try {
          await fetch(`${baseUrl}/api/agents/${agent.id}/run`, { method: "POST" });
          agentsRun++;
          // Breathe between agents so cascading delegations can drain
          if (i < dueAgents.length - 1) await new Promise(r => setTimeout(r, 2000));
        } catch { /* skip */ }
      }
      results.agents = { due: dueAgents.length, run: agentsRun };
    } catch { results.agents = { error: "failed" }; }

    // 10. Daily IdeaBrowser sync — pull latest idea and assign to Research agent
    try {
      const lastSync = getAutomationSetting("last_ideabrowser_sync_date");
      const todayStr = new Date().toISOString().slice(0, 10);
      if (lastSync !== todayStr) {
        const syncRes = await fetch(`${baseUrl}/api/automation/sync-ideabrowser`, { method: "POST" });
        if (syncRes.ok) {
          const syncData = await syncRes.json();
          results.ideabrowser_sync = syncData.imported ? { imported: syncData.title, assigned: syncData.assigned_to } : { skipped: syncData.message };
          setAutomationSetting("last_ideabrowser_sync_date", todayStr);
        }
      } else {
        results.ideabrowser_sync = { skipped: "already synced today" };
      }
    } catch { results.ideabrowser_sync = { error: "failed" }; }

    // 11. Weekly competitor monitoring — scan competitor websites for changes
    try {
      const lastMonitor = getAutomationSetting("last_competitor_monitor_date");
      const todayStr = new Date().toISOString().slice(0, 10);
      const dayOfWeek = new Date().getDay();
      // Run on Mondays or if never run
      if (!lastMonitor || (dayOfWeek === 1 && lastMonitor !== todayStr)) {
        const monitorRes = await fetch(`${baseUrl}/api/competitors/monitor`, { method: "POST" });
        if (monitorRes.ok) {
          const monitorData = await monitorRes.json();
          results.competitor_monitor = monitorData;
          setAutomationSetting("last_competitor_monitor_date", todayStr);
        }
      } else {
        results.competitor_monitor = { skipped: "not due (runs Mondays)" };
      }
    } catch { results.competitor_monitor = { error: "failed" }; }

    // 12. Telegram polling — check for and reply to incoming messages
    try {
      const tgEnabled = getAutomationSetting("telegram_polling");
      if (tgEnabled === "true") {
        const pollRes = await fetch(`${baseUrl}/api/agents/telegram/poll`, { method: "POST" });
        if (pollRes.ok) {
          const pollData = await pollRes.json();
          results.telegram_poll = { polled: pollData.polled, processed: pollData.processed };
        }
      } else {
        results.telegram_poll = { skipped: "polling disabled" };
      }
    } catch { results.telegram_poll = { error: "failed" }; }

    // 13. Watchdog scan — monitor system health and auto-fix issues
    try {
      const watchdogRes = await fetch(`${baseUrl}/api/agents/watchdog/scan?type=scheduled`, { method: "POST" });
      if (watchdogRes.ok) {
        const watchdogData = await watchdogRes.json();
        results.watchdog_scan = {
          issues: watchdogData.scan_log?.issues_found || 0,
          auto_fixed: watchdogData.scan_log?.issues_auto_fixed || 0,
        };
      }
    } catch { results.watchdog_scan = { error: "failed" }; }

    // 14. Form-service poller — pulls validation signups from the public
    // landing pages on Vercel into the local DB. No-op when not configured.
    try {
      const { isFormServiceConfigured } = await import("@/lib/form-service");
      if (isFormServiceConfigured()) {
        const { pollFormServiceOnce } = await import("@/lib/form-service-poller");
        const pollResult = await pollFormServiceOnce();
        results.form_service_poll = pollResult;
      } else {
        results.form_service_poll = { skipped: "form service not configured" };
      }
    } catch (err) {
      results.form_service_poll = { error: err instanceof Error ? err.message.slice(0, 200) : "failed" };
    }

    // ─── YouTube-distilled routines + playbook triggers ─────────────────────
    // Capped per-heartbeat so a single tick can't saturate the LLM. Each
    // playbook is idempotent via `playbook_runs` row keyed on
    // (playbook_name, entity_id) — re-firing on the same entity is a no-op.

    // 15. Inbound Lead Speed Check — Hormozi #2. New outbound_contacts (created
    // > 5 min ago, status='lead') with no agent activity → flag as urgent.
    try {
      const stale = getDb().prepare(
        `SELECT id, name, email, project_id, created_at FROM outbound_contacts
         WHERE status = 'lead'
           AND created_at < datetime('now','-5 minutes')
           AND created_at > datetime('now','-2 hours')
           AND id NOT IN (
             SELECT trigger_entity_id FROM playbook_runs
             WHERE playbook_name = 'inbound-lead-speed-flag' AND trigger_entity_id IS NOT NULL
           )
         LIMIT 5`,
      ).all() as Array<{ id: string; name: string; email: string | null; project_id: string | null; created_at: string }>;
      let flagged = 0;
      for (const lead of stale) {
        const { startRun, createHandoff, completeRun, logPlaybookActivity } = await import("@/lib/playbooks/runner");
        const { run_id, alreadyRan } = startRun({
          playbookName: "inbound-lead-speed-flag",
          triggerEntityType: "outbound_contact", triggerEntityId: lead.id,
        });
        if (alreadyRan) continue;
        createHandoff({
          fromAgentId: "agent-product", toAgentId: "agent-sales",
          message: `[Inbound Lead Speed] Lead "${lead.name}" (${lead.email || lead.id}) was created ${lead.created_at} and has not been contacted. Voss tactic: contact within 60 seconds or close rate drops 80% by minute 5. Open the deal NOW.`,
          messageType: "alert", deadlineMinutes: 5,
        });
        logPlaybookActivity("inbound-lead-speed-flag", `Stale inbound lead: ${lead.name}`, lead.project_id);
        completeRun(run_id, { status: "completed", result: "Flagged to agent-sales for sub-60s response." });
        flagged++;
      }
      results.lead_speed_check = { stale: stale.length, flagged };
    } catch (err) {
      results.lead_speed_check = { error: err instanceof Error ? err.message.slice(0, 200) : "failed" };
    }

    // 16. Churn Watchdog — Hormozi #1. Daily check (gated by date). If
    // outbound_contacts.status='replied' converting < 20% in 30 days OR if
    // subscriptions show >20% churn this month → halt acquisition campaigns
    // via agent-marketing handoff.
    try {
      const today = new Date().toISOString().slice(0, 10);
      const lastChurn = getAutomationSetting("last_churn_watchdog_date");
      if (lastChurn !== today) {
        const churnRate = getDb().prepare(
          `SELECT
             (SELECT COUNT(*) FROM outbound_contacts WHERE status IN ('converted') AND created_at > datetime('now','-30 days')) as converted,
             (SELECT COUNT(*) FROM outbound_contacts WHERE created_at > datetime('now','-30 days')) as total`,
        ).get() as { converted: number; total: number };
        const rate = churnRate.total > 0 ? (churnRate.converted / churnRate.total) : 1;
        if (rate < 0.05 && churnRate.total >= 20) {
          // Worse than expected — halt new acquisition pushes
          const { createHandoff, logPlaybookActivity } = await import("@/lib/playbooks/runner");
          createHandoff({
            fromAgentId: "agent-product", toAgentId: "agent-marketing",
            message: `[Churn Watchdog] Conversion rate is ${(rate * 100).toFixed(1)}% across last 30 days (${churnRate.converted}/${churnRate.total}). Hormozi tactic: stop pouring marketing gasoline onto a bad fire. Pause active acquisition campaigns until close rate is diagnosed (run skill-business-constraint-diagnostic).`,
            messageType: "alert", deadlineMinutes: 60,
          });
          logPlaybookActivity("churn-watchdog", `Low conversion rate (${(rate * 100).toFixed(1)}%) — alerted Hormozi.`);
          results.churn_watchdog = { triggered: true, rate, total: churnRate.total };
        } else {
          results.churn_watchdog = { triggered: false, rate, total: churnRate.total };
        }
        setAutomationSetting("last_churn_watchdog_date", today);
      } else {
        results.churn_watchdog = { skipped: "ran today" };
      }
    } catch (err) {
      results.churn_watchdog = { error: err instanceof Error ? err.message.slice(0, 200) : "failed" };
    }

    // 17. Daily Deal Risk Scan — Voss #17. Daily check. For each active deal,
    // queue Stuck Deal Revival if no activity 7+ days. Cap 5 per tick so we
    // don't overload the LLM.
    try {
      const today = new Date().toISOString().slice(0, 10);
      const lastScan = getAutomationSetting("last_deal_risk_scan_date");
      if (lastScan !== today) {
        const { findStuckDeals } = await import("@/lib/playbooks/runner");
        const { runStuckDealRevival } = await import("@/lib/playbooks/stuck-deal-revival");
        const stuck = findStuckDeals(5);
        let fired = 0;
        for (const d of stuck) {
          const r = await runStuckDealRevival({ baseUrl, dealId: d.entityId });
          if (r.ok) fired++;
        }
        setAutomationSetting("last_deal_risk_scan_date", today);
        results.deal_risk_scan = { stuck_count: stuck.length, fired };
      } else {
        results.deal_risk_scan = { skipped: "ran today" };
      }
    } catch (err) {
      results.deal_risk_scan = { error: err instanceof Error ? err.message.slice(0, 200) : "failed" };
    }

    // 18. Post-Failure Reflection — Dalio #12. Every tick: find activity_log
    // failures from last hour that don't yet have a post-mortem and fire the
    // reflection playbook on them. Cap 3 per tick.
    try {
      const { findRecentFailures } = await import("@/lib/playbooks/runner");
      const { runPostFailureReflection } = await import("@/lib/playbooks/post-failure-reflection");
      const failures = findRecentFailures(3);
      let processed = 0;
      for (const f of failures) {
        const r = await runPostFailureReflection({ baseUrl, activityId: f.entityId });
        if (r.ok) processed++;
      }
      results.post_failure_reflection = { found: failures.length, processed };
    } catch (err) {
      results.post_failure_reflection = { error: err instanceof Error ? err.message.slice(0, 200) : "failed" };
    }

    // 19. Idea Validation Gate — Thiel #20. Ideas scoring ≥60 that haven't
    // been through the gate yet. Cap 2 per tick (each step is an LLM call).
    try {
      const { findIdeasReadyForValidation } = await import("@/lib/playbooks/runner");
      const { runIdeaValidationGate } = await import("@/lib/playbooks/idea-validation-gate");
      const ideas = findIdeasReadyForValidation(2);
      let processed = 0;
      for (const i of ideas) {
        const r = await runIdeaValidationGate({ baseUrl, ideaId: i.entityId });
        if (r.ok) processed++;
      }
      results.idea_validation_gate = { found: ideas.length, processed };
    } catch (err) {
      results.idea_validation_gate = { error: err instanceof Error ? err.message.slice(0, 200) : "failed" };
    }

    // 20. Build-to-Learn Cycle + New Offer Launch — Cagan #13 + Hormozi #11.
    // New projects (last 30 days, status=idea|active) → run Build-to-Learn
    // first, then New Offer Launch (only if BtoL didn't kill it). Cap 1
    // project per tick.
    try {
      const { findNewProjects } = await import("@/lib/playbooks/runner");
      const { runBuildToLearnCycle } = await import("@/lib/playbooks/build-to-learn-cycle");
      const { runNewOfferLaunch } = await import("@/lib/playbooks/new-offer-launch");
      const projects = findNewProjects(1);
      let processed = 0;
      for (const p of projects) {
        const btl = await runBuildToLearnCycle({ baseUrl, projectId: p.entityId });
        if (btl.ok && btl.verdict !== "kill" && btl.verdict !== "already_ran") {
          await runNewOfferLaunch({ baseUrl, projectId: p.entityId });
        }
        processed++;
      }
      results.project_playbooks = { processed };
    } catch (err) {
      results.project_playbooks = { error: err instanceof Error ? err.message.slice(0, 200) : "failed" };
    }

    // ─── Command Center: agent_state writeback ────────────────────────────────
    // Derive a high-level operator-view state per agent (idle/working/blocked/
    // error) from the most recent run + active tasks + recent failures. This
    // powers the dashboard fleet grid + /api/command/overview without forcing
    // every code path to write the state explicitly.
    try {
      const { getDb } = await import("@/lib/db");
      const db = getDb();
      const update = db.prepare(
        `UPDATE agents SET agent_state = ?, current_task_id = ? WHERE id = ?`
      );
      const agentsRows = db.prepare(
        `SELECT id FROM agents WHERE is_active = 1`
      ).all() as Array<{ id: string }>;
      let updated = 0;
      for (const { id } of agentsRows) {
        const workingTask = db.prepare(
          `SELECT id FROM agent_tasks WHERE agent_id = ? AND status = 'working' ORDER BY started_at DESC LIMIT 1`
        ).get(id) as { id: string } | undefined;
        const blockedTask = db.prepare(
          `SELECT id FROM agent_tasks WHERE agent_id = ? AND status = 'blocked' LIMIT 1`
        ).get(id) as { id: string } | undefined;
        const lastRun = db.prepare(
          `SELECT status, started_at FROM agent_runs WHERE agent_id = ? ORDER BY started_at DESC LIMIT 1`
        ).get(id) as { status: string; started_at: string } | undefined;

        let nextState: "idle" | "working" | "blocked" | "error" = "idle";
        let currentTaskId: string | null = null;
        if (workingTask) {
          nextState = "working";
          currentTaskId = workingTask.id;
        } else if (blockedTask) {
          nextState = "blocked";
          currentTaskId = blockedTask.id;
        } else if (lastRun && (lastRun.status === "failed" || lastRun.status === "timeout")) {
          // Only flag as error if the failure is recent (<2 hours). Older
          // failures shouldn't keep an idle agent in an error state forever.
          const ageMs = Date.now() - new Date(lastRun.started_at.replace(" ", "T") + "Z").getTime();
          if (Number.isFinite(ageMs) && ageMs < 2 * 60 * 60 * 1000) nextState = "error";
        }
        update.run(nextState, currentTaskId, id);
        updated++;
      }
      results.agent_state_writeback = { updated };
    } catch (err) {
      results.agent_state_writeback = { error: err instanceof Error ? err.message.slice(0, 200) : "failed" };
    }

    completeAutomationRun(runId, results);

    logActivity({
      action: "automation_run",
      details: `Automation heartbeat: ${JSON.stringify(results)}`,
    });

    return NextResponse.json({
      run_id: runId,
      results,
      next_run_in_minutes: parseInt(getAutomationSetting("automation_interval_minutes") || "15"),
    });
  } catch (error) {
    console.error("POST /api/automation/process error:", error);
    return NextResponse.json({ error: "Automation processing failed" }, { status: 500 });
  }
}
