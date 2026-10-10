import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";
import { seedDefaults } from "./seed";

export type DB = BetterSQLite3Database<typeof schema>;

export interface Connection {
  db: DB;
  sqlite: Database.Database;
}

export function getDataDir(): string {
  // The data directory is chosen at runtime; keep it out of the build's file tracing.
  return path.resolve(/*turbopackIgnore: true*/ process.env.FINANCE_DATA_DIR ?? path.join(process.cwd(), "data"));
}

export function getDbPath(): string {
  return path.join(getDataDir(), "finance.db");
}

/** Opens (and creates/migrates/seeds if needed) a database file. Use ":memory:" in tests. */
export function openDatabase(file: string): Connection {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(/*turbopackIgnore: true*/ process.cwd(), "drizzle") });
  seedDefaults(db);
  return { db, sqlite };
}
