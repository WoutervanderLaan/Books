import "server-only";
import type Database from "better-sqlite3";
import { getDbPath, openDatabase, type Connection, type DB } from "./connection";

export { getDataDir, getDbPath, type DB } from "./connection";

// Keep one connection across hot reloads in development.
const globalForDb = globalThis as unknown as { __financeDb?: Connection };

function connection(): Connection {
  if (!globalForDb.__financeDb) globalForDb.__financeDb = openDatabase(getDbPath());
  return globalForDb.__financeDb;
}

export function getDb(): DB {
  return connection().db;
}

export function getSqlite(): Database.Database {
  return connection().sqlite;
}

/** Closes the current connection; the next getDb() call reopens the file. */
export function closeDb() {
  globalForDb.__financeDb?.sqlite.close();
  globalForDb.__financeDb = undefined;
}
