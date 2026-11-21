import { Database } from "bun:sqlite";
import type { CatalogCardRow, CatalogPngRenderer } from "./catalog-card.ts";
import { catalogPath, catalogVersion } from "./catalog-file.ts";
import { catalogPolicy, generationServer } from "./catalog-policy.ts";
import { argsTypeFromParams, parseGenerationArgs, type PresetArgument } from "./generation-args.ts";
import { buildGenerationBody, type GenerationInput } from "./generation.ts";
import { generateMemeReply, requestMemePreview, type FallbackContext } from "./generate-reply.ts";

import { handleMemeSettings } from "./settings.ts";
import { handleCatalogUpdate } from "./catalog-update.ts";
import { startCatalogRuntime, type MemeRuntime } from "./catalog-runtime.ts";
import { readMemeUsage } from "./usage.ts";
import { createMemePokeHandler } from "./poke.ts";

export { createProfileLikeImageRenderer } from "./profile-like-image.ts";
export type { MemePokeContext } from "./poke.ts";

const pageSize = 12;
const catalogList = /^#?(?:表情(?:合成)?|meme)列表$/iu;
const catalogDetail = /^#?(?:表情(?:合成)?|meme)\s*详情\s*([^\r\n]+)$/iu;
const catalogSearch = /^#?(?:表情(?:合成)?|meme)搜索([^\r\n]*)$/iu;
const randomMemeCommand = /^#?(?:表情|meme)?随机(?:表情|meme)包?$/iu;
const usageCommand = /^#?(?:表情|meme)(?:调用)?统计$/iu;

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
  params?: string;
  defText?: string;
  args_type?: string;
  info?: string;
  tags?: string;
}

function json(value: string | undefined): unknown {
  if (!value) return;
  try { return JSON.parse(value); } catch { return; }
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((part): part is string => typeof part === "string") : [];
}

