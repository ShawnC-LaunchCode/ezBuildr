
import dotenv from 'dotenv';
import pg from 'pg';

import { _SchemaManager } from '../tests/helpers/schemaManager';

dotenv.config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    console.error('DATABASE_URL is not defined');
    process.exit(1);
}

const client = new pg.Client({ connectionString });

async function main() {
    await client.connect();
    const workerId = process.env.VITEST_WORKER_ID || '0';
    const schemaName = `test_schema_w${workerId}`;

    console.log(`Checking schema: ${schemaName}`);

    // Check if schema exists
    const schemaRes = await client.query(`SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1`, [schemaName]);
    if (schemaRes.rowCount === 0) {
        console.log(`Schema ${schemaName} does NOT exist.`);
        await client.end();
        return;
    }
    console.log(`Schema ${schemaName} exists.`);

    // Check table audit_logs
    const tableRes = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = $1 AND table_name = 'audit_logs'
  `, [schemaName]);

    if (tableRes.rowCount === 0) {
        console.log(`Table audit_logs does NOT exist in ${schemaName}.`);
    } else {
        console.log(`Table audit_logs columns in ${schemaName}:`);
        tableRes.rows.forEach(row => {
            console.log(` - ${row.column_name} (${row.data_type})`);
        });
    }

    // Check if table audit_logs exists in PUBLIC
    const publicTableRes = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'audit_logs'
  `, []);

    if (publicTableRes.rowCount === 0) {
        console.log(`Table audit_logs does NOT exist in PUBLIC.`);
    } else {
        console.log(`Table audit_logs columns in PUBLIC:`);
        publicTableRes.rows.forEach(row => {
            console.log(` - ${row.column_name} (${row.data_type})`);
        });
    }

    await client.end();
}

main();
