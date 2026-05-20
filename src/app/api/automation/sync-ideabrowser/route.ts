import { NextRequest, NextResponse } from "next/server";
import { getDb, getConnectionWithFallback, scoreIdeaBrowserIdea, logActivity, getIdeaBrowserIdea } from "@/lib/db";
import { validateIdea, saveValidationResult, fetchAndSaveGoogleTrendsChart } from "@/lib/ai/idea-validation-engine";
import { v4 as uuidv4 } from "uuid";
import { execSync } from "child_process";
import { readFileSync } from "fs";

// Daily sync: Scrape ideabrowser.com via gstack (shell), extract Idea of the Day,
// import it, run validation, assign to agents.
// The scraping runs as a shell script (gstack needs a terminal sandbox context),
// then the extracted text is parsed and imported here.

const SCRAPER = `${process.cwd()}/scripts/scrape-ideabrowser.sh`;

export async function POST(request: NextRequest) {
  try {
    const baseUrl = request.nextUrl.origin;
    const body = await request.json().catch(() => ({}));
    const targetDateStr = (body as { target_date?: string }).target_date;
    const today = targetDateStr ? new Date(targetDateStr + "T12:00:00Z") : new Date();
    const ideaDate = today.toISOString().split("T")[0];

    // Step 1: Check if already imported for this date
    const existing = getDb().prepare(
      "SELECT id, title, description FROM ideabrowser_ideas WHERE idea_date = ? LIMIT 1"
    ).get(ideaDate) as { id: string; title: string; description: string } | undefined;

    if (existing && existing.description && !existing.title.startsWith("IdeaBrowser Idea of the Day")) {
      return NextResponse.json({ message: `Idea for ${ideaDate} already imported`, skipped: true });
    }

    if (existing) {
      getDb().prepare("DELETE FROM ideabrowser_ideas WHERE id = ?").run(existing.id);
    }

    // Step 2: Accept pre-scraped text (from shell script) or scrape inline
    let pageText = (body as { page_text?: string }).page_text || "";

    if (!pageText) {
      // Run the gstack scraper shell script
      console.log("[sync-ideabrowser] Running gstack scraper script...");
      try {
        const result = execSync(`bash ${SCRAPER}`, {
          timeout: 60000,
          encoding: "utf-8",
          env: { ...process.env, PATH: `${process.env.HOME}/.bun/bin:${process.env.PATH}`, HOME: process.env.HOME || "/home/z-ro" },
        });
        const parsed = JSON.parse(result.trim());
        if (parsed.success && parsed.text_file) {
          pageText = readFileSync(parsed.text_file, "utf-8");
        } else if (parsed.error) {
          return NextResponse.json({ error: `Scraper failed: ${parsed.error}` }, { status: 502 });
        }
      } catch (e) {
        // Surface stdout + stderr so we can actually diagnose. execSync wraps
        // the underlying spawn error, but the useful diagnostic lives on the
        // .stdout / .stderr / .status properties of the thrown object.
        const err = e as { message?: string; stdout?: Buffer | string; stderr?: Buffer | string; status?: number; signal?: string };
        const stdout = (typeof err.stdout === "string" ? err.stdout : err.stdout?.toString()) || "";
        const stderr = (typeof err.stderr === "string" ? err.stderr : err.stderr?.toString()) || "";
        const details = `exit=${err.status ?? "?"} signal=${err.signal ?? "-"} msg=${err.message?.slice(0, 200) || "-"} stdout=${stdout.slice(0, 400)} stderr=${stderr.slice(0, 400)}`;
        console.error("[sync-ideabrowser] Scraper script failed:", details);
        return NextResponse.json({ error: "Scraper script failed", details }, { status: 502 });
      }
    }

    if (!pageText || pageText.length < 100) {
      return NextResponse.json({ error: "Scraped text too short or empty", text_length: pageText.length }, { status: 422 });
    }

    console.log(`[sync-ideabrowser] Processing ${pageText.length} chars from ideabrowser.com`);

    // Step 3: Parse the Idea of the Day from the scraped text
    // The page text contains the idea database entries in sequence.
    // The first substantial idea after the "Idea of the Day" header is today's idea.
    const parsed = parseIdeaFromPageText(pageText, ideaDate);

    if (!parsed) {
      console.log("[sync-ideabrowser] Failed to extract idea from page text");
      return NextResponse.json({
        error: "Could not extract Idea of the Day from ideabrowser.com",
        text_length: pageText.length,
      }, { status: 422 });
    }

    console.log(`[sync-ideabrowser] Extracted: "${parsed.title}"`);

    // Step 4: Import the idea
    const ideaId = uuidv4();
    getDb().prepare(`
      INSERT INTO ideabrowser_ideas (id, title, description, category, tags, target_market, source_url, idea_date, sync_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scraped')
    `).run(ideaId, parsed.title, parsed.description, parsed.category, parsed.tags, parsed.target_market, "https://ideabrowser.com", ideaDate);

    // Step 5: Run v2 AI validation
    let validationEngine = "deterministic";
    try {
      const idea = getIdeaBrowserIdea(ideaId);
      if (idea) {
        const result = await validateIdea(idea);
        saveValidationResult(ideaId, result);
        validationEngine = result.engine;
        console.log(`[sync-ideabrowser] Validation complete (${result.engine}): ${parsed.title}`);
      }
    } catch (e) {
      console.log("[sync-ideabrowser] Validation failed, falling back to deterministic:", e instanceof Error ? e.message : e);
      scoreIdeaBrowserIdea(ideaId);
    }

    // Step 6: Fetch Google Trends chart data
    let trendsChart = false;
    try {
      trendsChart = await fetchAndSaveGoogleTrendsChart(ideaId);
      console.log(`[sync-ideabrowser] Google Trends chart: ${trendsChart ? "OK" : "no data"}`);
    } catch (e) {
      console.log("[sync-ideabrowser] Google Trends fetch failed:", e instanceof Error ? e.message : e);
    }

    logActivity({
      action: "ideabrowser_auto_sync",
      details: `Auto-imported IdeaBrowser idea: "${parsed.title}" (${ideaDate}) — scraped from ideabrowser.com, validated via ${validationEngine}${trendsChart ? ", trends chart loaded" : ""}`,
    });

    // Step 7: Assign to Peter Thiel (Research) for analysis
    try {
      await fetch(`${baseUrl}/api/agents/agent-research/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `[AUTO-SYNC] New IdeaBrowser idea imported: "${parsed.title}" — ${parsed.description}. Category: ${parsed.category}. Analyze this idea using the Contrarian Question and Monopoly Theory frameworks. Is this 0→1 or 1→N? What's the hidden secret? Should we pursue this?`,
        }),
      });
    } catch { /* non-blocking */ }

    // Step 8: Notify Ray Dalio (Executive)
    try {
      getDb().prepare(
        "INSERT INTO agent_messages (id, from_agent_id, to_agent_id, message, message_type) VALUES (?, 'agent-research', 'agent-executive', ?, 'info')"
      ).run(uuidv4(), `New idea imported from IdeaBrowser: "${parsed.title}" (${parsed.category}). Research analysis in progress.`);
    } catch { /* non-blocking */ }

    return NextResponse.json({
      imported: true,
      idea_id: ideaId,
      title: parsed.title,
      category: parsed.category,
      date: ideaDate,
      source: "ideabrowser.com (gstack scrape)",
      validation_engine: validationEngine,
      trends_chart: trendsChart,
      assigned_to: "Peter Thiel (Research)",
      notified: "Ray Dalio (Executive)",
    });
  } catch (error) {
    console.error("POST /api/automation/sync-ideabrowser error:", error);
    return NextResponse.json({ error: "Sync failed", details: error instanceof Error ? error.message : "unknown" }, { status: 500 });
  }
}

