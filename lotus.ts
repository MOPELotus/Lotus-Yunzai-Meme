import { Database } from "bun:sqlite";
import { catalogPath, catalogVersion } from "./catalog-file.ts";
import { catalogPolicy, generationServer } from "./catalog-policy.ts";
import { argsTypeFromParams, parseGenerationArgs, type PresetArgument } from "./generation-args.ts";
import { buildGenerationBody, type GenerationInput } from "./generation.ts";
import { generateMemeReply, type FallbackContext } from "./generate-reply.ts";

import { handleMemeSettings } from "./settings.ts";
import { handleCatalogUpdate } from "./catalog-update.ts";
import { startCatalogRuntime, type MemeRuntime } from "./catalog-runtime.ts";

export { createProfileLikeImageRenderer } from "./profile-like-image.ts";

const pageSize = 12;

// A legacy disable entry may be a stored key or one of its keywords.
const visibleCatalog = `FROM meme
  WHERE NOT EXISTS (
    SELECT 1 FROM json_each(?) AS disabled
    WHERE disabled.value = meme.key
       OR disabled.value IN (
         SELECT value FROM json_each(CASE WHEN json_valid(meme.keyWords) THEN meme.keyWords ELSE '[]' END)
       )
  )`;

interface CatalogContext {
  readonly user_id?: number;
}

interface CatalogRow {
  key: string;
  keyWords: string;
}

interface CatalogDetails extends CatalogRow {
  min_images: number;
  max_images: number;
  min_texts: number;
  max_texts: number;
}

function keywords(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((word) => typeof word === "string") : [];
  } catch {
    return [];
  }
}

function currentPolicy(userId: number | undefined, forGeneration = false) {
  let policy: ReturnType<typeof catalogPolicy>;
  try {
    policy = catalogPolicy(userId, forGeneration);
  } catch {
    return "无法读取表情配置，请检查 meme.yaml 和 access.yaml。";
  }
  if (!policy.enabled) return "表情模块已停用。";
  if (!policy.allowed) return "当前用户无权使用表情模块。";
  return policy;
}

function withCatalog<T>(query: (db: Database) => T): T | string {
  let db: Database | undefined;
  try {
    db = new Database(catalogPath(), { readonly: true });
    return query(db);
  } catch {
    return "无法读取表情目录，请检查 LOTUS_MEME_DB 和本机导入的旧数据库。";
  } finally {
    db?.close();
  }
}

function queryCatalog<T>(
  userId: number | undefined,
  query: (db: Database, hidden: string) => T,
): T | string {
  const policy = currentPolicy(userId);
  if (typeof policy === "string") return policy;
  return withCatalog((db) => query(db, JSON.stringify(policy.hidden)));
}

function list(argument: string, context?: CatalogContext): string {
  const page = Number(argument || "1");
  if (!Number.isSafeInteger(page) || page < 1) return "用法：#表情列表 [页码]";

  return queryCatalog(context?.user_id, (db, hidden) => db.transaction(() => {
    const { total } = db.query<{ total: number }, [string]>(`SELECT COUNT(*) AS total ${visibleCatalog}`).get(hidden)!;
    if (total === 0) return "表情目录为空。";
    const pages = Math.ceil(total / pageSize);
    if (page > pages) return `表情目录共有 ${pages} 页。`;

    const rows = db.query<CatalogRow, [string, number, number]>(
      `SELECT key, keyWords ${visibleCatalog} ORDER BY key LIMIT ? OFFSET ?`,
    ).all(hidden, pageSize, (page - 1) * pageSize);
    return [
      `表情列表 ${page}/${pages}（共 ${total} 项）`,
      ...rows.map((row) => {
        const aliases = keywords(row.keyWords).filter((word) => word !== row.key).slice(0, 3);
        return aliases.length ? `${row.key} · ${aliases.join("、")}` : row.key;
      }),
      "#表情详情 <编号> 查看素材需要",
    ].join("\n");
  })());
}

