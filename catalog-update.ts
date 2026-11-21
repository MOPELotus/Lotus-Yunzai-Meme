import { Database } from "bun:sqlite";
import { existsSync, linkSync, mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { catalogPath, catalogVersion } from "./catalog-file.ts";
import { generationServer, safeCatalogKey } from "./catalog-policy.ts";
import { isMemeOwner, type SettingsContext } from "./settings.ts";

const command = /^#?(?:表情(?:合成)?|meme)(强制)?更新(?:表情包|资源|数据)?$/iu;
const maxResponseBytes = 4 * 1024 * 1024;
const batchSize = 6;

const createTables = `
  CREATE TABLE IF NOT EXISTS meme (
    key TEXT NOT NULL PRIMARY KEY, info JSON NOT NULL, keyWords JSON NOT NULL, params JSON NOT NULL,
    min_texts INTEGER NOT NULL, max_texts INTEGER NOT NULL, min_images INTEGER NOT NULL,
    max_images INTEGER NOT NULL, defText JSON, args_type JSON, tags JSON,
    createdAt DATETIME NOT NULL, updatedAt DATETIME NOT NULL
  );
  CREATE TABLE IF NOT EXISTS preset (
    name JSON NOT NULL PRIMARY KEY, key TEXT NOT NULL, arg_name TEXT NOT NULL, arg_value TEXT NOT NULL,
    createdAt DATETIME NOT NULL, updatedAt DATETIME NOT NULL
  );`;

type Server = NonNullable<ReturnType<typeof generationServer>>;
type Presets = typeof import("./models/Meme/preset.ts").preset;

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error();
  return value as Record<string, unknown>;
}

async function fetchJSON(server: Server, route: string, signal?: AbortSignal): Promise<unknown> {
  const url = new URL(server.base);
  url.pathname = `${url.pathname.replace(/\/+$/u, "")}/memes/${route}`;
  const timeout = AbortSignal.timeout(server.timeout);
  const response = await fetch(url, {
    redirect: "error",
    headers: { Accept: "application/json" },
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!response.ok || !response.body || Number(response.headers.get("content-length")) > maxResponseBytes) {
    await response.body?.cancel();
    throw new Error();
  }
  const reader = response.body.getReader();
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const chunks: string[] = [];
    let size = 0;
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > maxResponseBytes) throw new Error();
      chunks.push(decoder.decode(result.value, { stream: true }));
    }
    return JSON.parse(chunks.join("") + decoder.decode());
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

function entryFor(key: string, value: unknown) {
  const info = record(value);
  if (info.key !== undefined && info.key !== key) throw new Error();
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

function catalogKeys(db: Database) {
  return new Set(hasTable(db, "meme") ? db.query<{ key: string }, []>("SELECT key FROM meme").all().map(({ key }) => key) : []);
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

async function initializeCatalog(signal: AbortSignal): Promise<string | undefined> {
  signal.throwIfAborted();
  const file = catalogPath();
  if (existsSync(file)) {
    const current = new Database(file, { readonly: true, strict: true });
    let empty: boolean;
    try {
      empty = !hasTable(current, "meme") || !current.query("SELECT 1 FROM meme LIMIT 1").get();
      if (!empty && hasTable(current, "preset") && current.query("SELECT 1 FROM preset LIMIT 1").get()) return;
    } finally {
      current.close();
    }
    if (!empty) {
      const { preset } = await import("./models/Meme/preset.ts");
      signal.throwIfAborted();
      if (file !== catalogPath()) return;
      const db = new Database(file, { strict: true, create: false });
      try {
        db.transaction(() => {
          // A manual or rolled-back process may have already restored presets.
          if (hasTable(db, "preset") && db.query("SELECT 1 FROM preset LIMIT 1").get()) return;
          db.exec(createTables);
          addPresets(db, catalogKeys(db), preset, new Date().toISOString());
        }).immediate();
      } finally {
        db.close();
      }
      return;
    }
  }
  if (generationServer()) return updateCatalog(true, signal);
}

async function updateCatalog(force: boolean, signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted();
  const server = generationServer();
  if (!server) return "请先配置表情合成服务。";

  const file = catalogPath();
  let db: Database | undefined;
  let stagedFile: string | undefined;
  try {
    if (existsSync(file)) db = new Database(file, { strict: true, create: false });
    const initial = db && dataVersion(db);
    const kept = db ? catalogKeys(db) : new Set<string>();
    const version = catalogVersion(file);
    const result = await fetchJSON(server, "keys", signal);
    if (!Array.isArray(result) || !result.length || result.some((key) => !safeCatalogKey(key))) throw new Error();
    const remote = new Set<string>(result);
    const required = [...remote].filter((key) => force || !kept.has(key));
    const removed = [...kept].filter((key) => !remote.has(key));
    const entries: ReturnType<typeof entryFor>[] = [];
    for (let start = 0; start < required.length; start += batchSize) {
      const pending = required.slice(start, start + batchSize).map(async (key) =>
        entryFor(key, await fetchJSON(server, `${encodeURIComponent(key)}/info`, signal)));
      const batch = await Promise.allSettled(pending);
      if (batch.some((entry) => entry.status === "rejected")) throw new Error();
      for (const entry of batch) if (entry.status === "fulfilled") entries.push(entry.value);
    }
    const { preset } = await import("./models/Meme/preset.ts");
    signal?.throwIfAborted();
    if (file !== catalogPath() || version !== catalogVersion(file) || generationServer()?.base.href !== server.base.href) throw new Error();

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
        INSERT INTO meme (key,info,keyWords,params,min_texts,max_texts,min_images,max_images,
          defText,args_type,tags,createdAt,updatedAt)
        VALUES ($key,$info,$keywords,$params,$minTexts,$maxTexts,$minImages,$maxImages,$defaults,$args,$tags,$now,$now)
        ON CONFLICT(key) DO UPDATE SET info=excluded.info,keyWords=excluded.keyWords,params=excluded.params,
          min_texts=excluded.min_texts,max_texts=excluded.max_texts,min_images=excluded.min_images,
          max_images=excluded.max_images,defText=excluded.defText,args_type=excluded.args_type,tags=excluded.tags,
          updatedAt=excluded.updatedAt`);
      for (const row of entries) put.run({ ...row, now });
      const drop = target.query("DELETE FROM meme WHERE key = ?");
      for (const key of removed) drop.run(key);

      return addPresets(target, remote, preset, now);
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

let refreshing: Promise<string | undefined> | undefined;

function runRefresh<T extends string | undefined>(run: () => Promise<T>): Promise<T> {
  const pending = run().finally(() => { refreshing = undefined; });
  refreshing = pending;
  return pending;
}

export function runAutomaticCatalogRefresh(signal: AbortSignal, startup = false) {
  if (refreshing) return refreshing.then(() => undefined, () => undefined);
  return runRefresh(async () => {
    if (startup) return initializeCatalog(signal);
    if (generationServer()) return updateCatalog(false, signal);
  });
}

export function handleCatalogUpdate(message: string, context: SettingsContext, signal?: AbortSignal): Promise<string> | string | undefined {
  const match = command.exec(message.trim());
  if (!match) return;
  if (!isMemeOwner(context)) return "只有主人才能更新表情包数据";
  if (refreshing) return "表情包数据更新中。";
  return runRefresh(() => updateCatalog(match[1] !== undefined, signal))
    .catch(() => "表情包数据更新失败，旧目录仍可使用。");
}
