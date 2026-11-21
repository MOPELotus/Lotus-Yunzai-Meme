import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import commands from "../lotus.ts";

test("表情详情以原目录展示参数、标签、预设并从同源原端点获取预览", async () => {
  const environment = {
    LOTUS_MEME_DB: Bun.env.LOTUS_MEME_DB,
    LOTUS_MEME_CONFIG_DIR: Bun.env.LOTUS_MEME_CONFIG_DIR,
    LOTUS_MEME_SERVER_URL: Bun.env.LOTUS_MEME_SERVER_URL,
  };
  const root = await mkdtemp(join(tmpdir(), "lotus-meme-detail-"));
  const image = Uint8Array.fromBase64("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=");
  const actions: string[] = [];
  let mode = "image";
  const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch(request) {
    actions.push(`${request.method} ${new URL(request.url).pathname}`);
    if (mode === "blocked") return new Response(null, { status: 302, headers: { Location: "/elsewhere" } });
    if (mode === "non-image") return new Response("invalid image");
    return new Response(image, { headers: { "Content-Type": "image/png" } });
  } });
  try {
    const path = join(root, "fixture.db");
    const db = new Database(path);
    try {
      db.run(`CREATE TABLE meme (key TEXT PRIMARY KEY, keyWords TEXT, min_images INTEGER, max_images INTEGER,
        min_texts INTEGER, max_texts INTEGER, params TEXT, defText TEXT, tags TEXT);
        CREATE TABLE preset (name TEXT PRIMARY KEY, key TEXT);`);
      db.run("INSERT INTO meme VALUES (?, ?, 1, 2, 0, 1, ?, ?, ?)", ["demo", '["关键词"]', JSON.stringify({
        args_type: { args_model: { properties: { user_infos: { description: "内部" }, radius: { description: "半径" } } } },
      }), '["默认句"]', '["可爱"]']);
      db.run("INSERT INTO preset VALUES (?, ?)", ['"大圆"', "demo"]);
    } finally { db.close(); }
    Bun.env.LOTUS_MEME_DB = path;
    Bun.env.LOTUS_MEME_CONFIG_DIR = root;
    Bun.env.LOTUS_MEME_SERVER_URL = new URL("/v2/", server.url).href;

    const context = { message_type: "group" as const, user_id: 42, isMaster: false, isBotMaster: () => false };
    const result = await commands.fallback("meme 详情关键词", context);
    expect(result).toMatchObject({ type: "quoted", message: [
      expect.stringContaining("默认文本：[默认句]\n标签：[可爱]\n可选参数：[radius: 半径]\n参数命令：[大圆]\n预览图片："),
      { type: "image", file: image },
    ] });
    expect(JSON.stringify(result)).not.toContain("内部");

    mode = "blocked";
    expect(await commands.commands["#表情详情"]("demo", context)).toMatchObject({
      type: "quoted", message: expect.stringContaining("预览图片加载失败"),
    });
    mode = "non-image";
    expect(await commands.commands["#表情详情"]("demo", context)).toMatchObject({
      type: "quoted", message: expect.stringContaining("标签：[可爱]"),
    });
    await writeFile(join(root, "access.yaml"), "blackListEnable: true\nblackList: [关键词]\n");
    expect(await commands.commands["#表情详情"]("demo", context)).toContain("没有找到");
    expect(actions).toEqual(Array(3).fill("GET /v2/memes/demo/preview"));
  } finally {
    server.stop(true);
    for (const [key, value] of Object.entries(environment)) {
      if (value === undefined) delete Bun.env[key];
      else Bun.env[key] = value;
    }
    await rm(root, { recursive: true, force: true });
  }
});
