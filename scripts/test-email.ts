#!/usr/bin/env -S npx tsx
// Test the email setup by sending a test message

import { sendEmail, getUserEmail } from "../src/lib/email/send";

async function main() {
  const userEmail = getUserEmail();
  console.log(`Target email: ${userEmail}`);

  if (!userEmail) {
    console.error("❌ No user_email configured");
    process.exit(1);
  }

  console.log("Sending test email...");
  const result = await sendEmail({
    to: userEmail,
    subject: "Five Rails — Email Setup Test",
    body: [
      "# Email Setup Successful",
      "",
      "This is a test email from your Five Rails agent system.",
      "",
      "**What this confirms:**",
      "- Gmail SMTP via nodemailer is working",
      "- Port 587 STARTTLS is functional",
      "- Your agents can now send work to your inbox",
      "",
      "---",
      "",
      "From here on, every time an agent (Ray Dalio, Alex Hormozi, Chris Voss, Marty Cagan, or Peter Thiel) produces real work — emails, strategies, dashboards, analyses — the full output will land here.",
      "",
      "You can stop checking the UI manually.",
    ].join("\n"),
  });

  console.log("Result:", JSON.stringify(result, null, 2));

  if (result.sent) {
    console.log("✅ Email sent successfully via " + result.provider);
    process.exit(0);
  } else {
    console.error("❌ Email failed: " + result.error);
    process.exit(1);
  }
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
