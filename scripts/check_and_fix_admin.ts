import dotenv from "dotenv";
dotenv.config();
import { neon } from "@neondatabase/serverless";

async function main() {
  const client = neon(process.env.DATABASE_URL!);
  const users = await client`SELECT id, email, role, tenant_role FROM users WHERE email = 'scooter4356@gmail.com'`;
  console.log("Current user:", users);
  await client`UPDATE users SET role = 'admin', tenant_role = 'owner' WHERE email = 'scooter4356@gmail.com'`;
  console.log("UPDATED");
}

main().catch(console.error).finally(() => process.exit(0));
