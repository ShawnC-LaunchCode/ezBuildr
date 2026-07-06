import { db, initializeDatabase } from "./server/db";
import { passwordResetTokens } from "./shared/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

async function run() {
  await initializeDatabase();
  const token = "01b29aadcaa9da32673ef4da30723d4cec0c2dcd7ef34a83c102892fb5bc2e3d";
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  console.log("Token hash:", tokenHash);

  const res = await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.token, tokenHash));
  console.log("Found in DB:", res);
  process.exit(0);
}

run();
