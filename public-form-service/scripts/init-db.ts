// Run once after creating a Neon database to create tables and indexes.
// Usage: DATABASE_URL=... npx tsx scripts/init-db.ts
import postgres from "postgres";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }
  const sql = postgres(url, { max: 1 });
  const ddl = readFileSync(join(__dirname, "init-db.sql"), "utf8");
  // postgres.js requires unsafe() for multi-statement DDL.
  await sql.unsafe(ddl);
  console.log("OK — tables and indexes created.");
  await sql.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
