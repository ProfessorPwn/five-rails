import { NextRequest, NextResponse } from "next/server";
import { getDb, logActivity } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

export async function GET() {
  try {
    const subs = getDb().prepare("SELECT * FROM subscriptions ORDER BY started_at DESC").all();
    const attempts = getDb().prepare("SELECT * FROM payment_attempts WHERE status = 'failed' ORDER BY created_at DESC LIMIT 20").all();
    const mrr = (getDb().prepare("SELECT SUM(amount) as mrr FROM subscriptions WHERE status = 'active' AND interval = 'monthly'").get() as { mrr: number })?.mrr || 0;
    const arr = mrr * 12;
    return NextResponse.json({ subscriptions: subs, failed_payments: attempts, mrr, arr });
  } catch (error) {
    console.error("GET /api/subscriptions error:", error);
    return NextResponse.json({ error: "Failed to fetch subscriptions" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Handle failed payment retry
    if (body.action === "record_failed_payment") {
      const attemptId = uuidv4();
      // Schedule retry: 1st retry in 1 day, 2nd in 3 days, 3rd in 7 days
      const retryDays = [1, 3, 7];
      const currentRetries = (getDb().prepare(
        "SELECT COUNT(*) as cnt FROM payment_attempts WHERE subscription_id = ? AND status = 'failed'"
      ).get(body.subscription_id) as { cnt: number })?.cnt || 0;
      const nextRetryDays = retryDays[Math.min(currentRetries, retryDays.length - 1)] || 7;
      const nextRetry = new Date();
      nextRetry.setDate(nextRetry.getDate() + nextRetryDays);

      getDb().prepare(`
        INSERT INTO payment_attempts (id, subscription_id, amount, status, retry_count, next_retry_at, error_message)
        VALUES (?, ?, ?, 'failed', ?, ?, ?)
      `).run(attemptId, body.subscription_id, body.amount || 0, currentRetries + 1, nextRetry.toISOString(), body.error_message || null);

      // Update subscription to past_due
      getDb().prepare("UPDATE subscriptions SET status = 'past_due' WHERE id = ?").run(body.subscription_id);

      logActivity({ action: "payment_failed", details: `Payment failed for subscription ${body.subscription_id}. Retry #${currentRetries + 1} scheduled for ${nextRetry.toLocaleDateString()}` });

      return NextResponse.json({ attempt_id: attemptId, next_retry_at: nextRetry.toISOString(), retry_count: currentRetries + 1 });
    }

    // Handle payment recovery
    if (body.action === "record_payment_success") {
      getDb().prepare("UPDATE payment_attempts SET status = 'succeeded', recovered = 1 WHERE subscription_id = ? AND status = 'failed'").run(body.subscription_id);
      getDb().prepare("UPDATE subscriptions SET status = 'active' WHERE id = ?").run(body.subscription_id);
      logActivity({ action: "payment_recovered", details: `Payment recovered for subscription ${body.subscription_id}` });
      return NextResponse.json({ recovered: true });
    }

    // Create subscription
    const id = uuidv4();
    getDb().prepare(`
      INSERT INTO subscriptions (id, project_id, customer_email, plan_name, amount, currency, interval, status, stripe_subscription_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, body.project_id || null, body.customer_email, body.plan_name || "Pro",
      body.amount || 0, body.currency || "USD", body.interval || "monthly",
      body.status || "active", body.stripe_subscription_id || null);

    // Check if this subscription came from an affiliate referral
    if (body.referral_code) {
      const affiliate = getDb().prepare("SELECT id, commission_rate FROM affiliates WHERE referral_code = ? AND status = 'active'").get(body.referral_code) as { id: string; commission_rate: number } | undefined;
      if (affiliate) {
        const commission = (body.amount || 0) * affiliate.commission_rate;
        const commId = uuidv4();
        // Drip payout: 30 days after signup if still active
        const payoutDate = new Date();
        payoutDate.setDate(payoutDate.getDate() + 30);
        getDb().prepare(`
          INSERT INTO commissions (id, affiliate_id, amount, source, status, payout_date)
          VALUES (?, ?, ?, ?, 'pending', ?)
        `).run(commId, affiliate.id, commission, `subscription:${id}`, payoutDate.toISOString());

        // Update affiliate totals
        getDb().prepare("UPDATE affiliates SET total_referrals = total_referrals + 1, total_earned = total_earned + ? WHERE id = ?").run(commission, affiliate.id);

        logActivity({ action: "affiliate_commission", details: `Commission $${commission.toFixed(2)} for affiliate ${affiliate.id} from subscription ${id}` });
      }
    }

    // Track as funnel event
    getDb().prepare(`
      INSERT INTO funnel_events (id, project_id, event_name, event_data, user_id, source)
      VALUES (?, ?, 'purchase', ?, ?, 'subscription')
    `).run(uuidv4(), body.project_id || null, JSON.stringify({ plan: body.plan_name, amount: body.amount }), body.customer_email);

    logActivity({ action: "subscription_created", project_id: body.project_id, details: `${body.customer_email} subscribed to ${body.plan_name || "Pro"} ($${body.amount || 0}/${body.interval || "monthly"})` });

    const sub = getDb().prepare("SELECT * FROM subscriptions WHERE id = ?").get(id);
    return NextResponse.json(sub, { status: 201 });
  } catch (error) {
    console.error("POST /api/subscriptions error:", error);
    return NextResponse.json({ error: "Failed to process subscription" }, { status: 500 });
  }
}