const detailsFields = "key, keyWords, min_images, max_images, min_texts, max_texts";

function sameKeyword(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function requireTextMatch(row: TriggerRow, text: string): boolean {
  if (row.min_texts !== 0 || row.max_texts !== 0 || !text) return true;

  return /^(@\s*\d+\s*)+$/u.test(text) || /^(#\S+\s+[^#]+(?:\s+#\S+\s+[^#]+)*)$/u.test(text);
}

type TriggerRow = Pick<CatalogDetails, "key" | "keyWords" | "min_texts" | "max_texts">;

interface TriggerMatch {
  readonly row: TriggerRow;
  readonly keyword: string;
  readonly preset?: PresetArgument;
}

function legacyPresetKeyword(value: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed === "string" && parsed.trim()) return parsed;
  } catch {
    // Incomplete rows in a local copy are ignored.
  }
}

function findPreset(db: Database, input: string): TriggerMatch | undefined {
  if (!db.query("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'preset'").get()) return;

  const presets = db.query<TriggerRow & { name: string; arg_name: string; arg_value: string }, []>(
    `SELECT meme.key, keyWords, min_texts, max_texts,
       preset.name, preset.arg_name, preset.arg_value
     FROM preset JOIN meme ON preset.key = meme.key
     ORDER BY preset.name, meme.key`,
  ).all();
  let match: TriggerMatch | undefined;
  for (const row of presets) {
    const keyword = legacyPresetKeyword(row.name);
    if (!keyword || keyword.length <= (match?.keyword.length ?? 0) || !row.arg_name ||
        !sameKeyword(input.slice(0, keyword.length), keyword)) continue;
    match = { row, keyword, preset: { name: row.arg_name, value: row.arg_value } };
  }
  return match;
}

export function resolveMemeTrigger(
  message: string,
  context?: CatalogContext,
): { readonly key: string; readonly keyword: string; readonly text: string } | string | undefined {
  const match = resolveTrigger(message, context);
  if (!match || typeof match === "string") return match;
  return { key: match.row.key, keyword: match.keyword, text: match.text };
}

function resolveTrigger(message: string, context?: CatalogContext, withParams = false) {
  const input = message.trim();
  const policy = currentPolicy(context?.user_id, true);
  if (typeof policy === "string") return policy;
  if (policy.forceSharp && !input.startsWith("#")) return;
  const candidate = input.startsWith("#") ? input.slice(1) : input;
  if (!candidate) return;

  return withCatalog((db) => {
    const version = withParams ? catalogVersion() : undefined;
    // Select the old keyword before checking whether its template is hidden, so
    // a disabled longer trigger cannot fall through to a shorter template.
    const rows = db.query<TriggerRow, []>("SELECT key, keyWords, min_texts, max_texts FROM meme ORDER BY key").all();
    let match: TriggerMatch | undefined;
    for (const row of rows) {
      for (const keyword of keywords(row.keyWords)) {
        if (keyword.length <= (match?.keyword.length ?? 0)) continue;
        if (sameKeyword(candidate.slice(0, keyword.length), keyword)) match = { row, keyword };
      }
    }
    match ??= findPreset(db, candidate);
    if (!match) return;
    if (match.preset && policy.hidden.includes(match.keyword)) return;

    const visible = db.query<{ key: string }, [string, string]>(
      `SELECT key ${visibleCatalog} AND key = ?`,
    ).get(JSON.stringify(policy.hidden), match.row.key);
    if (!visible) return;

    const text = candidate.slice(match.keyword.length).trim();
    const textMatches = requireTextMatch(match.row, text);
    const mayHaveFlags = !textMatches && /(?:^|\s)--?\w/u.test(text);
    if (!textMatches && !mayHaveFlags) return;
    const params = withParams || mayHaveFlags
      ? db.query<{ params: string }, [string]>("SELECT params FROM meme WHERE key = ?").get(visible.key)
      : undefined;
    if (!textMatches) {
      const args = parseGenerationArgs(argsTypeFromParams(params?.params), text.replace(/@\s*\d+/gu, "").trim());
      if (!args.found || args.text) return;
    }
    return { ...match, text, params: params?.params, version };
  });
}

