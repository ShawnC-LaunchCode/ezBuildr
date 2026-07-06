import dotenv from "dotenv";
dotenv.config();
import { initializeDatabase } from "../server/db";
import { userRepository } from "../server/repositories/UserRepository";

async function main() {
  await initializeDatabase();
  console.log("Testing findAllUsersWithWorkflowCounts...");
  try {
    const users = await userRepository.findAllUsersWithWorkflowCounts();
    console.log("Success! Users returned:", users.length);
  } catch (e) {
    console.error("FAILED:", e);
  }
}

main().catch(console.error).finally(() => process.exit(0));