function keywords(value: string): string[] {
  return stringArray(json(value));
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
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


function sameKeyword(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function requireTextMatch(row: TriggerRow, text: string): boolean {
  if (row.min_texts !== 0 || row.max_texts !== 0 || !text) return true;

  return /^(@\s*\d+\s*)+$/u.test(text) || /^(#\S+\s+[^#]+(?:\s+#\S+\s+[^#]+)*)$/u.test(text);
}

function illustratedCatalog(render?: CatalogPngRenderer, signal?: AbortSignal) {
  let rendered: { signature: string; cards: Promise<{ type: "image"; file: Uint8Array }[]> } | undefined;

  async function pictures(argument: string, context?: CatalogContext) {
    if (signal?.aborted) return;
    if (!render) return list(argument, context);
    const policy = currentPolicy(context?.user_id);
    if (typeof policy === "string") return policy;
    try {
      const version = catalogVersion();
      const hidden = JSON.stringify(policy.hidden);
      const signature = JSON.stringify([version, hidden]);
      if (!rendered || rendered.signature !== signature) {
        const rows = withCatalog((db) => db.query<CatalogDetails, [string]>(
          `SELECT * ${visibleCatalog} ORDER BY key`,
        ).all(hidden).flatMap((item): CatalogCardRow[] => {
          const keyword = keywords(item.keyWords)[0];
          if (!keyword) return [];
          const types: CatalogCardRow["types"][number][] = [];
          if (item.min_texts > 0) types.push("text");
          if (item.min_images > 0) types.push("image");
          if ((argsTypeFromParams(item.params) ?? json(item.args_type)) != null) types.push("arg");
          return [{ keyword, types }];
        }));
        if (typeof rows === "string") return rows;
        if (!rows.length) return list(argument, context);
        const cards = (async () => {
          const { renderCatalogCard, rowsPerCatalogCard } = await import("./catalog-card.ts");
          const replies: { type: "image"; file: Uint8Array }[] = [];
          for (let offset = 0; offset < rows.length; offset += rowsPerCatalogCard) {
            signal?.throwIfAborted();
            const { png } = await renderCatalogCard(rows.slice(offset, offset + rowsPerCatalogCard), offset, rows.length, render);
            replies.push({ type: "image", file: png });
          }
          return replies;
        })();
        rendered = { signature, cards };
        void cards.catch(() => { if (rendered?.cards === cards) rendered = undefined; });
      }
      const cards = await rendered.cards;
      if (signal?.aborted) return;
      const current = currentPolicy(context?.user_id);
      if (typeof current === "string") return current;
      if (catalogVersion() !== version || JSON.stringify(current.hidden) !== hidden) {
        return "表情目录已更新，请重新查看列表。";
      }
      return cards.length === 1 ? cards[0] : { type: "forward" as const, nodes: cards, batchSize: 2 };
    } catch {
      if (!signal?.aborted) return list(argument, context);
    }
  }

  return (argument: string, context?: CatalogContext) => !render || argument.trim()
    ? list(argument, context) : pictures(argument, context);
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

async function details(argument: string, context?: CatalogContext, signal?: AbortSignal) {
  const key = argument.trim();
  if (!key) return "用法：#表情详情 <编号或关键词>";
  if (signal?.aborted) return;

  let version: string;
  try { version = catalogVersion(); } catch { return "无法读取表情目录，请检查本机导入的旧数据库。"; }
  const entry = queryCatalog(context?.user_id, (db, hidden) => {
    let row = db.query<CatalogDetails, [string, string]>(
      `SELECT * ${visibleCatalog} AND key = ?`,
    ).get(hidden, key);
    if (!row && !db.query("SELECT 1 FROM meme WHERE key = ?").get(key)) {
      const known = db.query<CatalogDetails, [string]>(`SELECT * ${visibleCatalog} ORDER BY key`).all(hidden);
      const matches = known.filter((item) => keywords(item.keyWords).some((word) => sameKeyword(word, key)));
      if (matches.length > 1) return "该关键词对应多个表情，请用编号查询。";
      row = matches[0] ?? null;
    }
    if (!row) return "没有找到对应表情，发送 #表情列表 查看编号。";

    const params = record(json(row.params));
    const aliases = keywords(row.keyWords);
    const defaults = stringArray(json(row.defText) ?? params.default_texts);
    const tags = stringArray(json(row.tags) ?? record(json(row.info)).tags);
    const args = record(record(record(params.args_type ?? json(row.args_type)).args_model).properties);
    const options = Object.entries(args).flatMap(([name, field]) => {
      if (name === "user_infos") return [];
      const { description } = record(field);
      return [typeof description === "string" && description.trim() ? `[${name}: ${description}]` : `[${name}]`];
    });
    const hasPresets = db.query("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'preset'").get();
    const disabled = new Set(keywords(hidden));
    const presets = !hasPresets ? [] : db.query<{ name: string }, [string]>("SELECT name FROM preset WHERE key = ? ORDER BY rowid")
      .all(row.key).flatMap(({ name }) => legacyPresetKeyword(name) ?? []).filter(name => !disabled.has(name));
    return { row, aliases, defaults, tags, options, presets };
  });
  if (typeof entry === "string") return entry;
  const { row, aliases, defaults, tags, options, presets } = entry;
  const format = (values: readonly string[]) => values.length ? values.map(value => `[${value}]`).join(" ") : "[无]";
  const text = [
    `表情 ${row.key}`,
    `关键词：${format(aliases)}`,
    `图片：${row.min_images}–${row.max_images} 张`,
    `文字：${row.min_texts}–${row.max_texts} 段`,
    `默认文本：${format(defaults)}`,
    `标签：${format(tags)}`,
    ...(options.length ? [`可选参数：${options.join(" ")}`] : []),
    `参数命令：${format(presets)}`,
    "预览图片：",
  ].join("\n");
  const failure = `${text}\n预览图片加载失败`;
  let server: ReturnType<typeof generationServer>;
  try { server = generationServer(); } catch { return failure; }
  if (!server) return failure;
  const preview = await requestMemePreview(row.key, server, signal);
  if (signal?.aborted) return;
  const policy = currentPolicy(context?.user_id);
  if (typeof policy === "string") return policy;
  if ([row.key, ...aliases].some(name => policy.hidden.includes(name))) return "没有找到对应表情，发送 #表情列表 查看编号。";
  try {
    if (version !== catalogVersion()) return "表情目录已更新，请重新查看详情。";
    if (server.base.href !== generationServer()?.base.href) return failure;
  } catch { return failure; }
  return {
    type: "quoted" as const,
    message: preview ? [text + "\n", { type: "image" as const, file: preview }] : failure,
  };
}

function search(argument: string, context?: CatalogContext) {
  const keyword = argument.trim().toLowerCase();
  if (!keyword) return "用法：#表情搜索 <关键词>";
  const matches = queryCatalog(context?.user_id, (db, hidden) => {
    const rows = db.query<Pick<CatalogRow, "keyWords">, [string]>(`SELECT keyWords ${visibleCatalog}`).all(hidden);
    return [...new Set(rows.flatMap((row) => keywords(row.keyWords)).filter((word) => word.toLowerCase().includes(keyword)))].sort();
  });
  if (typeof matches === "string") return matches;
  if (!matches.length) return "没有找到匹配的表情关键词。";
  const lines = matches.map((word, index) => `${index + 1}. ${word}`);
  const text = (lines: readonly string[]) => [{ type: "text" as const, text: lines.join("\n") }];
  if (lines.length <= 30) return { type: "quoted" as const, message: text(lines) };
  const nodes = [text([`表情搜索 · ${lines.length} 个关键词`])];
  for (let index = 0; index < lines.length; index += 30) nodes.push(text(lines.slice(index, index + 30)));
  return { type: "forward" as const, nodes };
}

async function prepareRandomMeme(message: string, input: GenerationInput) {
  const policy = currentPolicy(input.user_id, true);
  if (typeof policy === "string") return policy;
  if (policy.forceSharp && !message.startsWith("#")) return;

  const row = withCatalog((db) => {
    const hasLegacyDefaults = db.query<{ name: string }, []>("PRAGMA table_info(meme)").all()
      .some(({ name }) => name.toLowerCase() === "deftext");
    const defaults = hasLegacyDefaults
      ? "json_array_length(CASE WHEN json_valid(defText) THEN defText END)"
      : "json_array_length(CASE WHEN json_valid(params) THEN params END, '$.default_texts')";
    return db.query<CatalogRow & { params: string }, [string]>(`
      SELECT key, keyWords, params ${visibleCatalog}
      AND ((min_texts = 1 AND max_texts = 1) OR (min_images = 1 AND max_images = 1))
      AND json_valid(params)
      AND ${defaults} > 0
      ORDER BY random() LIMIT 1
    `).get(JSON.stringify(policy.hidden));
  });
  if (typeof row === "string") return row;
  if (!row) return "未找到可用的随机表情。";

  const aliases = keywords(row.keyWords);
  const prepared = await buildGenerationBody(row.key, aliases, "", row.params, input);
  if (typeof prepared === "string") return prepared;
  return {
    ...prepared,
    summary: `本次随机表情信息如下\n表情的名称：${row.key}\n表情的别名：${aliases.map((word) => `[${word}]`).join(" ") || "[无]"}\n`,
  };
}

function selectPokeTemplates(hidden: readonly string[]) {
  return withCatalog(db => db.query<CatalogRow & { params: string }, [string]>(`
    SELECT key, keyWords, params ${visibleCatalog}
    AND min_images = 1 AND max_images = 1 AND min_texts = 0 AND max_texts = 0
    AND json_valid(params)
    ORDER BY random() LIMIT 2
  `).all(JSON.stringify(hidden)).map(row => ({ key: row.key, aliases: keywords(row.keyWords), params: row.params })));
}

async function usageReport(context: CatalogContext) {
  const report = queryCatalog(context.user_id, (db, hidden) => {
    const counts = readMemeUsage(db);
    if (counts.size === 0) return;
    const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
    const rows = db.query<CatalogRow, [string]>(`SELECT key, keyWords ${visibleCatalog} ORDER BY key`).all(hidden)
      .flatMap(({ key, keyWords }) => {
        const aliases = keywords(keyWords);
        const count = counts.get(key);
        return count === undefined || aliases.length === 0 ? [] : [{ keywords: aliases.join(", "), count }];
      }).sort((left, right) => right.count - left.count);
    return { total, rows };
  });
  if (typeof report === "string") return report;
  if (!report) return "当前没有统计数据";
  try {
    const { renderUsageCard } = await import("./usage-card.ts");
    const images: { type: "image"; file: Uint8Array }[] = [];
    const perCard = 100;
    for (let offset = 0; offset < Math.max(1, report.rows.length); offset += perCard) {
      const result = await renderUsageCard(report.total, report.rows.slice(offset, offset + perCard));
      images.push({ type: "image", file: result.png });
    }
    return images.length === 1 ? images[0]! : { type: "forward" as const, nodes: images.map((image) => [image]) };
  } catch {
    return "表情调用统计图片生成失败，请稍后重试。";
  }
}

function createMemeCommands(signal?: AbortSignal, renderCatalogPng?: CatalogPngRenderer) {
  const listCatalog = illustratedCatalog(renderCatalogPng, signal);
  return {
    fallback: (message: string, context: FallbackContext) => memeFallback(message, context, listCatalog, signal),
    commands: {
      "#表情列表": listCatalog, "#表情详情": (argument: string, context?: CatalogContext) => details(argument, context, signal), "#表情搜索": search,
      "#表情统计": (_argument: string, context: CatalogContext) => usageReport(context),
    },
  };
}

async function memeFallback(message: string, context: FallbackContext, listCatalog: ReturnType<typeof illustratedCatalog>,
  signal?: AbortSignal) {
  const input = message.trim();
  if (catalogList.test(input)) return listCatalog("", context);
  const detailMatch = catalogDetail.exec(input);
  if (detailMatch) return details(detailMatch[1] ?? "", context, signal);
  const searchMatch = catalogSearch.exec(input);
  if (searchMatch) return search(searchMatch[1] ?? "", context);
  if (usageCommand.test(input)) return usageReport(context);
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
  if (randomMemeCommand.test(input)) {
    const policy = currentPolicy(context.user_id, true);
    if (typeof policy === "string") return policy;
    if (policy.forceSharp && !input.startsWith("#")) return;
    return generateMemeReply(context, (media) => prepareRandomMeme(input, media), server);
  }
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
    ...createMemeCommands(active, memeRuntime?.renderCatalogPng),
    handlePoke: createMemePokeHandler(active, selectPokeTemplates),
    async dispose() {
      lifecycle.abort();
      await stop?.();
    },
  };
}
