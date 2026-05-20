// ─── Gate 1: Thiel's Idea Validation → Campaign Creation ─────────────────────
// When Peter Thiel analyzes an idea and scores it >= GATE1_THRESHOLD with a
// "test" recommendation, this creates a validation_campaign and queues it
// for test asset creation by the automation heartbeat.

import { getDb, logActivity } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import { createHandoff } from "@/lib/agents/supervisor";

const GATE1_THRESHOLD = 7.0;

export interface Gate1Result {
  passed: boolean;
  campaignId?: string;
}

export interface ValidationVerdict {
  idea_id: string;
  gate1_score: number;
  recommendation: "test" | "reject";
  reject_reason?: string;
  key_signals?: string[];
}

/**
 * Parse Thiel's LLM response for a structured validation verdict.
 * Looks for a <validation_verdict> JSON block in the response text.
 */
export function parseValidationVerdict(responseText: string): ValidationVerdict | null {
  // Try <validation_verdict> XML block first
  const xmlMatch = responseText.match(/<validation_verdict>\s*([\s\S]*?)\s*<\/validation_verdict>/);
  if (xmlMatch) {
    try {
      return JSON.parse(xmlMatch[1]);
    } catch { /* fall through */ }
  }

  // Try ```json block with validation_verdict content
  const jsonMatch = responseText.match(/```json?\s*\n?\s*(\{[\s\S]*?"gate1_score"[\s\S]*?\})\s*\n?\s*```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (parsed.gate1_score !== undefined && parsed.recommendation) return parsed;
    } catch { /* fall through */ }
  }

  return null;
}

/**
 * Process Gate 1 decision for an idea.
 * Creates a validation campaign if the idea passes the threshold.
 */
export function processGate1(
  ideaId: string,
  thielScore: number,
  thielRecommendation: string,
  thielDecisionId: string,
  rejectReason?: string,
): Gate1Result {
  const db = getDb();

  // Check if a campaign already exists for this idea (avoid duplicates)
  const existing = db.prepare(
    "SELECT id FROM validation_campaigns WHERE idea_id = ? AND status NOT IN ('failed')"
  ).get(ideaId) as { id: string } | undefined;
  if (existing) {
    return { passed: true, campaignId: existing.id };
  }

  const passed = thielScore >= GATE1_THRESHOLD && thielRecommendation === "test";

  if (!passed) {
    // Update idea status
    db.prepare(
      "UPDATE ideabrowser_ideas SET validation_status = 'failed', gate1_score = ? WHERE id = ?"
    ).run(thielScore, ideaId);

    logActivity({
      action: "idea_rejected",
      details: `Idea rejected at Gate 1. Score: ${thielScore}/10. Reason: ${rejectReason ?? "Below threshold"}`,
    });

    return { passed: false };
  }

  // Create validation campaign
  const campaignId = uuidv4();
  db.prepare(`
    INSERT INTO validation_campaigns
      (id, idea_id, status, thiel_score, thiel_recommendation, thiel_decision_id, gate1_passed_at)
    VALUES (?, ?, 'pending', ?, ?, ?, datetime('now'))
  `).run(campaignId, ideaId, thielScore, thielRecommendation, thielDecisionId);

  // Update idea status
  db.prepare(
    "UPDATE ideabrowser_ideas SET validation_status = 'queued', gate1_score = ? WHERE id = ?"
  ).run(thielScore, ideaId);

  logActivity({
    action: "idea_queued_for_testing",
    details: `Idea passed Gate 1 with score ${thielScore}/10. Validation campaign ${campaignId} created.`,
  });

  // Send inter-agent message to Hormozi for visibility — tracked handoff with deadline
  try {
    createHandoff({
      from_agent_id: "agent-research",
      to_agent_id: "agent-marketing",
      message: `[VALIDATION PIPELINE] New idea validated and ready for market test campaign creation. Campaign ID: ${campaignId}, Idea ID: ${ideaId}. Score: ${thielScore}/10.`,
      message_type: "request",
      deadline_minutes: 120, // marketing has 2h to respond
    });
  } catch { /* non-blocking */ }

  return { passed: true, campaignId };
}
