import { Database } from "bun:sqlite";
import { fileURLToPath } from "node:url";
import { catalogPolicy } from "./catalog-policy.ts";

const pageSize = 12;
const defaultPath = fileURLToPath(new URL("../../data/meme/data.db", import.meta.url));

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

function queryCatalog<T>(
  userId: number | undefined,
  query: (db: Database, hidden: string, forceSharp: boolean) => T,
  forGeneration = false,
): T | string {
  let policy: ReturnType<typeof catalogPolicy>;
  try {
    policy = catalogPolicy(userId, forGeneration);
  } catch {
    return "无法读取表情配置，请检查 meme.yaml 和 access.yaml。";
  }
  if (!policy.enabled) return "表情模块已停用。";
  if (!policy.allowed) return "当前用户无权使用表情模块。";

  let db: Database | undefined;
  try {
    db = new Database(Bun.env.LOTUS_MEME_DB || defaultPath, { readonly: true });
    return query(db, JSON.stringify(policy.hidden), policy.forceSharp);
  } catch {
    return "无法读取表情目录，请检查 LOTUS_MEME_DB 和本机导入的旧数据库。";
  } finally {
    db?.close();
  }
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

function requireTextMatch(row: CatalogDetails, text: string): boolean {
  if (row.min_texts !== 0 || row.max_texts !== 0 || !text) return true;

  return /^(@\s*\d+\s*)+$/u.test(text) || /^(#\S+\s+[^#]+(?:\s+#\S+\s+[^#]+)*)$/u.test(text);
}

export function resolveMemeTrigger(
  message: string,
  context?: CatalogContext,
): { readonly key: string; readonly keyword: string; readonly text: string } | string | undefined {
  const input = message.trim();
  return queryCatalog(context?.user_id, (db, hidden, forceSharp) => {
    if (forceSharp && !input.startsWith("#")) return;
    const candidate = input.startsWith("#") ? input.slice(1) : input;
    if (!candidate) return;

    // Select the old keyword before checking whether its template is hidden, so
    // a disabled longer trigger cannot fall through to a shorter template.
    const rows = db.query<CatalogDetails, []>(`SELECT ${detailsFields} FROM meme ORDER BY key`).all();
    let match: { row: CatalogDetails; keyword: string } | undefined;
    for (const row of rows) {
      for (const keyword of keywords(row.keyWords)) {
        if (keyword.length <= (match?.keyword.length ?? 0)) continue;
        if (sameKeyword(candidate.slice(0, keyword.length), keyword)) match = { row, keyword };
      }
    }
    if (!match) return;

    const visible = db.query<{ key: string }, [string, string]>(
      `SELECT key ${visibleCatalog} AND key = ?`,
    ).get(hidden, match.row.key);
    if (!visible) return;

    const text = candidate.slice(match.keyword.length).trim();
    if (!requireTextMatch(match.row, text)) return;
    return { key: match.row.key, keyword: match.keyword, text };
  }, true);
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

export default {
  commands: {
    "#表情列表": list,
    "#表情详情": details,
  },
};
