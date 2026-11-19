import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareMemeRequest, resolveMemeTrigger } from "../lotus.ts";

test("旧表情预设沿用触发、停用和固定参数规则", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lotus-meme-presets-"));
  const filename = join(directory, "data.db");
  const previousPath = Bun.env.LOTUS_MEME_DB;
  const previousConfiguration = Bun.env.LOTUS_MEME_CONFIG_DIR;
  try {
    const db = new Database(filename);
    db.run(`CREATE TABLE meme (
      key TEXT PRIMARY KEY, keyWords TEXT, min_images INTEGER, max_images INTEGER,
      min_texts INTEGER, max_texts INTEGER, params TEXT
    )`);
    db.run(`CREATE TABLE preset (
      name JSON NOT NULL PRIMARY KEY, key TEXT NOT NULL, arg_name TEXT NOT NULL, arg_value TEXT NOT NULL
    )`);
    const params = {
      min_images: 0, max_images: 0, min_texts: 0, max_texts: 0,
      args_type: {
        args_model: { properties: { character: { type: "integer" }, number: { type: "integer" } } },
        parser_options: [{ names: ["-n", "--number"], args: [{ name: "number" }] }],
      },
    };
    db.query("INSERT INTO meme VALUES (?, ?, 0, 0, 0, 0, ?)").run("template", '["普通"]', JSON.stringify(params));
    db.query("INSERT INTO meme VALUES (?, ?, 0, 0, 0, 0, ?)").run("first", '["冲突"]', JSON.stringify(params));
    const insert = db.query("INSERT INTO preset VALUES (?, ?, ?, ?)");
    insert.run(JSON.stringify("快捷"), "template", "character", "4");
    insert.run(JSON.stringify("冲突"), "template", "character", "2");
    insert.run(JSON.stringify("缺失"), "removed", "character", "3");
    db.close();
    const before = await readFile(filename);

    Bun.env.LOTUS_MEME_DB = filename;
    Bun.env.LOTUS_MEME_CONFIG_DIR = directory;
    expect(resolveMemeTrigger("快捷")).toEqual({ key: "template", keyword: "快捷", text: "" });
    expect(resolveMemeTrigger("冲突")).toEqual({ key: "first", keyword: "冲突", text: "" });
    expect(resolveMemeTrigger("缺失")).toBeUndefined();
    expect(resolveMemeTrigger("快捷普通聊天")).toBeUndefined();
    const request = await prepareMemeRequest("#快捷 -n 5 #character 原值无效", { user_id: 10001, isMaster: false });
    if (!request || typeof request === "string") throw new Error(String(request));
    expect(JSON.parse(String(request.body.get("args")))).toEqual({
      user_infos: [{ name: "未知", gender: "unknown" }], character: 4, number: 5,
    });

    await writeFile(join(directory, "meme.yaml"), "forceSharp: true\n");
    expect(resolveMemeTrigger("快捷")).toBeUndefined();
    expect(resolveMemeTrigger("#快捷")).toBeDefined();
    await writeFile(join(directory, "access.yaml"), "blackListEnable: true\nblackList: [快捷]\n");
    expect(resolveMemeTrigger("#快捷")).toBeUndefined();
    expect(resolveMemeTrigger("#普通")).toBeDefined();
    await writeFile(join(directory, "access.yaml"), "blackListEnable: true\nblackList: [普通]\n");
    expect(resolveMemeTrigger("#快捷")).toBeUndefined();
    expect(await readFile(filename)).toEqual(before);
  } finally {
    if (previousPath === undefined) delete Bun.env.LOTUS_MEME_DB;
    else Bun.env.LOTUS_MEME_DB = previousPath;
    if (previousConfiguration === undefined) delete Bun.env.LOTUS_MEME_CONFIG_DIR;
    else Bun.env.LOTUS_MEME_CONFIG_DIR = previousConfiguration;
    await rm(directory, { recursive: true, force: true });
  }
});
