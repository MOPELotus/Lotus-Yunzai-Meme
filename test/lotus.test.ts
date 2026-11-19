import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import module, { resolveMemeTrigger } from "../lotus.ts";

test("从旧 meme 表分页并查询详情，数据库保持不变", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lotus-meme-catalog-"));
  const filename = join(directory, "data.db");
  const previousPath = Bun.env.LOTUS_MEME_DB;
  const previousConfiguration = Bun.env.LOTUS_MEME_CONFIG_DIR;
  try {
    const db = new Database(filename);
    db.run(`CREATE TABLE meme (
      key TEXT PRIMARY KEY, keyWords TEXT, min_images INTEGER, max_images INTEGER,
      min_texts INTEGER, max_texts INTEGER
    )`);
    const insert = db.query("INSERT INTO meme VALUES (?, ?, 1, 2, 0, 1)");
    for (let index = 1; index <= 13; index++) {
      insert.run(`meme-${String(index).padStart(2, "0")}`, JSON.stringify(["表情", "样例", `别名${index}`]));
    }
    db.run("UPDATE meme SET keyWords = ?, max_texts = 0 WHERE key = ?", [JSON.stringify(["只图", "a+b"]), "meme-12"]);
    db.close();
    const before = await readFile(filename);

    Bun.env.LOTUS_MEME_DB = filename;
    Bun.env.LOTUS_MEME_CONFIG_DIR = directory;
    expect(module.commands["#表情列表"]("")).toContain("表情列表 1/2（共 13 项）");
    expect(module.commands["#表情列表"]("2")).toContain("meme-13 · 表情、样例");
    expect(module.commands["#表情列表"]("3")).toBe("表情目录共有 2 页。");
    expect(module.commands["#表情详情"]("meme-13")).toContain("图片：1–2 张");
    expect(module.commands["#表情详情"]("missing")).toContain("没有找到对应表情");
    expect(module.commands["#表情详情"]("别名13")).toContain("表情 meme-13");
    expect(module.commands["#表情详情"]("表情")).toContain("对应多个表情");
    expect(resolveMemeTrigger("别名13 好耶")).toEqual({ key: "meme-13", keyword: "别名13", text: "好耶" });
    expect(resolveMemeTrigger("#A+B @10001")).toEqual({ key: "meme-12", keyword: "a+b", text: "@10001" });
    expect(resolveMemeTrigger("#只图普通聊天")).toBeUndefined();

    const moduleConfig = join(directory, "meme.yaml");
    await writeFile(moduleConfig, "forceSharp: true\n");
    expect(resolveMemeTrigger("别名13 好耶")).toBeUndefined();
    expect(resolveMemeTrigger("#别名13 好耶")).toEqual({ key: "meme-13", keyword: "别名13", text: "好耶" });

    const accessConfig = join(directory, "access.yaml");
    const whitelist = `enable: true
mode: 0
userWhiteList: ["10001"]
blackListEnable: true
blackList: ["meme-01", "别名13"]
`;
    await writeFile(accessConfig, whitelist);
    const user = { user_id: 10001 };

    expect(module.commands["#表情列表"]("", { user_id: 10002 })).toContain("无权");
    const list = module.commands["#表情列表"]("", user);
    expect(list).toContain("表情列表 1/1（共 11 项）");
    expect(list).not.toContain("meme-01");
    expect(list).not.toContain("meme-13");
    expect(module.commands["#表情详情"]("meme-13", user)).toContain("没有找到");
    expect(module.commands["#表情详情"]("别名13", user)).toContain("没有找到");
    expect(resolveMemeTrigger("#别名13 好耶", user)).toBeUndefined();
    expect(module.commands["#表情详情"]("meme-02", user)).toContain("图片：1–2 张");

    await writeFile(accessConfig, "enable: true\nmode: 1\nuserBlackList: [10001]\n");
    expect(module.commands["#表情列表"]("", user)).toContain("无权");
    expect(module.commands["#表情列表"]("", { user_id: 10002 })).toContain("共 13 项");
    expect(module.commands["#表情列表"]("")).toContain("无权");

    await writeFile(moduleConfig, "enable: false\n");
    expect(module.commands["#表情列表"]("", { user_id: 10002 })).toBe("表情模块已停用。");
    await writeFile(moduleConfig, "enable: [\n");
    expect(module.commands["#表情详情"]("meme-02", { user_id: 10002 })).toContain("无法读取表情配置");
    expect(await readFile(filename)).toEqual(before);
  } finally {
    if (previousPath === undefined) delete Bun.env.LOTUS_MEME_DB;
    else Bun.env.LOTUS_MEME_DB = previousPath;
    if (previousConfiguration === undefined) delete Bun.env.LOTUS_MEME_CONFIG_DIR;
    else Bun.env.LOTUS_MEME_CONFIG_DIR = previousConfiguration;
    await rm(directory, { recursive: true, force: true });
  }
});
