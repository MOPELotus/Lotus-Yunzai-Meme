import { Database } from "bun:sqlite";
import { existsSync, linkSync, mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { catalogPath, catalogVersion, nativeCatalogTable } from "./catalog-file.ts";
import { memeProvider, safeCatalogKey, sameMemeProvider } from "./catalog-policy.ts";
import { isMemeOwner, type SettingsContext } from "./settings.ts";
import { keepMemeCatalogDenials, scanMemeCatalogExclusions } from "./catalog-exclusions.ts";
import { isExcludedMemeTemplate } from "./template-policy.ts";

const command = /^#?(?:表情(?:合成)?|meme)(强制)?更新(?:表情包|资源|数据)?$/iu;
const batchSize = 6;

const createTables = `
  CREATE TABLE IF NOT EXISTS ${nativeCatalogTable} (
    key TEXT NOT NULL PRIMARY KEY, info JSON NOT NULL, keyWords JSON NOT NULL, params JSON NOT NULL,
    min_texts INTEGER NOT NULL, max_texts INTEGER NOT NULL, min_images INTEGER NOT NULL,
    max_images INTEGER NOT NULL, defText JSON, args_type JSON, tags JSON,
    createdAt DATETIME NOT NULL, updatedAt DATETIME NOT NULL
  );
  CREATE TABLE IF NOT EXISTS preset (
    name JSON NOT NULL PRIMARY KEY, key TEXT NOT NULL, arg_name TEXT NOT NULL, arg_value TEXT NOT NULL,
    createdAt DATETIME NOT NULL, updatedAt DATETIME NOT NULL
  );`;

type Presets = typeof import("./models/Meme/preset.ts").preset;

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error();
  return value as Record<string, unknown>;
}

function entryFor(key: string, value: unknown) {
  const info = record(value);
  if (info.key !== undefined && info.key !== key) throw new Error();
  if (isExcludedMemeTemplate(key, Array.isArray(info.tags) ? info.tags : [info.tags])) return;
  if (!Array.isArray(info.keywords) || info.keywords.some((word) => typeof word !== "string")) throw new Error();
  const params = record(info.params_type);
  const { min_texts, max_texts, min_images, max_images } = params;
  const counts = [min_texts, max_texts, min_images, max_images];
  if (counts.some((n) => typeof n !== "number" || !Number.isSafeInteger(n) || n < 0) ||
      Number(min_texts) > Number(max_texts) || Number(min_images) > Number(max_images)) throw new Error();
  return {
    key, info: JSON.stringify(info), keywords: JSON.stringify(info.keywords), params: JSON.stringify(params),
    minTexts: Number(min_texts), maxTexts: Number(max_texts), minImages: Number(min_images), maxImages: Number(max_images),
    defaults: JSON.stringify(params.default_texts ?? null), args: JSON.stringify(params.args_type ?? null),
    tags: JSON.stringify(info.tags ?? null),
  };
}

function dataVersion(db: Database): number {
  return db.query<{ data_version: number }, []>("PRAGMA data_version").get()!.data_version;
}

function hasTable(db: Database, name: string) {
  return db.query("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?").get(name) !== null;
}

function localCatalogKeys(db: Database) {
  return new Set(hasTable(db, nativeCatalogTable)
    ? db.query<{ key: string }, []>(`SELECT key FROM ${nativeCatalogTable}`).all().map(({ key }) => key)
    : []);
}

function storedCatalogIdentity(db: Database) {
  if (hasTable(db, "lotus_catalog_provider")) {
    return db.query<{ identity: string }, []>("SELECT identity FROM lotus_catalog_provider WHERE id = 1").get()?.identity;
  }
}

function addPresets(db: Database, keys: ReadonlySet<string>, presets: Presets, now: string) {
  const insert = db.query(`INSERT INTO preset(name,key,arg_name,arg_value,createdAt,updatedAt)
    VALUES (?,?,?,?,?,?) ON CONFLICT(name) DO NOTHING`);
  let count = 0;
  for (const item of presets) {
    if (keys.has(item.key)) {
      count += insert.run(JSON.stringify(item.name), item.key, item.arg_name, String(item.arg_value), now, now).changes;
    }
  }
  return count;
}

