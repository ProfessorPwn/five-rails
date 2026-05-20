// Run-once poller for testing and manual cron triggers.
// In production this is invoked from the automation heartbeat, but you can
// also run it ad-hoc:
//
//   FORM_SERVICE_URL=... SERVICE_API_TOKEN=... npx tsx scripts/poll-submissions-from-vercel.ts

import "dotenv/config";
import { pollFormServiceOnce } from "../src/lib/form-service-poller";

async function main() {
  const result = await pollFormServiceOnce();
  console.log(JSON.stringify(result, null, 2));
}

main().catch(err => {
  console.error("Poll failed:", err.message || err);
  process.exit(1);
});
