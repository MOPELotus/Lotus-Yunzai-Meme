import type { Database } from "bun:sqlite";
import { activeCatalogTable, catalogVersion, openMemeCatalogReader, type CatalogTable } from "./catalog-file.ts";
import { isCorrectedLegacyMemeTag, isExcludedMemeTemplate, isRetiredMemeAlias } from "./template-policy.ts";

function json(source: string | null): unknown {
  if (source === null) return;
  try { return JSON.parse(source); } catch { return; }
}

function tags(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
}

const limitColumns = ["min_images", "max_images", "min_texts", "max_texts"] as const;

function record(value: unknown) {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) return value as Record<string, unknown>;
}

type CatalogMetadata = {
  key: string; tags: string | null; info: string | null; keyWords: string | null; params: string | null;
} & Record<typeof limitColumns[number], number | null>;

function matchesCorrectedArchive(row: CatalogMetadata, info: Record<string, unknown> | undefined, keywordList: unknown,
  storedTags: readonly unknown[], infoTags: readonly unknown[]) {
  const limits = limitColumns.map(name => row[name]);
  const knownTags = storedTags.length ? storedTags : infoTags;
  if (!isCorrectedLegacyMemeTag(row.key, keywordList, limits, knownTags)) return false;

  const rawParams = json(row.params);
  if (row.params !== null && (!record(rawParams) || !matchesLimits(rawParams))) return false;
  if (info?.key !== undefined && info.key !== row.key) return false;
  if (info?.params_type !== undefined && !matchesLimits(info.params_type)) return false;
  if (info?.keywords !== undefined && !isCorrectedLegacyMemeTag(row.key, info.keywords, limits, knownTags)) return false;
  return !infoTags.length || isCorrectedLegacyMemeTag(row.key, keywordList, limits, infoTags);

  function matchesLimits(value: unknown) {
    const input = record(value);
    return !!input && limitColumns.every((name, index) => input[name] === limits[index]);
  }
}

export function scanMemeCatalogExclusions(db: Database, table: CatalogTable = "meme") {
  const columns = db.query<{ name: string }, []>(`PRAGMA table_info(${table})`).all();
  const names = new Set(columns.map(column => column.name.toLowerCase()));
  const keys = new Set<string>();
  const normalizedKeys = new Set<string>();
  const aliases = new Set<string>();
  const correctedArchiveKeys = new Set<string>();
  if (names.has("key")) {
    const fields = (["tags", "info", "keyWords", "params", ...limitColumns] as const)
      .map(field => names.has(field.toLowerCase()) ? field : `NULL AS ${field}`);
    const rows = db.query<CatalogMetadata, []>(`SELECT key, ${fields.join(", ")} FROM ${table}`).all();
    for (const row of rows) {
      if (typeof row.key !== "string") continue;
      const info = record(json(row.info));
      const storedTags = tags(json(row.tags) ?? row.tags);
      const infoTags = tags(info?.tags);
      const keywords = json(row.keyWords);
      const denied = isExcludedMemeTemplate(row.key, [...storedTags, ...infoTags]);
      if (denied && !matchesCorrectedArchive(row, info, keywords, storedTags, infoTags)) {
        keys.add(row.key);
        normalizedKeys.add(row.key.normalize("NFKC").trim().toLowerCase());
      } else {
        if (denied) correctedArchiveKeys.add(row.key);
        if (Array.isArray(keywords)) for (const keyword of keywords) {
          if (typeof keyword === "string" && isRetiredMemeAlias(keyword)) aliases.add(keyword.normalize("NFKC").trim().toLowerCase());
        }
      }
    }
  }
  return { keys, normalizedKeys, aliases, correctedArchiveKeys };
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
  if (activeCatalogTable() === "meme" && hasDenials(db)) {
    const recorded = db.query<{ key: string }, []>(`SELECT key FROM ${denialTable}`).all();
    for (const { key } of recorded) {
      if (result.correctedArchiveKeys.has(key)) continue;
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
    db = openMemeCatalogReader();
    return memeCatalogExclusions(db);
  } catch {
    // A site may configure its template service before the first catalog is installed.
  } finally {
    db?.close();
  }
}

export function isExcludedMemeCatalogKey(key: string) {
  return isExcludedMemeTemplate(key) || currentCatalogExclusions()?.normalizedKeys.has(key.normalize("NFKC").trim().toLowerCase()) === true;
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