async function updateCatalog(force: boolean, signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted();
  const provider = memeProvider();
  if (!provider) return "本机表情模板尚未就绪。";

  const file = catalogPath();
  let db: Database | undefined;
  let stagedFile: string | undefined;
  try {
    if (existsSync(file)) db = new Database(file, { strict: true, create: false });
    const initial = db && dataVersion(db);
    const { catalogIdentity } = provider;
    const kept = db ? localCatalogKeys(db) : new Set<string>();
    const excluded = db ? scanMemeCatalogExclusions(db, nativeCatalogTable).keys : new Set<string>();
    const version = catalogVersion(file);
    const sourceChanged = !db || storedCatalogIdentity(db) !== catalogIdentity || !hasTable(db, "preset");
    const result = await provider.keys(signal);
    if (!Array.isArray(result) || !result.length || result.some((key) => !safeCatalogKey(key))) throw new Error();
    const local = new Set<string>();
    for (const key of result) {
      if (isExcludedMemeTemplate(key)) excluded.add(key);
      else local.add(key);
    }
    const required = [...local].filter((key) => force || sourceChanged || !kept.has(key) || excluded.has(key));
    const entries: NonNullable<ReturnType<typeof entryFor>>[] = [];
    for (let start = 0; start < required.length; start += batchSize) {
      const pending = required.slice(start, start + batchSize).map(async (key) => ({
        key, row: entryFor(key, await provider.info(key, signal)),
      }));
      const batch = await Promise.allSettled(pending);
      if (batch.some((entry) => entry.status === "rejected")) throw new Error();
      for (const entry of batch) if (entry.status === "fulfilled") {
        if (entry.value.row) entries.push(entry.value.row);
        else {
          excluded.add(entry.value.key);
          local.delete(entry.value.key);
        }
      }
    }
    const removed = [...kept].filter((key) => !local.has(key));
    const { preset } = await import("./models/Meme/preset.ts");
    signal?.throwIfAborted();
    if (file !== catalogPath() || version !== catalogVersion(file) || !sameMemeProvider(provider, memeProvider())) throw new Error();

    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    if (!db) {
      stagedFile = `${file}.${crypto.randomUUID()}.tmp`;
      db = new Database(stagedFile, { create: true, strict: true });
    }
    const target = db;
    const now = new Date().toISOString();
    const added = target.transaction(() => {
      if (initial !== undefined && dataVersion(target) !== initial) throw new Error();
      target.exec(createTables);
      const put = target.query(`
        INSERT INTO ${nativeCatalogTable} (key,info,keyWords,params,min_texts,max_texts,min_images,max_images,
          defText,args_type,tags,createdAt,updatedAt)
        VALUES ($key,$info,$keywords,$params,$minTexts,$maxTexts,$minImages,$maxImages,$defaults,$args,$tags,$now,$now)
        ON CONFLICT(key) DO UPDATE SET info=excluded.info,keyWords=excluded.keyWords,params=excluded.params,
          min_texts=excluded.min_texts,max_texts=excluded.max_texts,min_images=excluded.min_images,
          max_images=excluded.max_images,defText=excluded.defText,args_type=excluded.args_type,tags=excluded.tags,
          updatedAt=excluded.updatedAt`);
      for (const row of entries) put.run({ ...row, now });
      const drop = target.query(`DELETE FROM ${nativeCatalogTable} WHERE key = ?`);
      for (const key of removed) drop.run(key);
      // Preserve the old shared data and record denied legacy catalog entries before using the local view.
      for (const key of scanMemeCatalogExclusions(target).keys) excluded.add(key);
      keepMemeCatalogDenials(target, excluded);
      target.exec("CREATE TABLE IF NOT EXISTS lotus_catalog_provider (id INTEGER PRIMARY KEY, identity TEXT NOT NULL)");
      target.query("INSERT OR REPLACE INTO lotus_catalog_provider VALUES (1, ?)").run(catalogIdentity);

      return addPresets(target, local, preset, now);
    }).immediate();
    if (stagedFile) {
      target.close();
      db = undefined;
      linkSync(stagedFile, file);
    }
    return `表情包数据更新完成，更新 ${entries.length} 项，移除 ${removed.length} 项，补齐预设 ${added} 项。`;
  } finally {
    db?.close();
    if (stagedFile) rmSync(stagedFile, { force: true });
  }
}

const refreshes = new Map<string, Promise<string | undefined>>();

function runRefresh<T extends string | undefined>(key: string, run: () => Promise<T>): Promise<T> {
  const pending = run().finally(() => { refreshes.delete(key); });
  refreshes.set(key, pending);
  return pending;
}

export function initializeLocalCatalog(signal?: AbortSignal) {
  if (signal?.aborted) return;
  const provider = memeProvider();
  if (!provider) return;
  const file = catalogPath();
  const pending = refreshes.get(file);
  if (pending) return pending;
  if (existsSync(file)) {
    const db = new Database(file, { readonly: true });
    try {
      if (hasTable(db, nativeCatalogTable) && hasTable(db, "preset") && storedCatalogIdentity(db) === provider.catalogIdentity &&
          db.query(`SELECT 1 FROM ${nativeCatalogTable} LIMIT 1`).get()) return;
    } finally {
      db.close();
    }
  }
  return runRefresh(file, () => updateCatalog(true, signal));
}

export function prepareLocalCatalog(signal?: AbortSignal): Promise<void> | undefined {
  const warn = (error: unknown) => {
    if (!signal?.aborted) console.warn("[meme] 首次本机表情目录更新失败。", error);
  };
  try {
    return initializeLocalCatalog(signal)?.then(() => undefined, warn);
  } catch (error) {
    warn(error);
  }
}

export function handleCatalogUpdate(message: string, context: SettingsContext, signal?: AbortSignal): Promise<string> | string | undefined {
  const match = command.exec(message.trim());
  if (!match) return;
  if (!isMemeOwner(context)) return "只有主人才能更新表情包数据";
  const file = catalogPath();
  if (refreshes.has(file)) return "表情包数据更新中。";
  return runRefresh(file, () => updateCatalog(match[1] !== undefined, signal))
    .catch(() => "表情包数据更新失败，旧目录仍可使用。");
}
