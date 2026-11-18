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

function queryCatalog(userId: number | undefined, query: (db: Database, hidden: string) => string): string {
  let policy: ReturnType<typeof catalogPolicy>;
  try {
    policy = catalogPolicy(userId);
  } catch {
    return "无法读取表情配置，请检查 meme.yaml 和 access.yaml。";
  }
  if (!policy.enabled) return "表情模块已停用。";
  if (!policy.allowed) return "当前用户无权使用表情模块。";

  let db: Database | undefined;
  try {
    db = new Database(Bun.env.LOTUS_MEME_DB || defaultPath, { readonly: true });
    return query(db, JSON.stringify(policy.hidden));
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

function details(key: string, context?: CatalogContext): string {
  if (!key) return "用法：#表情详情 <编号>";

  return queryCatalog(context?.user_id, (db, hidden) => {
    const row = db.query<CatalogDetails, [string, string]>(
      `SELECT key, keyWords, min_images, max_images, min_texts, max_texts ${visibleCatalog} AND key = ?`,
    ).get(hidden, key);
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
