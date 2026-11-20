import { Database } from "bun:sqlite";
import { closeSync, existsSync, openSync } from "node:fs";
import { catalogPath } from "./catalog-file.ts";
import { memeUsageEnabled } from "./catalog-policy.ts";

function usagePath(catalog: string) {
  return `${catalog}.usage.sqlite`;
}

function readCounts(db: Database, counts: Map<string, number>) {
  if (!db.query("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'stat'").get()) return;
  for (const { key, count } of db.query<{ key: string; count: number }, []>(
    'SELECT key, "all" AS count FROM stat',
  ).all()) {
    if (typeof key === "string" && Number.isSafeInteger(count) && count >= 0) {
      counts.set(key, (counts.get(key) ?? 0) + count);
    }
  }
}

export function readMemeUsage(catalog: Database, file = catalogPath()) {
  const counts = new Map<string, number>();
  readCounts(catalog, counts);
  const sidecar = usagePath(file);
  if (!existsSync(sidecar)) return counts;
  const db = new Database(sidecar, { readonly: true });
  try {
    db.exec("PRAGMA busy_timeout = 500");
    readCounts(db, counts);
    return counts;
  } finally {
    db.close();
  }
}

export function recordMemeUsage(key: string, catalog: string) {
  if (!memeUsageEnabled()) return;
  // Counting and catalog synchronization are independent SQLite writers.
  // Keep old totals in the imported catalog and add new counts from its sidecar.
  const file = usagePath(catalog);
  if (!existsSync(file)) closeSync(openSync(file, "a", 0o600));
  const db = new Database(file, { create: false });
  try {
    db.exec("PRAGMA busy_timeout = 500");
    db.exec('CREATE TABLE IF NOT EXISTS stat (key TEXT PRIMARY KEY NOT NULL, "all" INTEGER NOT NULL)');
    db.query('INSERT INTO stat (key, "all") VALUES (?, 1) ON CONFLICT(key) DO UPDATE SET "all" = "all" + 1').run(key);
  } finally {
    db.close();
  }
}
