import { Database } from "bun:sqlite";
import { fileURLToPath } from "node:url";

const pageSize = 12;
const defaultPath = fileURLToPath(new URL("../../data/meme/data.db", import.meta.url));

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

function queryCatalog<T>(query: (db: Database) => T): T | string {
  let db: Database | undefined;
  try {
    db = new Database(Bun.env.LOTUS_MEME_DB || defaultPath, { readonly: true });
    return query(db);
  } catch {
    return "无法读取表情目录，请检查 LOTUS_MEME_DB 和本机导入的旧数据库。";
  } finally {
    db?.close();
  }
}

function list(argument: string): string {
  const page = Number(argument || "1");
  if (!Number.isSafeInteger(page) || page < 1) return "用法：#表情列表 [页码]";

  return queryCatalog((db) => db.transaction(() => {
    const { total } = db.query<{ total: number }, []>("SELECT COUNT(*) AS total FROM meme").get()!;
    if (total === 0) return "表情目录为空。";
    const pages = Math.ceil(total / pageSize);
    if (page > pages) return `表情目录共有 ${pages} 页。`;

    const rows = db.query<CatalogRow, [number, number]>(
      'SELECT key, keyWords FROM meme ORDER BY key LIMIT ? OFFSET ?',
    ).all(pageSize, (page - 1) * pageSize);
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

function details(key: string): string {
  if (!key) return "用法：#表情详情 <编号>";

  return queryCatalog((db) => {
    const row = db.query<CatalogDetails, [string]>(
      'SELECT key, keyWords, min_images, max_images, min_texts, max_texts FROM meme WHERE key = ?',
    ).get(key);
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