// ── Parser: extract Idea of the Day from scraped page text ────────────────────

interface ParsedIdea {
  title: string;
  description: string;
  category: string;
  tags: string;
  target_market: string;
}

function parseIdeaFromPageText(text: string, _date: string): ParsedIdea | null {
  // ideabrowser.com page structure:
  // Line 1 is a mega-line: "...Idea of the day for April 10, 2026...The Idea Database...{title}{description}..."
  // Lines 2+ are separate paragraphs of the first idea's description/business model
  // Then more ideas follow as title+paragraph pairs

  // Strategy: Extract the Idea of the Day title from the text between
  // "The Idea Database...business ideas" and the first long paragraph (the description)

  // First, find the marker text
  const dbMarker = "business ideas";
  const dbIdx = text.indexOf(dbMarker);
  if (dbIdx === -1) return null;

  // Get everything after the database header
  const afterDb = text.slice(dbIdx + dbMarker.length);

  // The first idea title is a short phrase (< 80 chars) that appears
  // before the first long sentence. On the mega-line, it's concatenated directly.
  // On separate lines, it's the first short line.

  // Split into lines, then re-split mega-lines at sentence boundaries
  const rawLines = afterDb.split(/\n/).map(l => l.trim()).filter(Boolean);

  // The first line might be a mega-line containing the title + first paragraph
  const firstLine = rawLines[0] || "";

  let rawTitle = "";
  let descStart = "";

  if (firstLine.length > 200) {
    // Mega-line: title is concatenated before the first long sentence
    // Find where the first real sentence starts (capital letter after a pattern break)
    // The title ends where a sentence starting with "The" or "A" begins with a capital
    // after a lowercase letter (e.g. "...day jobsThe coding bootcamp...")
    // Find title/description boundary: a capital letter after a lowercase letter,
    // but NOT after a hyphen (e.g. "micro-SaaS" should not split)
    for (let i = 20; i < Math.min(firstLine.length, 120); i++) {
      if (/[a-z]/.test(firstLine[i - 1]) && /[A-Z]/.test(firstLine[i]) && firstLine[i - 2] !== '-') {
        rawTitle = firstLine.slice(0, i);
        descStart = firstLine.slice(i);
        break;
      }
    }
  } else if (firstLine.length > 10 && firstLine.length < 100) {
    // Separate line — clean title
    rawTitle = firstLine;
    descStart = rawLines.slice(1).join(" ");
  }

  if (!rawTitle) return null;

  // Collect description: first 2 substantial paragraphs
  const descParagraphs: string[] = [];
  if (descStart.length > 100) descParagraphs.push(descStart.slice(0, 500));
  for (let i = 1; i < rawLines.length && descParagraphs.length < 2; i++) {
    if (rawLines[i].length > 100) {
      descParagraphs.push(rawLines[i].slice(0, 500));
    }
  }

  const description = descParagraphs.join(" ").slice(0, 1000);

  if (!description) return null;

  const brandedTitle = brandifyTitle(rawTitle.trim());
  const { category, tags, target_market } = inferMetadata(rawTitle, description);

  return { title: brandedTitle, description, category, tags, target_market };
}

