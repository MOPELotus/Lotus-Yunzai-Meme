import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import module, { resolveMemeTrigger } from "../lotus.ts";

test("旧资源更新命令按事务同步目录和预设", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lotus-meme-catalog-update-"));
  const filename = join(directory, "data.db");
  const env = { config: Bun.env.LOTUS_MEME_CONFIG_DIR, file: Bun.env.LOTUS_MEME_DB, server: Bun.env.LOTUS_MEME_SERVER_URL };
  const requests: string[] = [];
  let keys = ["ba_say", "removed"];
  let fail = false;
  let word = "旧素材";
  const fixture = Bun.serve({
    hostname: "127.0.0.1", port: 0,
    fetch(request) {
      const path = new URL(request.url).pathname;
      requests.push(path);
      if (path === "/fixture/memes/keys") return Response.json(keys);
      const match = /^\/fixture\/memes\/([^/]+)\/info$/u.exec(path);
      const key = match?.[1];
      if (!key || !keys.includes(key) || fail && key === "new") return new Response(null, { status: 503 });
      return Response.json({
        key, keywords: [key === "ba_say" ? word : key], tags: [],
        params_type: {
          min_images: 0, max_images: 0, min_texts: 0, max_texts: 0,
          args_type: { args_model: { properties: { character: { type: "integer" } } } },
        },
      });
    },
  });
  const owner = { message_type: "private" as const, user_id: 10001, isMaster: false,
    isBotMaster: (userId: number) => userId === 10001 };
  const update = (force = false) => module.fallback(`#清语表情${force ? "强制" : ""}更新资源`, owner);
  try {
    Bun.env.LOTUS_MEME_CONFIG_DIR = directory;
    Bun.env.LOTUS_MEME_DB = filename;
    Bun.env.LOTUS_MEME_SERVER_URL = new URL("/fixture/", fixture.url).href;

    expect(await module.fallback("#清语表情更新资源", { ...owner, user_id: 10002 })).toContain("只有主人");
    expect(await module.fallback("#清语表情更新资源", { ...owner, isDelegated: true })).toContain("只有主人");
    expect(requests).toEqual([]);
    expect(await update()).toContain("更新 2 项，移除 0 项");
    expect(resolveMemeTrigger("#旧素材")).toMatchObject({ key: "ba_say" });
    expect(resolveMemeTrigger("#心奈说")).toMatchObject({ key: "ba_say" });

    const db = new Database(filename);
    db.exec("PRAGMA journal_mode = WAL");
    db.run("CREATE TABLE stat_fixture (total INTEGER)");
    db.run("INSERT INTO stat_fixture VALUES (11)");
    db.query("UPDATE preset SET arg_value = ? WHERE name = ?").run("3", JSON.stringify("心奈说"));
    db.close();
    const beforeFailure = await readFile(filename);
    keys = ["ba_say", "new"];
    fail = true;
    expect(await update()).toContain("更新失败");
    expect(await readFile(filename)).toEqual(beforeFailure);

    fail = false;
    word = "新素材";
    requests.length = 0;
    expect(await update()).toContain("更新 1 项，移除 1 项");
    expect(requests).toEqual(["/fixture/memes/keys", "/fixture/memes/new/info"]);
    expect(resolveMemeTrigger("#旧素材")).toBeDefined();
    expect(resolveMemeTrigger("#removed")).toBeUndefined();
    expect(await update(true)).toContain("更新 2 项，移除 0 项");
    expect(resolveMemeTrigger("#新素材")).toMatchObject({ key: "ba_say" });
    expect(resolveMemeTrigger("#旧素材")).toBeUndefined();
    const snapshot = new Database(filename, { readonly: true });
    try {
      expect(snapshot.query("SELECT total FROM stat_fixture").get()).toEqual({ total: 11 });
      expect(snapshot.query("SELECT arg_value FROM preset WHERE name = ?").get(JSON.stringify("心奈说")))
        .toEqual({ arg_value: "3" });
    } finally {
      snapshot.close();
    }
  } finally {
    if (env.config === undefined) delete Bun.env.LOTUS_MEME_CONFIG_DIR; else Bun.env.LOTUS_MEME_CONFIG_DIR = env.config;
    if (env.file === undefined) delete Bun.env.LOTUS_MEME_DB; else Bun.env.LOTUS_MEME_DB = env.file;
    if (env.server === undefined) delete Bun.env.LOTUS_MEME_SERVER_URL; else Bun.env.LOTUS_MEME_SERVER_URL = env.server;
    await fixture.stop(true);
    await rm(directory, { recursive: true, force: true });
  }
});
