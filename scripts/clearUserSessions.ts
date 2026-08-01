import dotenv from "dotenv";
dotenv.config();

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

async function clearUserSessions() {
  // @ts-expect-error - TODO: fix type
  neonConfig.webSocketConstructor = ws.default as unknown as typeof WebSocket;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  const userId = '116568744155653496130';

  console.log("🧹 CLEARING USER SESSIONS\n");
  console.log("=" .repeat(70));

  try {
    // Check if sessions table exists
    const tableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'sessions'
      );
    `);

    if (!tableExists.rows[0].exists) {
      console.log("⚠️  Sessions table doesn't exist - no sessions to clear");
      client.release();
      process.exit(0);
    }

    // Count sessions before clearing
    console.log("\n📍 Checking existing sessions...");
    const countBefore = await client.query('SELECT COUNT(*) FROM sessions');
    console.log(`   Total sessions in database: ${countBefore.rows[0].count}`);

    // Find sessions for this user (sessions table stores JSON)
    const userSessions = await client.query(`
      SELECT sid, sess, expire
      FROM sessions
      WHERE sess::text LIKE '%${userId}%'
    `);
    console.log(`   Sessions for user ${userId}: ${userSessions.rows.length}`);

    if (userSessions.rows.length > 0) {
      console.log("\n📍 Found sessions to clear:");
      userSessions.rows.forEach((session, index) => {
        console.log(`   Session ${index + 1}: ${session.sid}`);
      });

      // Delete user sessions
      console.log("\n📍 Deleting user sessions...");
      await client.query(`
        DELETE FROM sessions
        WHERE sess::text LIKE '%${userId}%'
      `);
      console.log("✅ User sessions deleted");
    } else {
      console.log("\n✅ No sessions found for this user");
    }

    // Optionally clear ALL sessions (for complete fresh start)
    console.log("\n📍 Clearing ALL sessions for fresh start...");
    await client.query('DELETE FROM sessions');
    console.log("✅ All sessions cleared");

    const countAfter = await client.query('SELECT COUNT(*) FROM sessions');
    console.log(`\n📊 Sessions remaining: ${countAfter.rows[0].count}`);

  } catch (error: unknown) {
    console.error("\n❌ ERROR:", error);
  } finally {
    client.release();
  }

  console.log(`\n${  "=".repeat(70)}`);
  console.log("🎯 SESSION CLEARING COMPLETE\n");
  console.log("💡 Next steps:");
  console.log("   1. Clear your browser cookies/storage (Ctrl+Shift+Delete)");
  console.log("   2. Restart your browser");
  console.log("   3. Navigate to http://localhost:5000");
  console.log("   4. Sign in with Google using scooter4356@gmail.com\n");

  process.exit(0);
}

clearUserSessions();
