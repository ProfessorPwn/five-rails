// ─── Ollama Model Resolver ───────────────────────────────────────────────────
// Lets the Ollama connection's `model` field be "auto" (or empty) to pick the
// best available model dynamically. Without this, a hardcoded `qwen3:14b` fails
// silently when that exact tag isn't installed.
//
// Resolution order:
//  1. Honor the configured model if it exists in /api/tags.
//  2. Use whatever's currently loaded in VRAM (warm, no cold-start penalty).
//  3. Pick the best model from /api/tags by size × family preference.

interface OllamaTag {
  name: string;
  size?: number;
  details?: { parameter_size?: string };
}

const CACHE_MS = 15_000;
const cache: Map<string, { model: string; at: number }> = new Map();

const AUTO_VALUES = new Set(["", "auto", "dynamic", "best", "latest"]);

export async function resolveOllamaModel(configured: string | null | undefined, host: string): Promise<string> {
  const cacheKey = `${host}::${configured || ""}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.model;

  const want = (configured || "").trim().toLowerCase();
  const wantAuto = AUTO_VALUES.has(want);

  const [tags, loaded] = await Promise.all([
    fetchTags(host),
    fetchLoaded(host),
  ]);

  // 1. Explicit configured model — use it if installed; otherwise fall through.
  if (!wantAuto && configured) {
    const exact = tags.find(t => t.name === configured);
    if (exact) {
      cache.set(cacheKey, { model: exact.name, at: Date.now() });
      return exact.name;
    }
    // Partial match on prefix (e.g. "qwen3:14b" matches "qwen3-14b-autonomous")
    const fuzzy = tags.find(t => t.name.toLowerCase().includes(want.replace(/[:.-]/g, "")));
    if (fuzzy) {
      cache.set(cacheKey, { model: fuzzy.name, at: Date.now() });
      return fuzzy.name;
    }
  }

  // 2. Follow whatever Ollama currently has loaded in VRAM. If the user keeps a
  // model warm via an external heartbeat (e.g. gemma4-claw:26b on a 3-min cron),
  // we match that. If multiple are loaded, take the biggest. Size heuristics do
  // NOT override the user's explicit warming choice.
  if (loaded.length > 0) {
    const pick = loaded.length === 1 ? loaded[0] : [...loaded].sort((a, b) => sizeB(b) - sizeB(a))[0];
    cache.set(cacheKey, { model: pick.name, at: Date.now() });
    return pick.name;
  }

  // 3. Nothing loaded — cold pick: highest-scoring installed model
  const ranked = [...tags].sort((a, b) => scoreModel(b) - scoreModel(a));
  const best = ranked[0];
  if (best) {
    cache.set(cacheKey, { model: best.name, at: Date.now() });
    return best.name;
  }

  // Fallback — use whatever was configured even if not present; caller will get an error
  return configured || "qwen3";
}

// Force a re-resolution (e.g. after user hits a "refresh models" button)
export function clearOllamaResolverCache(): void {
  cache.clear();
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function fetchTags(host: string): Promise<OllamaTag[]> {
  try {
    const res = await fetch(`${host.replace(/\/$/, "")}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.models as OllamaTag[]) || [];
  } catch { return []; }
}

async function fetchLoaded(host: string): Promise<OllamaTag[]> {
  try {
    const res = await fetch(`${host.replace(/\/$/, "")}/api/ps`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.models as OllamaTag[]) || [];
  } catch { return []; }
}

function sizeB(m: OllamaTag): number {
  const ps = m.details?.parameter_size || "";
  const n = parseFloat(ps.replace(/[^0-9.]/g, ""));
  return isFinite(n) ? n : 0;
}

function scoreModel(m: OllamaTag): number {
  const b = sizeB(m);
  const name = m.name.toLowerCase();
  let score = b * 10; // size is the biggest factor

  // Family bonuses (taste: reasoning-oriented > coder > generic)
  if (name.includes("autonomous")) score += 50;
  if (name.includes("qwen3")) score += 30;
  if (name.includes("qwen")) score += 20;
  if (name.includes("gemma4")) score += 25;
  if (name.includes("claw")) score += 20; // local tuned model
  if (name.includes("coder")) score += 10;

  // Penalize tiny models — unusable for agent reasoning
  if (b > 0 && b < 3) score -= 100;

  return score;
}
