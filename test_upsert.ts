import { db, initializeDatabase } from "./server/db";
import { UserRepository } from "./server/repositories/UserRepository";

async function run() {
  await initializeDatabase();
  const repo = new UserRepository(db);
  try {
    const res = await repo.upsert({
      id: "123456789",
      email: "scooter4356@gmail.com",
      firstName: "Shawn",
      lastName: "C",
      profileImageUrl: "https://example.com/image.png",
      tenantId: "00000000-0000-0000-0000-000000000000", // Need a real tenant ID for FK constraint if we insert, but since updating, might not matter
      authProvider: "google",
      emailVerified: true
    } as any);
    console.log("Success:", res);
  } catch (err) {
    console.error("Error in upsert:", err);
  }
  process.exit(0);
}

run();
