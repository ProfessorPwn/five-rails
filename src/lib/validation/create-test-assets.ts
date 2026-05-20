// ─── Validation Campaign Asset Creation ──────────────────────────────────────
// Creates landing page, ad copy variants, and social posts for a pending
// validation campaign. Called by the automation heartbeat for campaigns
// in 'pending' status.

import { getDb, logActivity } from "@/lib/db";
import { callLLMWithFallback } from "@/lib/ai/llm-client";
import { v4 as uuidv4 } from "uuid";

/**
 * Create all test assets for a validation campaign:
 * 1. Landing page with email capture
 * 2. 3 ad copy variants (pain, outcome, curiosity angles)
 * 3. 3 social posts (Twitter, LinkedIn, Twitter)
 */
export async function createValidationCampaignAssets(
  campaignId: string,
  ideaId: string,
): Promise<void> {
  const db = getDb();

  const idea = db.prepare("SELECT * FROM ideabrowser_ideas WHERE id = ?").get(ideaId) as {
    id: string; title: string; description: string | null;
    target_market: string | null; category: string | null;
  } | undefined;

  if (!idea) throw new Error(`Idea ${ideaId} not found`);

  // NOTE: status is updated to 'running' AFTER all assets are created (not before)
  // to prevent partial-failure leaving the campaign stuck with no assets.

  // 1. Generate landing page copy
  let lpData: { headline: string; subheadline: string; pain_point: string; transformation: string; cta_text: string };
  try {
    const { text: landingPageCopy } = await callLLMWithFallback(
      `Idea: ${idea.title}\nDescription: ${idea.description || "N/A"}\nTarget audience: ${idea.target_market || "TBD"}\n\nOutput ONLY valid JSON, no other text:\n{\n  "headline": "...",\n  "subheadline": "...",\n  "pain_point": "...",\n  "transformation": "...",\n  "cta_text": "..."\n}`,
      { systemPrompt: "You are Alex Hormozi. Apply the Value Equation to create a high-converting validation landing page for an untested startup idea. Focus on the core pain and transformation. Keep copy tight. Output JSON only." },
    );
    const cleaned = landingPageCopy.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    lpData = JSON.parse(cleaned.includes("{") ? cleaned.slice(cleaned.indexOf("{"), cleaned.lastIndexOf("}") + 1) : cleaned);
  } catch {
    // Fallback: generate simple landing page data
    lpData = {
      headline: `Stop struggling with ${idea.category || "this problem"}`,
      subheadline: idea.title,
      pain_point: idea.description || "A painful gap in the market",
      transformation: "A simpler, faster solution",
      cta_text: "Get Early Access",
    };
  }

  // Insert landing page
  const lpId = uuidv4();
  const lpHtml = `<div class="lp-validation">
<h1>${lpData.headline}</h1>
<h2>${lpData.subheadline}</h2>
<p>${lpData.pain_point}</p>
<p><strong>${lpData.transformation}</strong></p>
<button>${lpData.cta_text}</button>
</div>`;

  // Publish immediately so /p/[slug] is live. The whole point of validation is
  // to drive real traffic; a draft page can't validate anything.
  db.prepare(
    "INSERT INTO landing_pages (id, title, slug, html, status, validation_campaign_id) VALUES (?, ?, ?, ?, 'published', ?)"
  ).run(lpId, `Validation Test: ${idea.title}`, `validate-${campaignId.slice(0, 8)}`, lpHtml, campaignId);

  db.prepare("UPDATE validation_campaigns SET landing_page_id = ? WHERE id = ?").run(lpId, campaignId);

  // 2. Generate ad copy variants
  let variants: Array<{ angle: string; headline: string; body: string; cta: string }>;
  try {
    const { text: adCopy } = await callLLMWithFallback(
      `Idea: ${idea.title}\nDescription: ${idea.description || "N/A"}\nLanding page headline: ${lpData.headline}\n\nOutput ONLY a valid JSON array of 3 variants, no other text:\n[\n  { "angle": "pain", "headline": "...", "body": "...", "cta": "..." },\n  { "angle": "outcome", "headline": "...", "body": "...", "cta": "..." },\n  { "angle": "curiosity", "headline": "...", "body": "...", "cta": "..." }\n]`,
      { systemPrompt: "You are Alex Hormozi. Write 3 direct-response ad copy variants for a market validation test. Each variant tests a different angle. Output JSON only." },
    );
    const cleaned = adCopy.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    variants = JSON.parse(cleaned.includes("[") ? cleaned.slice(cleaned.indexOf("["), cleaned.lastIndexOf("]") + 1) : cleaned);
  } catch {
    variants = [
      { angle: "pain", headline: `Tired of ${idea.category || "this"}?`, body: idea.description || idea.title, cta: "Learn More" },
      { angle: "outcome", headline: `What if ${idea.title} just worked?`, body: "Early access now open.", cta: "Join Waitlist" },
      { angle: "curiosity", headline: `The ${idea.category || "industry"} is about to change`, body: "Be first to know.", cta: "Get Access" },
    ];
  }

  // Insert ad campaign with a hard budget cap for validation tests.
  // $25 total / $5 daily is enough to generate 1-3k impressions on Meta for
  // a niche audience, sufficient to read signal without burning budget.
  const adId = uuidv4();
  const VALIDATION_AD_BUDGET_TOTAL = 25;
  const VALIDATION_AD_BUDGET_DAILY = 5;
  db.prepare(
    "INSERT INTO ad_campaigns (id, platform, name, objective, ad_copy, budget_daily, budget_total, status, validation_campaign_id) VALUES (?, 'facebook', ?, 'conversions', ?, ?, ?, 'draft', ?)"
  ).run(
    adId,
    `Validation Test: ${idea.title}`,
    JSON.stringify(variants),
    VALIDATION_AD_BUDGET_DAILY,
    VALIDATION_AD_BUDGET_TOTAL,
    campaignId,
  );

  // 3. Generate social posts
  let posts: Array<{ platform: string; content: string }>;
  try {
    const { text: socialPosts } = await callLLMWithFallback(
      `Idea: ${idea.title}\nDescription: ${idea.description || "N/A"}\n\nOutput ONLY a valid JSON array of 3 posts, no other text:\n[\n  { "platform": "twitter", "content": "..." },\n  { "platform": "linkedin", "content": "..." },\n  { "platform": "twitter", "content": "..." }\n]`,
      { systemPrompt: "You are Alex Hormozi. Create 3 social posts to gauge interest in a new idea. Make them feel genuine, not like ads. Output JSON only." },
    );
    const cleaned = socialPosts.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    posts = JSON.parse(cleaned.includes("[") ? cleaned.slice(cleaned.indexOf("["), cleaned.lastIndexOf("]") + 1) : cleaned);
  } catch {
    posts = [
      { platform: "twitter", content: `Hot take: ${idea.title} is the next big thing. Here's why...` },
      { platform: "linkedin", content: `I've been researching ${idea.category || "a new space"} and found a massive gap. ${idea.title} could be the answer.` },
      { platform: "twitter", content: `Would you pay for ${idea.title}? Genuinely curious. RT if yes.` },
    ];
  }

  const scheduleBase = Date.now();
  for (let i = 0; i < posts.length; i++) {
    const scheduledAt = new Date(scheduleBase + i * 6 * 60 * 60 * 1000); // 6hr apart
    db.prepare(
      "INSERT INTO scheduled_posts (id, platform, post_text, scheduled_at, status, validation_campaign_id) VALUES (?, ?, ?, ?, 'scheduled', ?)"
    ).run(uuidv4(), posts[i].platform, posts[i].content, scheduledAt.toISOString(), campaignId);
  }

  // All assets created — NOW mark campaign as running and start the test clock
  db.prepare(
    "UPDATE validation_campaigns SET status = 'running', test_started_at = datetime('now') WHERE id = ?"
  ).run(campaignId);
  db.prepare(
    "UPDATE ideabrowser_ideas SET validation_status = 'testing' WHERE id = ?"
  ).run(ideaId);

  // Push the new landing page to the public form service on Vercel so it's
  // immediately reachable at https://<form-service>.vercel.app/p/<slug>.
  // Best-effort: failure here doesn't block campaign creation. The next
  // automation cycle re-syncs published pages, so a transient failure heals.
  try {
    const { syncLandingPages, isFormServiceConfigured } = await import("@/lib/form-service");
    if (isFormServiceConfigured()) {
      await syncLandingPages([{
        slug: `validate-${campaignId.slice(0, 8)}`,
        source_id: lpId,
        validation_campaign_id: campaignId,
        project_id: null,
        title: `Validation Test: ${idea.title}`,
        html: lpHtml,
        status: "published",
      }]);
    }
  } catch (err) {
    console.warn("[create-test-assets] form-service sync failed (non-fatal):", err);
  }

  logActivity({
    action: "validation_assets_created",
    details: `Validation campaign assets created for: ${idea.title}. Landing page, ${variants.length} ad variants, and ${posts.length} social posts ready. Campaign: ${campaignId}`,
  });
}
