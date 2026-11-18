import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import module from "../lotus.ts";

test("从旧 meme 表分页并查询详情，数据库保持不变", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lotus-meme-catalog-"));
  const filename = join(directory, "data.db");
  const previousPath = Bun.env.LOTUS_MEME_DB;
  try {
    const db = new Database(filename);
    db.run(`CREATE TABLE meme (
      key TEXT PRIMARY KEY, keyWords TEXT, min_images INTEGER, max_images INTEGER,
      min_texts INTEGER, max_texts INTEGER
    )`);
    const insert = db.query("INSERT INTO meme VALUES (?, ?, 1, 2, 0, 1)");
    for (let index = 1; index <= 13; index++) {
      insert.run(`meme-${String(index).padStart(2, "0")}`, JSON.stringify(["表情", "样例"]));
    }
    db.close();
    const before = await readFile(filename);

    Bun.env.LOTUS_MEME_DB = filename;
    expect(module.commands["#表情列表"]("")).toContain("表情列表 1/2（共 13 项）");
    expect(module.commands["#表情列表"]("2")).toContain("meme-13 · 表情、样例");
    expect(module.commands["#表情列表"]("3")).toBe("表情目录共有 2 页。");
    expect(module.commands["#表情详情"]("meme-13")).toContain("图片：1–2 张");
    expect(module.commands["#表情详情"]("missing")).toContain("没有找到对应表情");
    expect(await readFile(filename)).toEqual(before);
  } finally {
    if (previousPath === undefined) delete Bun.env.LOTUS_MEME_DB;
    else Bun.env.LOTUS_MEME_DB = previousPath;
    await rm(directory, { recursive: true, force: true });
  }
});
