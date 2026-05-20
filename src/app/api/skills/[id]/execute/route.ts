import { NextRequest, NextResponse } from "next/server";
import { getSkill, getConnections, getProject, getProjectInsights, getProjectContacts, getProjectContent, getDb, logActivity } from "@/lib/db";
import { safeParseJson } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await safeParseJson(request);
    if (!body) return NextResponse.json({ error: "Invalid or missing JSON body" }, { status: 400 });
    const { project_id, input } = body;

    if (!input) {
      return NextResponse.json({ error: "input is required" }, { status: 400 });
    }

    const skill = getSkill(id);
    if (!skill) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }

    // Build the prompt: skill template + user input + cross-rail project context
    const basePrompt = skill.prompt_template
      || `You are "${skill.name}". ${skill.description || ""}`;

    // Always include user input — this was the critical bug ({{input}} was never in templates)
    let prompt = `${basePrompt}\n\n--- USER REQUEST ---\n${input}`;

    // Inject cross-rail project context so skills can build on previous work
    if (project_id) {
      const project = getProject(project_id);
      if (project) {
        let context = "\n\n--- PROJECT CONTEXT ---\n";
        context += `Project: ${project.name}\n`;
        if (project.niche) context += `Niche: ${project.niche}\n`;
        if (project.target_audience) context += `Target Audience: ${project.target_audience}\n`;
        if (project.description) context += `Description: ${project.description}\n`;

        // Inject existing research/insights (Search Layer → other rails)
        const insights = getProjectInsights(project_id);
        if (insights.length > 0) {
          context += `\nExisting Research & Insights (${insights.length} total):\n`;
          for (const ins of insights.slice(0, 5)) {
            const preview = ins.description?.slice(0, 300) || "";
            context += `- ${ins.title}: ${preview}${preview.length >= 300 ? "..." : ""}\n`;
          }
        }

        // Inject existing contacts (Outbound Spine → other rails)
        const contacts = getProjectContacts(project_id);
        if (contacts.length > 0) {
          context += `\nOutbound Contacts (${contacts.length} total):\n`;
          for (const c of contacts.slice(0, 10)) {
            context += `- ${c.name}${c.company ? ` at ${c.company}` : ""}${c.role ? ` (${c.role})` : ""}\n`;
          }
        }

        // Inject existing content (Audience Rail → other rails)
        const content = getProjectContent(project_id);
        if (content.length > 0) {
          context += `\nExisting Content (${content.length} pieces):\n`;
          for (const c of content.slice(0, 5)) {
            context += `- [${c.type}] ${c.title}\n`;
          }
        }

        // Inject brand voice if available
        const brandVoice = getDb().prepare("SELECT * FROM brand_voices WHERE (project_id = ? OR is_default = 1) ORDER BY project_id DESC, is_default DESC LIMIT 1").get(project_id) as { name: string; tone_keywords: string; rules: string; description: string } | undefined;
        if (brandVoice) {
          const toneKw = JSON.parse(brandVoice.tone_keywords || "[]");
          const rules = JSON.parse(brandVoice.rules || "[]");
          context += `\n\nBrand Voice "${brandVoice.name}": ${brandVoice.description || ""}`;
          if (toneKw.length > 0) context += `\nTone: ${toneKw.join(", ")}`;
          if (rules.length > 0) context += `\nRules: ${rules.join(". ")}`;
        }

        context += "\nUse this context to make your output specific and relevant to this project. Build on any existing work shown above.";
        prompt += context;
      }
    }

    // Pre-hook: skill-ideabrowser-pick needs the top ideas from the DB injected
    // into the prompt, otherwise the LLM will say "I don't have access to the database."
    if (id === "skill-ideabrowser-pick") {
      const topIdeas = getDb().prepare(
        `SELECT title, category, overall_score, opportunity_score, problem_score, why_now_score,
                feasibility_score_10, gtm_score, execution_difficulty_score, revenue_tier,
                target_market, substr(description, 1, 400) as description
         FROM ideabrowser_ideas
         WHERE overall_score > 0
         ORDER BY overall_score DESC LIMIT 30`
      ).all() as Array<{
        title: string; category: string | null; overall_score: number; opportunity_score: number;
        problem_score: number; why_now_score: number; feasibility_score_10: number; gtm_score: number;
        execution_difficulty_score: number; revenue_tier: string | null; target_market: string | null; description: string;
      }>;
      const totalCount = (getDb().prepare("SELECT COUNT(*) as cnt FROM ideabrowser_ideas").get() as { cnt: number }).cnt;
      const candidates = topIdeas.map((r, i) =>
        `#${i + 1}. **${r.title}**\n` +
        `   Category: ${r.category || "n/a"} | Overall: ${r.overall_score} | Opportunity: ${r.opportunity_score} | Why-Now: ${r.why_now_score} | Feasibility: ${r.feasibility_score_10} | GTM: ${r.gtm_score} | Execution: ${r.execution_difficulty_score}\n` +
        `   Revenue Tier: ${r.revenue_tier || "n/a"} | Target: ${r.target_market || "n/a"}\n` +
        `   Description: ${r.description}\n`
      ).join("\n");
      prompt = `${prompt}\n\n--- IDEABROWSER CANDIDATES (top 30 of ${totalCount} by overall_score) ---\n${candidates}\n--- END CANDIDATES ---`;
    }

    // Pre-hook: skill-gstack-open-gstack-browser — actually launch the GStack
    // Browser (headed Chromium + sidebar extension) via the local gstack binary.
    // Without this binding, the skill is only visible to the agent in its
    // "Available Skills" prompt block (context-injection) and would otherwise
    // fall through to a no-op LLM prompt template — i.e. the runtime had no
    // real tool surface for the skill. Short-circuits the LLM path and returns
    // the connect/status output directly, so the agent can confirm the browser
    // is up before issuing further commands.
    if (id === "skill-gstack-open-gstack-browser") {
      const { execSync } = await import("child_process");
      const os = await import("os");
      const fs = await import("fs");
      const GSTACK = `${os.homedir()}/.claude/skills/gstack/browse/dist/browse`;

      if (!fs.existsSync(GSTACK)) {
        return NextResponse.json({
          skill_id: id,
          skill_name: skill.name,
          project_id: project_id || null,
          input,
          output: `gstack browse binary not built at ${GSTACK}. One-time setup required: \`cd ~/.claude/skills/gstack/browse && ./setup\`.`,
          provider: "gstack-shell",
          executed_at: new Date().toISOString(),
        });
      }

      // Pre-flight cleanup: clear Chromium profile locks left over from prior crashes.
      try {
        const profileDir = `${os.homedir()}/.gstack/chromium-profile`;
        for (const lock of ["SingletonLock", "SingletonSocket", "SingletonCookie"]) {
          try { fs.unlinkSync(`${profileDir}/${lock}`); } catch { /* ok if missing */ }
        }
      } catch { /* non-blocking */ }

      const runCmd = (args: string, timeoutMs = 60_000): string => {
        try {
          return execSync(`${GSTACK} ${args}`, {
            encoding: "utf-8",
            timeout: timeoutMs,
            env: { ...process.env, CONTAINER: "1" },
          }).trim();
        } catch (err) {
          return err instanceof Error ? `ERROR: ${err.message.slice(0, 500)}` : "ERROR: unknown";
        }
      };

      const connectOut = runCmd("connect", 60_000);
      const statusOut = runCmd("status", 10_000);

      logActivity({
        action: "skill_executed",
        project_id: project_id || undefined,
        details: `Launched gstack browser via skill-gstack-open-gstack-browser`,
        skill_used: skill.name,
      });

      return NextResponse.json({
        skill_id: id,
        skill_name: skill.name,
        project_id: project_id || null,
        input,
        output: `# GStack Browser launched\n\n## connect\n\`\`\`\n${connectOut}\n\`\`\`\n\n## status\n\`\`\`\n${statusOut}\n\`\`\`\n\nThe headed Chromium window is now under gstack control on port 34567. Use skill-gstack-browse for URL fetches or invoke further \`$B\` commands via shell.`,
        provider: "gstack-shell",
        executed_at: new Date().toISOString(),
      });
    }

    // Pre-hook: skill-gstack-setup-browser-cookies — read current cookie state
    // from the running gstack browser session. Same tool-surface gap as
    // skill-gstack-open-gstack-browser: without a real shell binding the skill
    // was a no-op LLM prompt. (Cookie-import is deprecated for actively-managed
    // CF targets per Voss's n=2 evidence, but the surface is still needed for
    // non-CF targets and for diagnostic visibility.)
    if (id === "skill-gstack-setup-browser-cookies") {
      const { execSync } = await import("child_process");
      const os = await import("os");
      const fs = await import("fs");
      const GSTACK = `${os.homedir()}/.claude/skills/gstack/browse/dist/browse`;

      if (!fs.existsSync(GSTACK)) {
        return NextResponse.json({
          skill_id: id,
          skill_name: skill.name,
          project_id: project_id || null,
          input,
          output: `gstack browse binary not built at ${GSTACK}. Run skill-gstack-open-gstack-browser first (it will surface the setup hint).`,
          provider: "gstack-shell",
          executed_at: new Date().toISOString(),
        });
      }

      const runCmd = (args: string, timeoutMs = 15_000): string => {
        try {
          return execSync(`${GSTACK} ${args}`, {
            encoding: "utf-8",
            timeout: timeoutMs,
            env: { ...process.env, CONTAINER: "1" },
          }).trim();
        } catch (err) {
          return err instanceof Error ? `ERROR: ${err.message.slice(0, 500)}` : "ERROR: unknown";
        }
      };

      const statusOut = runCmd("status", 10_000);
      const cookiesOut = runCmd("cookies --json", 15_000);

      logActivity({
        action: "skill_executed",
        project_id: project_id || undefined,
        details: `Read browser cookie state via skill-gstack-setup-browser-cookies`,
        skill_used: skill.name,
      });

      return NextResponse.json({
        skill_id: id,
        skill_name: skill.name,
        project_id: project_id || null,
        input,
        output: `# GStack browser cookie state\n\n## status\n\`\`\`\n${statusOut}\n\`\`\`\n\n## cookies (JSON)\n\`\`\`\n${cookiesOut.slice(0, 8000)}${cookiesOut.length > 8000 ? "\n... (truncated)" : ""}\n\`\`\``,
        provider: "gstack-shell",
        executed_at: new Date().toISOString(),
      });
    }

    // Pre-hook: skill-gstack-browse — fetch URLs with the local gstack binary,
    // inject page text into the prompt. Gives agents live web access without
    // needing external APIs or MCP tools. URL extraction is regex-based; also
    // accepts an explicit `urls` array in the request body for programmatic use.
    if (id === "skill-gstack-browse") {
      const explicitUrls = (body.urls as string[] | undefined) || [];
      const extracted = String(input).match(/https?:\/\/[^\s)"'<>]+/g) || [];
      const urls = [...new Set([...explicitUrls, ...extracted])].slice(0, 5); // cap at 5 URLs

      if (urls.length === 0) {
        return NextResponse.json({
          error: "skill-gstack-browse requires at least one URL in the input (or a 'urls' array in the body)",
          hint: "Include a URL like https://... in your skill_input, or pass urls: ['...'] in the request body.",
        }, { status: 400 });
      }

      const { execSync } = await import("child_process");
      const os = await import("os");
      const GSTACK = `${os.homedir()}/.claude/skills/gstack/browse/dist/browse`;
      const scrapedBlocks: string[] = [];

      for (const url of urls) {
        try {
          const runCmd = (args: string, timeoutMs = 30_000): string => {
            try {
              return execSync(`${GSTACK} ${args}`, {
                encoding: "utf-8",
                timeout: timeoutMs,
                env: { ...process.env, CONTAINER: "1" }, // triggers --no-sandbox for AppArmor Ubuntu
              }).trim();
            } catch { return ""; }
          };
          runCmd(`goto ${JSON.stringify(url)}`);
          runCmd("wait --load");
          const text = runCmd("text", 20_000);
          const capped = text.slice(0, 20_000);
          scrapedBlocks.push(`--- URL: ${url} (${text.length} chars, showing first ${capped.length}) ---\n${capped || "(scrape returned 0 chars — likely JS-gated or blocked)"}`);
        } catch (err) {
          scrapedBlocks.push(`--- URL: ${url} — SCRAPE FAILED: ${err instanceof Error ? err.message.slice(0, 200) : "unknown"} ---`);
        }
      }

      prompt = `${prompt}\n\n--- SCRAPED PAGES (live via gstack) ---\n\n${scrapedBlocks.join("\n\n")}\n\n--- END SCRAPED PAGES ---`;
    }

    const connections = getConnections();
    const activeConnections = connections.filter((c) => c.is_active === 1);

    if (activeConnections.length === 0) {
      return NextResponse.json({
        error: "No active LLM connection configured",
        hint: "Go to Connections and add an Ollama or Anthropic connection.",
      }, { status: 503 });
    }

    let output: string | undefined;
    let usedProvider = "";

    for (const conn of activeConnections) {
      const { provider, base_url, api_key_encrypted, model } = conn;
      try {
        if (provider === "ollama") {
          output = await executeWithOllama(prompt, model || "llama3", base_url || "http://127.0.0.1:11434");
        } else if (provider === "anthropic" || provider === "claude-cli") {
          output = await executeWithClaude(prompt, provider, api_key_encrypted || "", model || "claude-sonnet-4-20250514");
        } else {
          output = await executeWithOpenAI(prompt, model || "gpt-4o-mini", base_url || "https://api.openai.com", api_key_encrypted || "");
        }
        usedProvider = `${provider}/${model}`;
        break; // success
      } catch (err) {
        console.log(`Skill execution: ${provider}/${model} failed, trying next connection...`, err instanceof Error ? err.message : "");
        continue;
      }
    }

    if (output === undefined) {
      return NextResponse.json({ error: "All LLM connections failed" }, { status: 503 });
    }

    logActivity({
      action: "skill_executed",
      project_id: project_id || undefined,
      details: `Executed skill: ${skill.name}`,
      skill_used: skill.name,
    });

    // Post-processing: skills that produce report markdown auto-render to PDF + email
    let pdfMeta: { report_id: string; pdf_filename: string; email_sent: boolean; email_error?: string } | null = null;
    const pdfSkills = new Set(["skill-pdf-report", "skill-ideabrowser-pick"]);
    if (pdfSkills.has(id) && output) {
      try {
        const { generatePdfReport } = await import("@/lib/pdf/generate");
        const { sendEmail, getUserEmail } = await import("@/lib/email/send");
        const { writeFileSync, mkdirSync } = await import("fs");
        const { join } = await import("path");
        const { v4: uuidv4 } = await import("uuid");

        // Extract title from first # heading, fall back to skill input
        const titleMatch = output.match(/^#\s+(.+)$/m);
        const title = titleMatch?.[1]?.trim() || String(input).slice(0, 80) || "Report";

        const pdf = await generatePdfReport({ title, markdown: output });

        const reportsDir = join(process.cwd(), "data", "reports");
        mkdirSync(reportsDir, { recursive: true });
        const reportId = uuidv4();
        const safeName = title.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 80);
        const filename = `${safeName}-${reportId.slice(0, 8)}.pdf`;
        writeFileSync(join(reportsDir, filename), pdf);

        const recipient = (body.email_to as string | undefined) || getUserEmail();
        let emailSent = false;
        let emailError: string | undefined;
        if (recipient) {
          const result = await sendEmail({
            to: recipient,
            subject: `[Five Rails] ${title}`,
            body: `The attached report was generated by the PDF Report skill.\n\n**${title}**\n\nSee the attached PDF for the full content.`,
            attachments: [{ filename, content: pdf, contentType: "application/pdf" }],
          });
          emailSent = result.sent;
          if (!result.sent) emailError = result.error;
        }

        pdfMeta = { report_id: reportId, pdf_filename: filename, email_sent: emailSent, email_error: emailError };

        logActivity({
          action: "report_generated",
          project_id: project_id || undefined,
          details: `PDF report via skill-pdf-report: "${title}"${emailSent ? ` — emailed to ${recipient}` : ""}`,
          skill_used: skill.name,
        });
      } catch (err) {
        console.error("[skill-pdf-report] post-processing failed:", err);
        pdfMeta = { report_id: "", pdf_filename: "", email_sent: false, email_error: err instanceof Error ? err.message : "unknown" };
      }
    }

    return NextResponse.json({
      skill_id: id,
      skill_name: skill.name,
      project_id: project_id || null,
      input,
      output,
      provider: usedProvider,
      executed_at: new Date().toISOString(),
      ...(pdfMeta ? { pdf: pdfMeta } : {}),
    });
  } catch (error) {
    console.error("POST /api/skills/[id]/execute error:", error);
    return NextResponse.json({ error: "Failed to execute skill" }, { status: 500 });
  }
}

async function executeWithOllama(prompt: string, model: string, host: string): Promise<string> {
  const { Ollama } = await import("ollama");
  const ollama = new Ollama({ host });
  const response = await ollama.chat({
    model,
    messages: [{ role: "user", content: prompt }],
    stream: false,
  });
  return response.message.content;
}

async function executeWithClaude(prompt: string, provider: string, apiKey: string, model: string): Promise<string> {
  // Delegates to centralized SDK client (autoforge pattern — single source of truth)
  const { querySDK } = await import("@/lib/ai/sdk-client");
  const result = await querySDK(prompt, {
    agentType: "executive",
    connection: { provider, base_url: null, api_key_encrypted: apiKey, model },
  });
  if (result.status === "error") throw new Error(result.errorMessage || "Claude SDK call failed");
  return result.text;
}

async function executeWithOpenAI(prompt: string, model: string, baseUrl: string, apiKey: string): Promise<string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }] }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}
