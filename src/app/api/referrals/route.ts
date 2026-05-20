import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

// Referral tracking with milestone rewards (Viral Loops / Beehiiv pattern)
const MILESTONES = [
  { count: 3, reward: "Free ebook or digital download" },
  { count: 5, reward: "Exclusive content access" },
  { count: 10, reward: "Premium feature unlock" },
  { count: 25, reward: "VIP community access" },
  { count: 50, reward: "1-on-1 consultation" },
];

export async function GET() {
  try {
    const referrals = getDb().prepare("SELECT * FROM referrals ORDER BY referral_count DESC, created_at DESC").all();
    return NextResponse.json({ referrals, milestones: MILESTONES });
  } catch (error) {
    console.error("GET /api/referrals error:", error);
    return NextResponse.json({ error: "Failed to fetch referrals" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (body.action === "create_referrer") {
      // Create a new referrer with a unique code
      const id = uuidv4();
      const code = uuidv4().slice(0, 8).toUpperCase();

      getDb().prepare(`
        INSERT INTO referrals (id, project_id, referrer_email, referrer_code, status, referral_count)
        VALUES (?, ?, ?, ?, 'pending', 0)
      `).run(id, body.project_id || null, body.email, code);

      return NextResponse.json({
        id,
        referrer_code: code,
        referral_link: `${body.base_url || "https://yoursite.com"}?ref=${code}`,
        milestones: MILESTONES,
      }, { status: 201 });
    }

    if (body.action === "track_referral") {
      // Track a new referral
      const referrer = getDb().prepare("SELECT * FROM referrals WHERE referrer_code = ?").get(body.referrer_code) as { id: string; referral_count: number } | undefined;
      if (!referrer) {
        return NextResponse.json({ error: "Invalid referral code" }, { status: 404 });
      }

      const newCount = referrer.referral_count + 1;
      const milestone = MILESTONES.find((m) => m.count === newCount);

      getDb().prepare(`
        UPDATE referrals SET referral_count = ?, milestone_reached = ?, referee_email = ?
        WHERE id = ?
      `).run(newCount, milestone ? newCount : null, body.referee_email || null, referrer.id);

      return NextResponse.json({
        referral_count: newCount,
        milestone_unlocked: milestone || null,
        next_milestone: MILESTONES.find((m) => m.count > newCount) || null,
      });
    }

    return NextResponse.json({ error: "Invalid action. Use 'create_referrer' or 'track_referral'" }, { status: 400 });
  } catch (error) {
    console.error("POST /api/referrals error:", error);
    return NextResponse.json({ error: "Failed to process referral" }, { status: 500 });
  }
}
