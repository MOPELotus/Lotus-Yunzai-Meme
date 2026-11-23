import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { publishMemeProvider } from "../catalog-policy.ts";
import module, { resolveMemeTrigger } from "../lotus.ts";

test("旧资源更新命令按事务同步目录和预设", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lotus-meme-catalog-update-"));
  const filename = join(directory, "data.db");
  const env = { config: Bun.env.LOTUS_MEME_CONFIG_DIR, file: Bun.env.LOTUS_MEME_DB, server: Bun.env.LOTUS_MEME_SERVER_URL };
  const requests: string[] = [];
  let keys = ["ba_say", "removed"];
  let fail = false;
  let word = "旧素材";
  let gate: { readonly started: ReturnType<typeof Promise.withResolvers<void>>;
    readonly release: ReturnType<typeof Promise.withResolvers<void>> } | undefined;
  const fixture = {
    catalogIdentity: "catalog-update-fixture",
    async keys() { requests.push("keys"); return keys; },
    async info(key: string) {
      requests.push(key);
      if (!keys.includes(key) || fail && key === "new") throw new Error("目录读取失败");
      if (gate && key === "new") {
        gate.started.resolve();
        await gate.release.promise;
      }
      return {
        key, keywords: [key === "ba_say" ? word : key], tags: [],
        params_type: {
          min_images: 0, max_images: 0, min_texts: 0, max_texts: 0,
          args_type: { args_model: { properties: { character: { type: "integer" } } } },
        },
      };
    },
    async generate() { return undefined; },
    async preview() { return undefined; },
  };
  let withdraw: (() => void) | undefined;
  const owner = { message_type: "private" as const, user_id: 10001, isMaster: false,
    isBotMaster: (userId: number) => userId === 10001 };
  const update = (force = false, name = "表情合成") =>
    module.fallback(`#${name}${force ? "强制" : ""}更新资源`, owner);
  try {
    Bun.env.LOTUS_MEME_CONFIG_DIR = directory;
    Bun.env.LOTUS_MEME_DB = filename;
    Bun.env.LOTUS_MEME_SERVER_URL = "http://127.0.0.1:1/ignored";
    await writeFile(join(directory, "server.yaml"), "backend: remote\nurl: ignored-invalid-url\n");
    expect(await update()).toBe("本机表情模板尚未就绪。");
    withdraw = publishMemeProvider(fixture);

    for (const former of ["#清语表情更新资源", "#meme-plugin强制更新资源", "#清语meme更新数据"]) {
      expect(await module.fallback(former, owner)).toBeUndefined();
    }
    expect(await module.fallback("#表情合成更新资源", { ...owner, user_id: 10002 })).toContain("只有主人");
    expect(await module.fallback("#表情合成更新资源", { ...owner, isDelegated: true })).toContain("只有主人");
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
    gate = { started: Promise.withResolvers<void>(), release: Promise.withResolvers<void>() };
    const pending = update();
    await gate.started.promise;
    expect(await update()).toBe("表情包数据更新中。");
    const replaced = publishMemeProvider({ ...fixture, async generate() { return new Uint8Array([1]); } });
    gate.release.resolve();
    expect(await pending).toContain("更新失败");
    expect(await readFile(filename)).toEqual(beforeFailure);
    replaced();
    withdraw = publishMemeProvider(fixture);
    gate = undefined;
    word = "新素材";
    requests.length = 0;
    expect(await update(false, "表情")).toContain("更新 1 项，移除 1 项");
    expect(requests).toEqual(["keys", "new"]);
    expect(resolveMemeTrigger("#旧素材")).toBeDefined();
    expect(resolveMemeTrigger("#removed")).toBeUndefined();
    expect(await update(true, "meme")).toContain("更新 2 项，移除 0 项");
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
    withdraw?.();
    await rm(directory, { recursive: true, force: true });
  }
});
