// ─── IdeaBrowser GitHub Archive Sync ─────────────────────────────────────────
//
// Fetches "Idea of the Day" screenshots from the public GitHub archive at
// github.com/Kuberwastaken/awesome-idea-of-the-day-archive, then extracts
// idea data from the image filenames and uses an LLM to parse the screenshot
// content into structured idea objects.
//
// Falls back to filename-only extraction if no LLM connection is available.

const GITHUB_API = "https://api.github.com/repos/Kuberwastaken/awesome-idea-of-the-day-archive/contents/archives";
const GITHUB_RAW = "https://raw.githubusercontent.com/Kuberwastaken/awesome-idea-of-the-day-archive/main/archives";

interface Connection {
  provider: string;
  base_url: string | null;
  api_key_encrypted: string | null;
  model: string | null;
}

export interface SyncedIdea {
  title: string;
  description?: string;
  source_url?: string;
  category?: string;
  tags?: string;
  search_volume?: string;
  growth_rate?: string;
  pain_level?: string;
  feasibility?: string;
  founder_fit?: string;
  revenue_potential?: string;
  execution_difficulty?: string;
  go_to_market?: string;
  pricing?: string;
  target_market?: string;
  competition?: string;
  raw_data?: string;
  sync_status?: string;
}

export async function syncFromGitHubArchive(
  connection?: Connection
): Promise<{ ideas: SyncedIdea[]; errors: string[] }> {
  const ideas: SyncedIdea[] = [];
  const errors: string[] = [];

  try {
    // Get list of year folders
    const years = await fetchGitHubDir("");
    if (!years || years.length === 0) {
      errors.push("Could not fetch archive directory from GitHub");
      return { ideas, errors };
    }

    // Get the most recent year and month
    const sortedYears = years
      .filter((f: any) => f.type === "dir")
      .map((f: any) => f.name)
      .sort()
      .reverse();

    // Process last 2 months across years
    let processedDays = 0;
    const maxDays = 30; // Sync last 30 days

    for (const year of sortedYears) {
      if (processedDays >= maxDays) break;

      const months = await fetchGitHubDir(`/${year}`);
      if (!months) continue;

      const monthOrder = ["January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"];

      const sortedMonths = months
        .filter((f: any) => f.type === "dir")
        .map((f: any) => f.name)
        .sort((a: string, b: string) => monthOrder.indexOf(b) - monthOrder.indexOf(a));

      for (const month of sortedMonths) {
        if (processedDays >= maxDays) break;

        const files = await fetchGitHubDir(`/${year}/${month}`);
        if (!files) continue;

        const pngFiles = files
          .filter((f: any) => f.name.endsWith(".png"))
          .sort((a: any, b: any) => {
            const dayA = parseInt(a.name);
            const dayB = parseInt(b.name);
            return dayB - dayA; // newest first
          });

        for (const file of pngFiles) {
          if (processedDays >= maxDays) break;

          // Extract date from filename: "17 March 2026.png"
          const dateMatch = file.name.match(/^(\d+)\s+(\w+)\s+(\d+)\.png$/);
          if (!dateMatch) continue;

          const [, day, monthName, yr] = dateMatch;
          const dateStr = `${yr}-${String(monthOrder.indexOf(monthName) + 1).padStart(2, "0")}-${day.padStart(2, "0")}`;

          // Try to extract idea from image using LLM if available
          if (connection) {
            try {
              const imageUrl = `${GITHUB_RAW}/${year}/${month}/${encodeURIComponent(file.name)}`;
              const idea = await extractIdeaFromImage(imageUrl, connection, dateStr);
              if (idea) {
                ideas.push(idea);
                processedDays++;
                continue;
              }
            } catch (err) {
              // Fall through to filename-only extraction
            }
          }

          // Fallback: create a basic idea entry from the date
          ideas.push({
            title: `IdeaBrowser Idea of the Day — ${day} ${monthName} ${yr}`,
            description: `Idea of the Day from ideabrowser.com on ${day} ${monthName} ${yr}. View the screenshot for full details.`,
            source_url: `https://github.com/Kuberwastaken/awesome-idea-of-the-day-archive/blob/main/archives/${year}/${month}/${encodeURIComponent(file.name)}`,
            sync_status: "scraped",
          });
          processedDays++;
        }
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`GitHub archive sync error: ${msg}`);
  }

  return { ideas, errors };
}

async function fetchGitHubDir(path: string): Promise<any[] | null> {
  try {
    const res = await fetch(`${GITHUB_API}${path}`, {
      headers: {
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "FiveRails-IdeaBrowser-Sync",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

async function extractIdeaFromImage(
  imageUrl: string,
  connection: Connection,
  dateStr: string
): Promise<SyncedIdea | null> {
  const { provider, base_url, api_key_encrypted, model } = connection;

  const prompt = `This is a screenshot of ideabrowser.com's "Idea of the Day" page. Extract the main idea shown. Return ONLY a JSON object with these fields (no markdown, no explanation):
{"title":"the idea title","description":"2-3 sentence description","category":"main category","tags":"comma separated tags","target_market":"who this is for","pain_level":"if visible","revenue_potential":"if visible","execution_difficulty":"if visible"}`;

  try {
    if (provider === "ollama") {
      // Ollama with vision model
      const { Ollama } = await import("ollama");
      const ollama = new Ollama({ host: base_url || "http://127.0.0.1:11434" });

      // Fetch the image as base64
      const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(15000) });
      if (!imgRes.ok) return null;
      const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
      const base64 = imgBuffer.toString("base64");

      const response = await ollama.chat({
        model: model || "llava",
        messages: [{
          role: "user",
          content: prompt,
          images: [base64],
        }],
        stream: false,
      });

      return parseIdeaJson(response.message.content, imageUrl, dateStr);
    } else if (provider === "openai" || provider === "anthropic") {
      // OpenAI-compatible vision API
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (api_key_encrypted) headers["Authorization"] = `Bearer ${api_key_encrypted}`;

      const apiUrl = provider === "anthropic"
        ? "https://api.anthropic.com/v1/messages"
        : `${base_url || "https://api.openai.com"}/v1/chat/completions`;

      if (provider === "anthropic") {
        const apiKey = api_key_encrypted || "";
        const isOAuth = apiKey.startsWith("sk-ant-oat");
        if (isOAuth) {
          headers["Authorization"] = `Bearer ${apiKey}`;
        } else {
          headers["x-api-key"] = apiKey;
          delete headers["Authorization"];
        }
        headers["anthropic-version"] = "2023-06-01";

        const res = await fetch(apiUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: model || "claude-sonnet-4-20250514",
            max_tokens: 500,
            messages: [{
              role: "user",
              content: [
                { type: "image", source: { type: "url", url: imageUrl } },
                { type: "text", text: prompt },
              ],
            }],
          }),
          signal: AbortSignal.timeout(30000),
        });

        if (!res.ok) return null;
        const data = await res.json();
        const text = data.content?.[0]?.text || "";
        return parseIdeaJson(text, imageUrl, dateStr);
      } else {
        const res = await fetch(apiUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: model || "gpt-4o-mini",
            messages: [{
              role: "user",
              content: [
                { type: "image_url", image_url: { url: imageUrl } },
                { type: "text", text: prompt },
              ],
            }],
            max_tokens: 500,
          }),
          signal: AbortSignal.timeout(30000),
        });

        if (!res.ok) return null;
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content || "";
        return parseIdeaJson(text, imageUrl, dateStr);
      }
    }
  } catch {
    return null;
  }

  return null;
}

function parseIdeaJson(raw: string, sourceUrl: string, dateStr: string): SyncedIdea | null {
  try {
    // Try direct parse
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const data = JSON.parse(match[0]);
    if (!data.title) return null;

    return {
      title: data.title,
      description: data.description || undefined,
      category: data.category || undefined,
      tags: data.tags || undefined,
      target_market: data.target_market || undefined,
      pain_level: data.pain_level || undefined,
      revenue_potential: data.revenue_potential || undefined,
      execution_difficulty: data.execution_difficulty || undefined,
      source_url: sourceUrl,
      sync_status: "scraped",
    };
  } catch {
    return null;
  }
}