type ResolvedTrigger = Exclude<ReturnType<typeof resolveTrigger>, string | undefined>;

function prepareResolvedRequest(match: ResolvedTrigger, input: GenerationInput) {
  return buildGenerationBody(match.row.key, keywords(match.row.keyWords), match.text, match.params, input, match.preset);
}

export async function prepareMemeRequest(message: string, input: GenerationInput) {
  const match = resolveTrigger(message, input, true);
  if (!match || typeof match === "string") return match;
  return prepareResolvedRequest(match, input);
}

function details(key: string, context?: CatalogContext): string {
  if (!key) return "用法：#表情详情 <编号或关键词>";

  return queryCatalog(context?.user_id, (db, hidden) => {
    let row = db.query<CatalogDetails, [string, string]>(
      `SELECT ${detailsFields} ${visibleCatalog} AND key = ?`,
    ).get(hidden, key);
    if (!row && !db.query("SELECT 1 FROM meme WHERE key = ?").get(key)) {
      const known = db.query<CatalogDetails, [string]>(
        `SELECT ${detailsFields} ${visibleCatalog} ORDER BY key`,
      ).all(hidden);
      const matches = known.filter((item) => keywords(item.keyWords).some((word) => sameKeyword(word, key)));
      if (matches.length > 1) return "该关键词对应多个表情，请用编号查询。";
      row = matches[0] ?? null;
    }
    if (!row) return "没有找到对应表情，发送 #表情列表 查看编号。";

    const aliases = keywords(row.keyWords);
    return [
      `表情 ${row.key}`,
      ...(aliases.length ? [`关键词：${aliases.join("、")}`] : []),
      `图片：${row.min_images}–${row.max_images} 张`,
      `文字：${row.min_texts}–${row.max_texts} 段`,
    ].join("\n");
  });
}

function createMemeCommands(signal?: AbortSignal) {
  return {
    fallback: (message: string, context: FallbackContext) => memeFallback(message, context, signal),
    commands: { "#表情列表": list, "#表情详情": details },
  };
}

async function memeFallback(message: string, context: FallbackContext, signal?: AbortSignal) {
  const setting = handleMemeSettings(message, context);
  if (setting !== undefined) return setting;
  const update = handleCatalogUpdate(message, context, signal);
  if (update !== undefined) return update;
  if (context.user_id === undefined || context.message_type === "terminal") return;
  let server: ReturnType<typeof generationServer>;
  try {
    server = generationServer();
  } catch {
    return;
  }
  if (!server) return;
  const match = resolveTrigger(message, context, true);
  if (!match || typeof match === "string") return;
  return generateMemeReply(context, async (input) => {
    // Media lookup can yield while the local catalog or configuration changes.
    if (match.version !== catalogVersion()) return prepareMemeRequest(message, input);
    const policy = currentPolicy(input.user_id, true);
    if (typeof policy === "string") return policy;
    if (policy.forceSharp && !message.trimStart().startsWith("#")) return;
    const names = [match.row.key, match.keyword, ...keywords(match.row.keyWords)];
    if (names.some((name) => policy.hidden.includes(name))) return;
    return prepareResolvedRequest(match, input);
  }, server);
}

export default createMemeCommands();

export function createModule({ signal, memeRuntime }: { readonly signal: AbortSignal; readonly memeRuntime?: MemeRuntime }) {
  const lifecycle = new AbortController();
  const active = AbortSignal.any([signal, lifecycle.signal]);
  const stop = memeRuntime && startCatalogRuntime(memeRuntime, active);
  return {
    ...createMemeCommands(active),
    async dispose() {
      lifecycle.abort();
      await stop?.();
    },
  };
}
