import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("meme", messageCatalog.messages);
import type { Database } from "bun:sqlite";
import type { CatalogCardRow } from "./catalog-card.ts";
import type { LoadMemeInfoCard } from "./info-card-runtime.ts";
import { catalogVersion, openMemeCatalogReader } from "./catalog-file.ts";
import { catalogPolicy, memeProvider, sameMemeProvider } from "./catalog-policy.ts";
import { argsTypeFromParams, parseGenerationArgs, type PresetArgument } from "./generation-args.ts";
import { buildGenerationBody, type GenerationInput } from "./generation.ts";
import { generateMemeReply, requestMemePreview, type FallbackContext } from "./generate-reply.ts";

import { handleMemeSettings, isMemeOwner } from "./settings.ts";
import { helpReference, presentMemeReference } from "./reference-card.ts";
import { presentMemeVersion } from "./version-card.ts";
import { handleCatalogUpdate, prepareLocalCatalog } from "./catalog-update.ts";
import { startCatalogRuntime, type MemeRuntime } from "./catalog-runtime.ts";
import { readMemeUsage } from "./usage.ts";
import { memeCatalogExclusions } from "./catalog-exclusions.ts";
import { excludedMemeTemplateMessage, isExcludedMemeTemplate } from "./template-policy.ts";
import { createLocalMemeBackend, matchesLocalMemeTrigger, nativeShortcutPattern } from "./backend-lifecycle.ts";
import { matchFixedShortcut } from "./legacy-caption-shortcuts.ts";
import type { MemeTemplateShortcut } from "./builtin-template.ts";

export { createProfileLikeImageRenderer } from "./profile-like-image.ts";

const pageSize = 12;
const catalogList = /^#?(?:表情(?:合成)?|meme)列表$/iu;
const catalogDetail = /^#?(?:表情(?:合成)?|meme)\s*详情\s*([^\r\n]+)$/iu;
const catalogSearch = /^#?(?:表情(?:合成)?|meme)搜索([^\r\n]*)$/iu;
const randomMemeCommand = /^#?(?:表情|meme)?随机(?:表情|meme)包?$/iu;
const helpCommand = /^#?(?:表情(?:合成)?|meme)(?:命令|帮助|菜单|help|说明|功能|指令|使用说明)$/iu;
const versionCommand = /^#?(?:表情(?:合成)?|meme)(?:版本|版本信息|version|versioninfo|(?:插件)?更新日志)$/iu;
const packageUpdateCommand = /^#?(?:表情(?:合成)?|meme)插件(强制)?更新$/iu;
const usageCommand = /^#?(?:表情|meme)(?:调用)?统计$/iu;
const catalogUnavailable = $t("lotus.text_a9d7e5351d");

// A legacy disable entry may be a stored key or one of its keywords.
const retainedTemplates = `meme.key NOT IN (SELECT value FROM json_each(?1, '$.excluded'))`;
const retainedCatalog = `FROM meme WHERE ${retainedTemplates}`;
const visibleCatalog = `${retainedCatalog}
  AND NOT EXISTS (
    SELECT 1 FROM json_each(?1, '$.hidden') AS disabled
    WHERE disabled.value = meme.key
       OR disabled.value IN (
         SELECT value FROM json_each(CASE WHEN json_valid(meme.keyWords) THEN meme.keyWords ELSE '[]' END)
       )
  )`;

interface CatalogContext {
  readonly user_id?: number;
  readonly inlineImageByteLimit?: number;
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
    return $t("lotus.text_b9e7170a38");
  }
  if (!policy.enabled) return $t("lotus.text_410b3dcbbb");
  if (!policy.allowed) return $t("lotus.text_c3e2122437");
  return policy;
}

function withCatalog<T>(query: (db: Database) => T): T | string {
  let db: Database | undefined;
  try {
    db = openMemeCatalogReader();
    return query(db);
  } catch {
    return catalogUnavailable;
  } finally {
    db?.close();
  }
}

