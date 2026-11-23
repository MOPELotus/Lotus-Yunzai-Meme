import { Database } from "bun:sqlite";
import { catalogPath, catalogVersion } from "./catalog-file.ts";
import { isExcludedMemeTemplate, isRetiredMemeAlias } from "./template-policy.ts";

function json(source: string | null): unknown {
  if (source === null) return;
  try { return JSON.parse(source); } catch { return; }
}

function tags(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
}

export function scanMemeCatalogExclusions(db: Database) {
  const columns = db.query<{ name: string }, []>("PRAGMA table_info(meme)").all();
  const names = new Set(columns.map(column => column.name.toLowerCase()));
  const keys = new Set<string>();
  const normalizedKeys = new Set<string>();
  const aliases = new Set<string>();
  if (names.has("key")) {
    const rows = db.query<{ key: string; tags: string | null; info: string | null; keyWords: string | null }, []>(
      `SELECT key, ${names.has("tags") ? "tags" : "NULL AS tags"},
        ${names.has("info") ? "info" : "NULL AS info"},
        ${names.has("keywords") ? "keyWords" : "NULL AS keyWords"} FROM meme`,
    ).all();
    for (const row of rows) {
      if (typeof row.key !== "string") continue;
      const info = json(row.info);
      const infoTags = typeof info === "object" && info !== null && "tags" in info ? info.tags : undefined;
      if (isExcludedMemeTemplate(row.key, [...tags(json(row.tags) ?? row.tags), ...tags(infoTags)])) {
        keys.add(row.key);
        normalizedKeys.add(row.key.normalize("NFKC").trim().toLowerCase());
      } else {
        const keywords = json(row.keyWords);
        if (Array.isArray(keywords)) for (const keyword of keywords) {
          if (typeof keyword === "string" && isRetiredMemeAlias(keyword)) aliases.add(keyword.normalize("NFKC").trim().toLowerCase());
        }
      }
    }
  }
  return { keys, normalizedKeys, aliases };
}

const denialTable = "lotus_catalog_denied_keys";
const hasDenials = (db: Database) =>
  db.query("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?").get(denialTable);

export function keepMemeCatalogDenials(db: Database, denied: ReadonlySet<string>, accepted: readonly string[] = []) {
  const tagged = [...denied].filter(key => !isExcludedMemeTemplate(key));
  if (tagged.length) db.exec(`CREATE TABLE IF NOT EXISTS ${denialTable} (key TEXT NOT NULL PRIMARY KEY)`);
  else if (!hasDenials(db)) return;
  const add = db.query(`INSERT OR IGNORE INTO ${denialTable} VALUES (?)`);
  for (const key of tagged) add.run(key);
  const remove = db.query(`DELETE FROM ${denialTable} WHERE key = ?`);
  for (const key of accepted) remove.run(key);
}

let cached: (ReturnType<typeof scanMemeCatalogExclusions> & { version: string }) | undefined;

export function memeCatalogExclusions(db: Database) {
  const version = catalogVersion();
  if (cached?.version === version) return cached;
  const result = scanMemeCatalogExclusions(db);
  if (hasDenials(db)) {
    const recorded = db.query<{ key: string }, []>(`SELECT key FROM ${denialTable}`).all();
    for (const { key } of recorded) {
      result.keys.add(key);
      result.normalizedKeys.add(key.normalize("NFKC").trim().toLowerCase());
    }
  }
  if (catalogVersion() === version) cached = { ...result, version };
  return result;
}

function currentCatalogExclusions() {
  let db: Database | undefined;
  try {
    if (cached?.version === catalogVersion()) return cached;
    db = new Database(catalogPath(), { readonly: true });
    return memeCatalogExclusions(db);
  } catch {
    // A site may configure its template service before the first catalog is installed.
  } finally {
    db?.close();
  }
}

export function isExcludedMemeCatalogKey(key: string) {
  return isExcludedMemeTemplate(key) || currentCatalogExclusions()?.keys.has(key) === true;
}

export function isExcludedMemeName(name: string) {
  return isExcludedMemeTemplate(name) || memeNameExclusion()(name);
}

export function memeNameExclusion() {
  const current = currentCatalogExclusions();
  return (name: string) => {
    if (isExcludedMemeTemplate(name)) return true;
    const normalized = name.normalize("NFKC").trim().toLowerCase();
    return (isRetiredMemeAlias(name) && !current?.aliases.has(normalized)) ||
      current?.normalizedKeys.has(normalized) === true;
  };
}
