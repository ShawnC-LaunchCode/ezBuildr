import { db } from "../server/db";
import { secrets } from "../shared/schema";
import { encrypt, decrypt } from "../server/utils/encryption";
import { eq } from "drizzle-orm";

async function rotateMasterKey() {
  console.log("Starting master key rotation...");
  
  if (!process.env.VL_MASTER_KEY) {
    console.error("Error: VL_MASTER_KEY is not set.");
    process.exit(1);
  }
  
  if (!process.env.VL_RETIRED_KEYS) {
    console.warn("Warning: VL_RETIRED_KEYS is not set. Assuming rotating from unversioned keys.");
  }

  // Fetch all secrets
  const allSecrets = await db.select().from(secrets);
  console.log(`Found ${allSecrets.length} secrets to process.`);

  let successCount = 0;
  let errorCount = 0;

  for (const secret of allSecrets) {
    try {
      if (!secret.valueEnc) {
        continue; // Skip if no encrypted value
      }
      
      // Decrypt using the current decrypt logic (which tries master then retired keys)
      const plaintext = decrypt(secret.valueEnc);
      
      // Encrypt with the new master key (will add 'v1.' prefix)
      const newEncrypted = encrypt(plaintext);
      
      // Update in database
      await db.update(secrets)
        .set({ valueEnc: newEncrypted })
        .where(eq(secrets.id, secret.id));
        
      successCount++;
    } catch (e) {
      console.error(`Failed to rotate secret ID ${secret.id}:`, e);
      errorCount++;
    }
  }

  console.log("Rotation complete.");
  console.log(`Successfully rotated: ${successCount}`);
  console.log(`Failed to rotate: ${errorCount}`);
  
  process.exit(errorCount > 0 ? 1 : 0);
}

rotateMasterKey().catch((e) => {
  console.error("Fatal error during rotation:", e);
  process.exit(1);
});