function catalogFilters(db: Database, hidden: readonly string[]) {
  return JSON.stringify({ excluded: [...memeCatalogExclusions(db).keys], hidden });
}

function queryCatalog<T>(
  userId: number | undefined,
  query: (db: Database, filters: string, hidden: readonly string[]) => T,
): T | string {
  const policy = currentPolicy(userId);
  if (typeof policy === "string") return policy;
  return withCatalog((db) => query(db, catalogFilters(db, policy.hidden), policy.hidden));
}

function list(argument: string, context?: CatalogContext): string {
  const page = Number(argument || "1");
  if (!Number.isSafeInteger(page) || page < 1) return $t("lotus.text_37347a1466");

  return queryCatalog(context?.user_id, (db, filters) => db.transaction(() => {
    const { total } = db.query<{ total: number }, [string]>(`SELECT COUNT(*) AS total ${visibleCatalog}`).get(filters)!;
    if (total === 0) return $t("lotus.text_390f0780f7");
    const pages = Math.ceil(total / pageSize);
    if (page > pages) return $t("lotus.text_e0dd1d987a", { "pages": pages });

    const rows = db.query<CatalogRow, [string, number, number]>(
      `SELECT key, keyWords ${visibleCatalog} ORDER BY key LIMIT ? OFFSET ?`,
    ).all(filters, pageSize, (page - 1) * pageSize);
    return [
      $t("lotus.text_274edb770b", { "page": page, "pages": pages, "total": total }),
      ...rows.map((row) => {
        const aliases = keywords(row.keyWords).filter((word) => word !== row.key).slice(0, 3);
        return aliases.length ? `${row.key} · ${aliases.join("、")}` : row.key;
      }),
      $t("lotus.text_ce6bb7c461"),
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

function illustratedCatalog(loadInfoCard?: LoadMemeInfoCard, signal?: AbortSignal) {
  let rendered: { signature: string; cards: Promise<{ type: "image"; file: Uint8Array }[]> } | undefined;

  async function pictures(argument: string, context?: CatalogContext) {
    if (signal?.aborted) return;
    if (!loadInfoCard) return list(argument, context);
    const policy = currentPolicy(context?.user_id);
    if (typeof policy === "string") return policy;
    try {
      const version = catalogVersion();
      const hidden = JSON.stringify(policy.hidden);
      const signature = JSON.stringify([version, hidden]);
      if (!rendered || rendered.signature !== signature) {
        const rows = withCatalog((db) => db.query<CatalogDetails, [string]>(
          `SELECT * ${visibleCatalog} ORDER BY key`,
        ).all(catalogFilters(db, policy.hidden)).flatMap((item): CatalogCardRow[] => {
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
          const info = await loadInfoCard();
          const replies: { type: "image"; file: Uint8Array }[] = [];
          for (let offset = 0; offset < rows.length; offset += rowsPerCatalogCard) {
            signal?.throwIfAborted();
            const { png } = await renderCatalogCard(rows.slice(offset, offset + rowsPerCatalogCard), offset, rows.length, info);
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
        return $t("lotus.text_a5b86f0948");
      }
      return cards.length === 1 ? cards[0] : { type: "forward" as const, nodes: cards, batchSize: 2 };
    } catch {
      if (!signal?.aborted) return list(argument, context);
    }
  }

  return (argument: string, context?: CatalogContext) => !loadInfoCard || argument.trim()
    ? list(argument, context) : pictures(argument, context);
}

type TriggerRow = Pick<CatalogDetails, "key" | "keyWords" | "min_texts" | "max_texts">;

interface TriggerMatch {
  readonly row: TriggerRow;
  readonly keyword: string;
  readonly preset?: PresetArgument;
  readonly shortcut?: MemeTemplateShortcut;
  readonly shortcutTexts?: readonly string[];
}

function legacyPresetKeyword(value: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed === "string" && parsed.trim()) return parsed;
  } catch {
    // Incomplete rows in a local copy are ignored.
  }
}

function findPreset(db: Database, input: string, filters: string): TriggerMatch | undefined {
  if (!db.query("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'preset'").get()) return;

  const presets = db.query<TriggerRow & { name: string; arg_name: string; arg_value: string }, [string]>(
    `SELECT meme.key, keyWords, min_texts, max_texts,
       preset.name, preset.arg_name, preset.arg_value
     FROM preset JOIN meme ON preset.key = meme.key WHERE ${retainedTemplates}
     ORDER BY preset.name, meme.key`,
  ).all(filters);
  let match: TriggerMatch | undefined;
  for (const row of presets) {
    const keyword = legacyPresetKeyword(row.name);
    if (!keyword || keyword.length <= (match?.keyword.length ?? 0) || !row.arg_name ||
        !sameKeyword(input.slice(0, keyword.length), keyword)) continue;
    match = { row, keyword, preset: { name: row.arg_name, value: row.arg_value } };
  }
  return match;
}

function nativeCatalogShortcuts(db: Database): boolean {
  return !!db.query("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'lotus_catalog_provider'").get() &&
    !!db.query("SELECT 1 FROM lotus_catalog_provider WHERE id = 1 AND identity LIKE 'lotus-skia:%'").get();
}

function readShortcuts(info: string | undefined): MemeTemplateShortcut[] {
  const { shortcuts } = record(json(info));
  return Array.isArray(shortcuts) ? shortcuts.flatMap((entry): MemeTemplateShortcut[] => {
    const { key, args, humanized } = record(entry);
    if (typeof key !== "string" || !key.trim() || key !== key.trim()) return [];
    return [{ key, args: stringArray(args), ...(typeof humanized === "string" && { humanized }) }];
  }) : [];
}

function shortcutArgs(shortcut: MemeTemplateShortcut | undefined): string {
  return (shortcut?.args ?? []).map((arg) => /[\s"']/u.test(arg) ? JSON.stringify(arg) : arg).join(" ");
}

function matchNativeShortcut(row: TriggerRow, shortcut: MemeTemplateShortcut, candidate: string): TriggerMatch | undefined {
  const definition = nativeShortcutPattern(row.key, shortcut.key);
  if (definition) {
    const match = matchFixedShortcut(definition, candidate);
    if (match) return { row, shortcut, ...match };
    return;
  }
  if (sameKeyword(candidate.slice(0, shortcut.key.length), shortcut.key)) return { row, keyword: shortcut.key, shortcut };
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
    const filters = catalogFilters(db, policy.hidden);
    // Select the old keyword before checking whether its template is hidden, so
    // a disabled longer trigger cannot fall through to a shorter template.
    const rows = db.query<TriggerRow, [string]>(
      `SELECT key, keyWords, min_texts, max_texts ${retainedCatalog} ORDER BY key`,
    ).all(filters);
    let match: TriggerMatch | undefined;
    for (const row of rows) {
      for (const keyword of keywords(row.keyWords)) {
        if (keyword.length <= (match?.keyword.length ?? 0)) continue;
        if (sameKeyword(candidate.slice(0, keyword.length), keyword)) match = { row, keyword };
      }
    }
    if (nativeCatalogShortcuts(db)) {
      const withShortcuts = db.query<TriggerRow & { info: string }, [string]>(
        `SELECT key, keyWords, min_texts, max_texts, info ${retainedCatalog}
          AND json_type(CASE WHEN json_valid(info) THEN info ELSE '{}' END, '$.shortcuts') = 'array' ORDER BY key`,
      ).all(filters);
      for (const row of withShortcuts) {
        for (const shortcut of readShortcuts(row.info)) {
          const candidateMatch = matchNativeShortcut(row, shortcut, candidate);
          if (candidateMatch && candidateMatch.keyword.length > (match?.keyword.length ?? 0)) match = candidateMatch;
        }
      }
    }
    match ??= findPreset(db, candidate, filters);
    if (!match) return;
    if ((match.preset || match.shortcut) && policy.hidden.includes(match.keyword)) return;
    if (match.shortcut && policy.hidden.includes(match.shortcut.key)) return;

    const visible = db.query<{ key: string }, [string, string]>(
      `SELECT key ${visibleCatalog} AND key = ?`,
    ).get(filters, match.row.key);
    if (!visible) return;

    const text = candidate.slice(match.keyword.length).trim();
    const textMatches = requireTextMatch(match.row, text);
    const params = withParams || !textMatches
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

async function prepareResolvedRequest(match: ResolvedTrigger, input: GenerationInput) {
  const args = match.preset || match.shortcutTexts ? "" : shortcutArgs(match.shortcut);
  const text = args ? `${match.text} ${args}`.trim() : match.text;
  const request = await buildGenerationBody(match.row.key, keywords(match.row.keyWords), text, match.params, input, match.preset);
  if (typeof request === "object" && match.shortcutTexts) {
    request.body.delete("texts");
    for (const text of match.shortcutTexts) request.body.append("texts", text);
  }
  return request;
}

export async function prepareMemeRequest(message: string, input: GenerationInput) {
  const match = resolveTrigger(message, input, true);
  if (!match || typeof match === "string") return match;
  return prepareResolvedRequest(match, input);
}

async function details(argument: string, context?: CatalogContext, signal?: AbortSignal) {
  const key = argument.trim();
  if (!key) return $t("lotus.text_1cefd212ee");
  if (signal?.aborted) return;
  if (isExcludedMemeTemplate(key)) return excludedMemeTemplateMessage;

  let version: string;
  try { version = catalogVersion(); } catch { return catalogUnavailable; }
  const entry = queryCatalog(context?.user_id, (db, filters, hidden) => {
    let row = db.query<CatalogDetails, [string, string]>(
      `SELECT * ${visibleCatalog} AND key = ?`,
    ).get(filters, key);
    if (!row && !db.query("SELECT 1 FROM meme WHERE key = ?").get(key)) {
      const known = db.query<CatalogDetails, [string]>(`SELECT * ${visibleCatalog} ORDER BY key`).all(filters);
      const matches = known.filter((item) => keywords(item.keyWords).some((word) => sameKeyword(word, key)));
      if (matches.length > 1) return $t("lotus.text_bf7a6984f6");
      row = matches[0] ?? null;
    }
    if (!row) return excludedMemeTemplateMessage;

    const params = record(json(row.params));
    const aliases = keywords(row.keyWords);
    const defaults = stringArray(json(row.defText) ?? params.default_texts);
    const tags = memeCatalogExclusions(db).correctedArchiveKeys.has(row.key)
      ? [] : stringArray(json(row.tags) ?? record(json(row.info)).tags);
    const args = record(record(record(params.args_type ?? json(row.args_type)).args_model).properties);
    const options = Object.entries(args).flatMap(([name, field]) => {
      if (name === "user_infos") return [];
      const { description } = record(field);
      return [typeof description === "string" && description.trim() ? `[${name}: ${description}]` : `[${name}]`];
    });
    const hasPresets = db.query("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'preset'").get();
    const disabled = new Set(hidden);
    const presets = !hasPresets ? [] : db.query<{ name: string }, [string]>("SELECT name FROM preset WHERE key = ? ORDER BY rowid")
      .all(row.key).flatMap(({ name }) => legacyPresetKeyword(name) ?? []).filter(name => !disabled.has(name));
    const shortcuts = nativeCatalogShortcuts(db) ? readShortcuts(row.info)
      .filter(({ key }) => !disabled.has(key)).map(({ key, humanized }) => humanized || key) : [];
    return { row, aliases, defaults, tags, options, presets: [...new Set([...presets, ...shortcuts])] };
  });
  if (typeof entry === "string") return entry;
  const { row, aliases, defaults, tags, options, presets } = entry;
  const format = (values: readonly string[]) => values.length ? values.map(value => `[${value}]`).join(" ") : $t("lotus.text_2e18e5d723");
  const text = [
    $t("lotus.text_56c02d6724", { "key": row.key }),
    $t("lotus.text_37155de2e0", { "value1": format(aliases) }),
    $t("lotus.text_a14530a3f2", { "min_images": row.min_images, "max_images": row.max_images }),
    $t("lotus.text_2629a5bcd9", { "min_texts": row.min_texts, "max_texts": row.max_texts }),
    $t("lotus.text_1c2bdef5ad", { "value1": format(defaults) }),
    $t("lotus.text_fc59e7cc2f", { "value1": format(tags) }),
    ...(options.length ? [$t("lotus.text_ddfdbcd27d", { "value1": options.join(" ") })] : []),
    $t("lotus.text_c9454c9d75", { "value1": format(presets) }),
    $t("lotus.text_abe371a896"),
  ].join("\n");
  const failure = $t("lotus.text_83150da573", { "text": text });
  let provider: ReturnType<typeof memeProvider>;
  try { provider = memeProvider(); } catch { return failure; }
  if (!provider) return failure;
  const preview = await requestMemePreview(row.key, provider, signal);
  if (signal?.aborted) return;
  const policy = currentPolicy(context?.user_id);
  if (typeof policy === "string") return policy;
  if ([row.key, ...aliases].some(name => policy.hidden.includes(name))) return excludedMemeTemplateMessage;
  try {
    if (version !== catalogVersion()) return $t("lotus.text_8ed0194713");
    if (!sameMemeProvider(provider, memeProvider())) return failure;
  } catch { return failure; }
  return {
    type: "quoted" as const,
    message: preview ? [text + "\n", { type: "image" as const, file: preview }] : failure,
  };
}

function search(argument: string, context?: CatalogContext) {
  const keyword = argument.trim().toLowerCase();
  if (!keyword) return $t("lotus.text_681ba4fa26");
  const matches = queryCatalog(context?.user_id, (db, filters) => {
    const rows = db.query<Pick<CatalogRow, "keyWords">, [string]>(`SELECT keyWords ${visibleCatalog}`).all(filters);
    return [...new Set(rows.flatMap((row) => keywords(row.keyWords)).filter((word) => word.toLowerCase().includes(keyword)))].sort();
  });
  if (typeof matches === "string") return matches;
  if (!matches.length) return $t("lotus.text_4b97b85e61");
  const lines = matches.map((word, index) => `${index + 1}. ${word}`);
  const text = (lines: readonly string[]) => [{ type: "text" as const, text: lines.join("\n") }];
  if (lines.length <= 30) return { type: "quoted" as const, message: text(lines) };
  const nodes = [text([$t("lotus.text_96c95c81e5", { "length": lines.length })])];
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
    // 典中典 has one default caption, but a user must supply the Japanese line.
    return db.query<CatalogRow & { params: string }, [string]>(`
      SELECT key, keyWords, params ${visibleCatalog}
      AND key <> 'dianzhongdian'
      AND ((min_texts = 1 AND max_texts = 1) OR (min_images = 1 AND max_images = 1))
      AND json_valid(params)
      AND ${defaults} > 0
      ORDER BY random() LIMIT 1
    `).get(catalogFilters(db, policy.hidden));
  });
  if (typeof row === "string") return row;
  if (!row) return $t("lotus.text_241115cf3f");

  const aliases = keywords(row.keyWords);
  const prepared = await buildGenerationBody(row.key, aliases, "", row.params, input);
  if (typeof prepared === "string") return prepared;
  return {
    ...prepared,
    summary: $t("lotus.text_e137bd4647", { "key": row.key, "value2": aliases.map((word) => `[${word}]`).join(" ") || $t("lotus.text_2e18e5d723") }),
  };
}

async function usageReport(context: CatalogContext, loadInfoCard?: LoadMemeInfoCard) {
  const report = queryCatalog(context.user_id, (db, filters) => {
    const counts = readMemeUsage(db);
    const denied = memeCatalogExclusions(db).keys;
    for (const key of counts.keys()) {
      if (denied.has(key) || isExcludedMemeTemplate(key)) counts.delete(key);
    }
    if (counts.size === 0) return;
    const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
    const rows = db.query<CatalogRow, [string]>(`SELECT key, keyWords ${visibleCatalog} ORDER BY key`).all(filters)
      .flatMap(({ key, keyWords }) => {
        const aliases = keywords(keyWords);
        const count = counts.get(key);
        return count === undefined || aliases.length === 0 ? [] : [{ keywords: aliases.join(", "), count }];
      }).sort((left, right) => right.count - left.count);
    return { total, rows };
  });
  if (typeof report === "string") return report;
  if (!report) return $t("lotus.text_3b1c5a9e59");
  const textReport = () => {
    const heading = $t("lotus.text_d43a58dda9", { "total": report.total });
    const lines = report.rows.map(({ keywords, count }) => $t("lotus.text_141d3aff41", { "keywords": keywords, "count": count }));
    if (lines.length <= 30) return [heading, ...lines].join("\n");
    const nodes = [[{ type: "text" as const, text: heading }]];
    for (let offset = 0; offset < lines.length; offset += 30) {
      nodes.push([{ type: "text", text: lines.slice(offset, offset + 30).join("\n") }]);
    }
    return { type: "forward" as const, nodes };
  };
  if (!loadInfoCard) return textReport();
  try {
    const [{ renderUsageCard }, info] = await Promise.all([import("./usage-card.ts"), loadInfoCard()]);
    const images: { type: "image"; file: Uint8Array }[] = [];
    const perCard = 100;
    const limit = context.inlineImageByteLimit ?? Infinity;
    for (let offset = 0; offset < Math.max(1, report.rows.length); offset += perCard) {
      const rows = report.rows.slice(offset, offset + perCard);
      let result = await renderUsageCard(report.total, rows, info);
      if (result.png.byteLength > limit && result.reducedScaleReason === undefined) {
        result = await renderUsageCard(report.total, rows, info, 2);
      }
      if (result.png.byteLength > limit) return textReport();
      images.push({ type: "image", file: result.png });
    }
    return images.length === 1 ? images[0]! : { type: "forward" as const, nodes: images.map((image) => [image]) };
  } catch {
    return $t("lotus.text_8b5f3db0bd");
  }
}

function withReadyCatalog<T>(context: CatalogContext | undefined, signal: AbortSignal | undefined, read: () => T) {
  if (signal?.aborted) return;
  const pending = typeof currentPolicy(context?.user_id) === "string" ? undefined : prepareLocalCatalog(signal);
  return pending ? pending.then(() => signal?.aborted ? undefined : read()) : read();
}

function afterMemeBackend<T>(ensure: (() => void | Promise<void>) | undefined, run: () => T): T | Promise<Awaited<T>> {
  const pending = ensure?.();
  if (!pending) return run();
  return (async (): Promise<Awaited<T>> => {
    await pending;
    return await run();
  })();
}

function createMemeCommands(signal?: AbortSignal, loadInfoCard?: LoadMemeInfoCard, ensure?: () => void | Promise<void>) {
  const listCatalog = illustratedCatalog(loadInfoCard, signal);
  const readCatalog = <T>(context: CatalogContext | undefined, read: () => T) =>
    afterMemeBackend(ensure, () => withReadyCatalog(context, signal, read));
  return {
    fallback: (message: string, context: FallbackContext) =>
      afterMemeBackend(ensure, () => memeFallback(message, context, listCatalog, signal, loadInfoCard)),
    commands: {
      "#表情列表": (argument: string, context?: CatalogContext) => readCatalog(context, () => listCatalog(argument, context)),
      "#表情详情": (argument: string, context?: CatalogContext) => readCatalog(context, () => details(argument, context, signal)),
      "#表情搜索": (argument: string, context?: CatalogContext) => readCatalog(context, () => search(argument, context)),
      "#表情统计": (_argument: string, context: CatalogContext) => readCatalog(context, () => usageReport(context, loadInfoCard)),
      "#表情帮助": (argument: string, context: FallbackContext) => argument.trim() ? $t("lotus.text_3af711eb56") :
        presentMemeReference(helpReference(isMemeOwner(context)), loadInfoCard, signal),
      "#表情版本": (argument: string, context?: Pick<FallbackContext, "inlineImageByteLimit">) =>
        argument.trim() ? $t("lotus.text_b46bf08475") : presentMemeVersion(loadInfoCard, signal, context?.inlineImageByteLimit),
    },
  };
}

async function memeFallback(message: string, context: FallbackContext, listCatalog: ReturnType<typeof illustratedCatalog>,
  signal?: AbortSignal, loadInfoCard?: LoadMemeInfoCard) {
  const input = message.trim();
  if (catalogList.test(input)) return withReadyCatalog(context, signal, () => listCatalog("", context));
  const detailMatch = catalogDetail.exec(input);
  if (detailMatch) return withReadyCatalog(context, signal, () => details(detailMatch[1] ?? "", context, signal));
  const searchMatch = catalogSearch.exec(input);
  if (searchMatch) return withReadyCatalog(context, signal, () => search(searchMatch[1] ?? "", context));
  if (usageCommand.test(input)) return withReadyCatalog(context, signal, () => usageReport(context, loadInfoCard));
  if (helpCommand.test(input)) return presentMemeReference(helpReference(isMemeOwner(context)), loadInfoCard, signal);
  if (versionCommand.test(input)) return presentMemeVersion(loadInfoCard, signal, context.inlineImageByteLimit);
  const packageUpdate = packageUpdateCommand.exec(input);
  if (packageUpdate) return isMemeOwner(context)
    ? $t("lotus.text_6b5869bfd2", { "value1": packageUpdate[1] ?? "" }) : $t("lotus.text_49e5bee7de");
  const setting = handleMemeSettings(input, context);
  if (setting !== undefined) return typeof setting === "string" ? setting : presentMemeReference(setting, loadInfoCard, signal);
  const update = handleCatalogUpdate(message, context, signal);
  if (update !== undefined) return update;
  if (context.user_id === undefined || context.message_type === "terminal") return;
  let provider: ReturnType<typeof memeProvider>;
  try {
    provider = memeProvider();
  } catch {
    return;
  }
  if (!provider) return;
  const random = randomMemeCommand.test(input);
  if (random || matchesLocalMemeTrigger(provider, input)) {
    const policy = currentPolicy(context.user_id, true);
    if (typeof policy === "string") return random ? policy : undefined;
    if (policy.forceSharp && !input.startsWith("#")) return;

    const pending = prepareLocalCatalog(signal);
    if (pending) {
      await pending;
      if (signal?.aborted || !sameMemeProvider(provider, memeProvider())) return;
    }
    if (random) return generateMemeReply(context, (media) => prepareRandomMeme(input, media), provider, signal);
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
  }, provider, signal);
}

export default createMemeCommands();

export function createModule({ signal, memeRuntime }: { readonly signal: AbortSignal; readonly memeRuntime?: MemeRuntime }) {
  const lifecycle = new AbortController();
  const active = AbortSignal.any([signal, lifecycle.signal]);
  const backend = createLocalMemeBackend(active);
  const stop = memeRuntime && startCatalogRuntime(memeRuntime, active, backend);
  function ensure() {
    if (active.aborted) return;
    try {
      if (memeProvider()) return;
    } catch {
      return;
    }
    return backend.ensure();
  }
  return {
    ...createMemeCommands(active, memeRuntime?.loadInfoCard, ensure),
    async dispose() {
      lifecycle.abort();
      await Promise.all([stop?.(), backend.dispose()]);
    },
  };
}
