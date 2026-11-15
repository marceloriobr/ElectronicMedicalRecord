import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

export const DATABASE_FILE = process.env.DATABASE_FILE ?? "data/emr.db";

function createDb() {
  fs.mkdirSync(path.dirname(DATABASE_FILE), { recursive: true });
  const sqlite = new Database(DATABASE_FILE);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite, { schema });
}

// Reaproveita a conexão entre recarregamentos no modo dev.
const globalForDb = globalThis as unknown as { db?: ReturnType<typeof createDb> };
export const db = globalForDb.db ?? createDb();
if (process.env.NODE_ENV !== "production") globalForDb.db = db;
