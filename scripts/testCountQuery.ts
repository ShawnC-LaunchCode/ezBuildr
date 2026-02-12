import { eq } from 'drizzle-orm';

import { dbInitPromise, getDb } from '../server/db';
import { datavaultTables } from '../shared/schema';

const databaseId = '9159eca7-bf5f-4dae-8cba-aa3d5b3ed4dd';

(async () => {
  try {
    console.log('Initializing database...');
    await dbInitPromise;

    console.log('Testing count query...');
    const db = getDb();

    const tableCount = await db
      .select({ count: db.fn.count() })
      .from(datavaultTables)
      .where(eq(datavaultTables.databaseId, databaseId));

    console.log('Count result:', tableCount);
    console.log('Table count:', Number(tableCount[0]?.count ?? 0));

    process.exit(0);
  } catch (error: unknown) {
    const err = error as { message?: string; stack?: string };
    console.error('❌ Error:', err.message ?? String(error));
    if (err.stack) {
      console.error('Stack:', err.stack);
    }
    process.exit(1);
  }
})();
