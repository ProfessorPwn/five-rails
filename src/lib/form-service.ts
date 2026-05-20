// ─── Form-service client ──────────────────────────────────────────────────────
// Thin wrapper around the public form-service deployed to Vercel.
// All calls are outbound HTTPS with a bearer token; nothing inbound to this
// machine.
//
// Configuration lives in env:
//   FORM_SERVICE_URL    — e.g. https://five-rails-form-service.vercel.app
//   SERVICE_API_TOKEN   — must match SERVICE_API_TOKEN on the Vercel side

export interface FormServicePage {
  slug: string;
  source_id: string;
  validation_campaign_id?: string | null;
  project_id?: string | null;
  title: string;
  html: string;
  status?: "published" | "archived";
}

export interface FormServiceSubmission {
  id: string;
  slug: string;
  validation_campaign_id: string | null;
  project_id: string | null;
  email: string;
  name: string | null;
  spam: boolean;
  user_agent: string | null;
  referrer: string | null;
  raw_payload: Record<string, unknown>;
  created_at: string;
}

function config() {
  const url = process.env.FORM_SERVICE_URL;
  const token = process.env.SERVICE_API_TOKEN;
  if (!url) throw new Error("FORM_SERVICE_URL is not set");
  if (!token) throw new Error("SERVICE_API_TOKEN is not set");
  return { url: url.replace(/\/$/, ""), token };
}

export function isFormServiceConfigured(): boolean {
  return !!process.env.FORM_SERVICE_URL && !!process.env.SERVICE_API_TOKEN;
}

export async function publicUrlFor(slug: string): Promise<string> {
  const { url } = config();
  return `${url}/p/${slug}`;
}

export async function syncLandingPages(pages: FormServicePage[]): Promise<{ upserted: number }> {
  const { url, token } = config();
  const res = await fetch(`${url}/api/landing-pages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ pages }),
    // Avoid hanging local agent loop if Vercel is slow.
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`syncLandingPages: ${res.status} ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<{ upserted: number }>;
}

export async function pullSubmissions(limit = 100): Promise<FormServiceSubmission[]> {
  const { url, token } = config();
  const res = await fetch(`${url}/api/submissions?limit=${limit}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`pullSubmissions: ${res.status} ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { submissions: FormServiceSubmission[] };
  return data.submissions || [];
}
