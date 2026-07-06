import dotenv from "dotenv";
dotenv.config();
import { neon } from "@neondatabase/serverless";

async function main() {
  const client = neon(process.env.DATABASE_URL!);
  const jobs = await client`SELECT id, "to", status, attempts, next_attempt_at, last_error, created_at FROM email_queue ORDER BY created_at DESC LIMIT 5`;
  console.log(jobs);
}

main().catch(console.error).finally(() => process.exit(0));
