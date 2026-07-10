import { eq } from 'drizzle-orm';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { db } from '../../server/db';
import { mfaSecrets } from '../../shared/schema';
import { encrypt, decrypt } from '../../server/utils/encryption';

async function backfillMfaSecrets() {
    console.log('Starting MFA secrets re-encryption backfill...');
    const secrets = await db.select().from(mfaSecrets);
    let encryptedCount = 0;
    let alreadyEncryptedCount = 0;

    for (const record of secrets) {
        let isEncrypted = false;
        try {
            // Try to decrypt. If it succeeds, it's already encrypted.
            decrypt(record.secret);
            isEncrypted = true;
        } catch {
            // If decryption fails, it's likely plaintext.
            isEncrypted = false;
        }

        if (!isEncrypted) {
            try {
                const encrypted = encrypt(record.secret);
                await db.update(mfaSecrets)
                    .set({ secret: encrypted })
                    .where(eq(mfaSecrets.id, record.id));
                encryptedCount++;
                if (encryptedCount % 100 === 0) {
                    console.log(`Progress: Re-encrypted ${encryptedCount} secrets...`);
                }
            } catch (error) {
                console.error(`Failed to encrypt secret for user ${record.userId}`, error);
            }
        } else {
            alreadyEncryptedCount++;
        }
    }

    console.log(`Backfill complete. Re-encrypted: ${encryptedCount}. Already encrypted: ${alreadyEncryptedCount}.`);
}

backfillMfaSecrets()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('Backfill failed:', err);
        process.exit(1);
    });
