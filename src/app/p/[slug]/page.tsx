import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import SignupForm from "./SignupForm";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ slug: string }> };

export default async function PublicLandingPage({ params }: RouteContext) {
  const { slug } = await params;
  const db = getDb();

  const page = db.prepare(
    `SELECT id, project_id, validation_campaign_id, title, html, status, visits
     FROM landing_pages WHERE slug = ?`
  ).get(slug) as
    | { id: string; project_id: string | null; validation_campaign_id: string | null; title: string; html: string; status: string; visits: number }
    | undefined;

  if (!page) notFound();
  if (page.status === "archived") notFound();

  // Increment visit counter and log a funnel_event for this view.
  db.prepare("UPDATE landing_pages SET visits = visits + 1 WHERE id = ?").run(page.id);
  db.prepare(
    `INSERT INTO funnel_events (id, project_id, event_name, event_data, source)
     VALUES (?, ?, 'landing_page_view', ?, 'public_landing')`
  ).run(uuidv4(), page.project_id, JSON.stringify({ slug, page_id: page.id, campaign_id: page.validation_campaign_id }));

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0c14] via-[#0d111c] to-[#0a0c14] text-white">
      <main className="mx-auto max-w-3xl px-6 py-16">
        <div
          className="prose prose-invert prose-lg max-w-none mb-10 [&>div>h1]:text-4xl [&>div>h1]:font-bold [&>div>h1]:mb-4 [&>div>h2]:text-xl [&>div>h2]:text-[#94a3b8] [&>div>h2]:mb-6 [&>div>p]:text-[#cbd5e1] [&>div>p]:mb-4 [&>div>button]:hidden"
          dangerouslySetInnerHTML={{ __html: page.html }}
        />

        <div id="signup" className="rounded-2xl border border-indigo-500/30 bg-indigo-500/5 p-6 md:p-8">
          <h3 className="text-lg font-semibold mb-1">Get early access</h3>
          <p className="text-sm text-[#94a3b8] mb-5">
            Drop your email — we&apos;ll let you know the moment this is ready.
          </p>
          <SignupForm slug={slug} />
        </div>

        <p className="mt-8 text-center text-[10px] uppercase tracking-wide text-[#475569]">
          Validation test · {page.title}
        </p>
      </main>
    </div>
  );
}
