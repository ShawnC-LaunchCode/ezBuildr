import dotenv from "dotenv";
dotenv.config();

import { initializeDatabase } from '../server/db';
import { userRepository } from '../server/repositories';

async function testFindById() {
  console.log("🔍 Testing userRepository.findById...\n");

  // Initialize database first
  await initializeDatabase();

  const userId = '116568744155653496130';

  try {
    const user = await userRepository.findById(userId);

    console.log("Result from userRepository.findById:");
    console.log(JSON.stringify(user, null, 2));

    if (user) {
      console.log("\n📊 Key fields:");
      console.log(`  id: ${user.id}`);
      console.log(`  email: ${user.email}`);
      console.log(`  role: ${user.role}`);
      console.log(`  tenantRole: ${user.tenantRole}`);
      console.log(`  tenantId: ${user.tenantId}`);
    } else {
      console.log("❌ User not found!");
    }
  } catch (error: unknown) {
    console.error("❌ Error:", error instanceof Error ? error.message : String(error));
  }

  process.exit(0);
}

testFindById();