function brandifyTitle(rawTitle: string): string {
  // If it already has a colon (branded format), keep it
  if (rawTitle.includes(":") || rawTitle.includes("—")) return rawTitle;

  // Extract the core concept and make it pitchable
  // e.g. "Python training for professionals with repetitive day jobs"
  // → "Workframe: Python Training for Professionals Who Want to Automate Their Day Jobs"

  // Capitalize first letter of each significant word
  const capitalized = rawTitle.replace(/\b\w/g, c => c.toUpperCase());

  // If it's already pretty specific (has "for", "that", "who"), just capitalize
  if (/\b(for|that|who|which)\b/i.test(rawTitle)) {
    return capitalized;
  }

  return capitalized;
}

function inferMetadata(title: string, description: string): { category: string; tags: string; target_market: string } {
  const text = (title + " " + description).toLowerCase();

  // Category inference
  let category = "Technology";
  if (/educ|learn|course|training|teach/i.test(text)) category = "Education";
  else if (/health|medical|fitness|wellness|pharma/i.test(text)) category = "Health";
  else if (/finance|payment|bank|invest|accounting/i.test(text)) category = "Finance";
  else if (/food|meal|restaurant|kitchen/i.test(text)) category = "Food";
  else if (/real estate|property|home|housing/i.test(text)) category = "Real Estate";
  else if (/legal|law|attorney|court/i.test(text)) category = "Legal";
  else if (/ecommerce|shop|store|retail/i.test(text)) category = "E-Commerce";
  else if (/social|community|friend|neighbor/i.test(text)) category = "Social";
  else if (/saas|software|app|platform|tool/i.test(text)) category = "SaaS";
  else if (/market|advertis|brand|content|seo/i.test(text)) category = "Marketing";
  else if (/ai|machine learning|automation|data/i.test(text)) category = "AI/ML";
  else if (/devops|developer|code|api|infra/i.test(text)) category = "Developer Tools";

  // Tags from keywords
  const tagWords = new Set<string>();
  const tagPatterns = [
    "SaaS", "B2B", "B2C", "AI", "Automation", "EdTech", "FinTech", "HealthTech",
    "Marketplace", "Platform", "Mobile", "Analytics", "API", "No-Code", "Low-Code",
    "Subscription", "Freemium", "Community", "Content", "E-Commerce",
  ];
  for (const tag of tagPatterns) {
    if (text.includes(tag.toLowerCase())) tagWords.add(tag);
  }
  tagWords.add(category);

  // Target market inference
  let target_market = "Small businesses and professionals";
  if (/founder|startup/i.test(text)) target_market = "Startup founders and early-stage teams";
  else if (/freelanc|solo|independent/i.test(text)) target_market = "Freelancers and solopreneurs";
  else if (/enterprise|corporate|team/i.test(text)) target_market = "Enterprise teams and corporate buyers";
  else if (/consumer|family|parent|senior/i.test(text)) target_market = "Consumers and families";
  else if (/teacher|student|school/i.test(text)) target_market = "Educators and students";
  else if (/developer|engineer|devops/i.test(text)) target_market = "Developers and engineering teams";

  return {
    category,
    tags: Array.from(tagWords).join(", "),
    target_market,
  };
}
