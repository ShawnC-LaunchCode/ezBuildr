import { customType } from "drizzle-orm/pg-core";

/**
 * jsonb that reads back exactly what was stored.
 *
 * Both drivers -- node-postgres, and @neondatabase/serverless in production --
 * already decode jsonb, and drizzle's jsonb() then JSON.parse()s any string it
 * gets back. So a stored string that is also valid JSON ("15552013344", "true",
 * "null") came back as a number, boolean or null (2026-09-15): a phone answer
 * read back as a number, a DataVault text cell "12345" as 12345. Nothing was
 * wrong on disk; only reads were -- until a mis-typed read was written back.
 *
 * Use this for any jsonb column whose top-level value can be a bare string.
 * Writes are unchanged (JSON.stringify, exactly as jsonb() does) and the SQL
 * type is still jsonb, so switching a column needs no migration.
 */
export const storedJsonb = customType<{ data: unknown; driverData: unknown }>({
  dataType() {
    return "jsonb";
  },
  toDriver(value) {
    return JSON.stringify(value);
  },
  fromDriver(value) {
    return value;
  },
});
