import { Database } from "bun:sqlite";
import { expect, spyOn, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { publishManagedMemeServer } from "../catalog-policy.ts";
import { runAutomaticCatalogRefresh } from "../catalog-update.ts";
import { requestMemeImage, requestMemePreview } from "../generate-reply.ts";
import module, { createModule, resolveMemeTrigger } from "../lotus.ts";
import { isExcludedMemeTemplate } from "../template-policy.ts";

const png = Uint8Array.fromBase64("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=");
const envKeys = ["LOTUS_MEME_DB", "LOTUS_MEME_CONFIG_DIR", "LOTUS_MEME_SERVER_URL"] as const;
const owner = { message_type: "private" as const, user_id: 42, isMaster: true, isBotMaster: (user: number) => user === 42 };
const server = { base: new URL("http://127.0.0.1:1/"), timeout: 1_000, protocol: "legacy" as const };

async function fixture(run: (file: string, signal: AbortSignal, calls: string[]) => Promise<void>,
  remote?: Readonly<Record<string, unknown>>) {
  const dir = await mkdtemp(join(tmpdir(), "lotus-meme-template-exclusion-"));
  const file = join(dir, "catalog.sqlite");
  const previous = envKeys.map(key => [key, Bun.env[key]] as const);
  const controller = new AbortController();
  const calls: string[] = [];
  const fetchMock = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    calls.push(`${init?.method ?? "GET"} ${url.pathname}`);
    if (remote) {
      if (url.pathname === "/memes/keys") return Response.json(Object.keys(remote));
      const key = /^\/memes\/([^/]+)\/info$/u.exec(url.pathname)?.[1];
      if (key && Object.hasOwn(remote, key)) return Response.json(remote[key]);
    }
    if (url.pathname === "/memes/keys") return Response.json(["jinhsi", "kurogames_rosetta", "custom", "ordinary"]);
    if (url.pathname === "/memes/custom/info") return Response.json({ key: "custom", tags: ["Punishing: Gray Raven"] });
    if (url.pathname === "/memes/ordinary/info") {
      return Response.json({ key: "ordinary", keywords: ["安慰"], tags: ["普通"],
        params_type: { min_texts: 0, max_texts: 0, min_images: 0, max_images: 0 } });
    }
    return new Response(png);
  };
  const intercept = spyOn(globalThis, "fetch").mockImplementation(Object.assign(fetchMock, { preconnect: () => {} }));
  try {
    Bun.env.LOTUS_MEME_DB = file;
    Bun.env.LOTUS_MEME_CONFIG_DIR = dir;
    Bun.env.LOTUS_MEME_SERVER_URL = server.base.href;
    await writeFile(join(dir, "meme.yaml"), "pokeEnable: true\npokeProbability: 100\nerrorReply: false\n");
    await run(file, controller.signal, calls);
  } finally {
    controller.abort();
    intercept.mockRestore();
    for (const [key, value] of previous) {
      if (value === undefined) delete Bun.env[key];
      else Bun.env[key] = value;
    }
    await rm(dir, { recursive: true, force: true });
  }
}

function insertOldCatalog(file: string) {
  const db = new Database(file);
  try {
    db.exec(`CREATE TABLE meme (key TEXT PRIMARY KEY, info TEXT, keyWords TEXT, params TEXT, min_texts INTEGER,
      max_texts INTEGER, min_images INTEGER, max_images INTEGER, defText TEXT, args_type TEXT, tags TEXT, createdAt TEXT, updatedAt TEXT);
      CREATE TABLE preset (name TEXT PRIMARY KEY, key TEXT, arg_name TEXT, arg_value TEXT, createdAt TEXT, updatedAt TEXT);`);
    const row = db.query("INSERT INTO meme VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, NULL)");
    for (const [key, words, texts, images, tags, infoTags] of [
      ["jinhsi", ["汐汐"], 0, 1, [], []],
      ["cat_scratch", ["猫抓"], 0, 1, [], []],
      ["kurogames_rosetta", ["罗塞塔"], 0, 1, [], []],
      ["custom", ["来自旧库"], 1, 0, [], ["戰雙帕彌什"]],
      ["stale", ["仅来源标签"], 0, 1, [" Wuthering_Waves "], []],
      ["kurogames_generic", ["猫抓"], 1, 0, ["普通"], []],
      ["avatar", ["安慰"], 0, 1, [], []],
    ] as const) {
      const defaults = texts ? ["默认"] : [];
      row.run(key, JSON.stringify({ tags: infoTags }), JSON.stringify(words), JSON.stringify({
        min_texts: texts, max_texts: texts, min_images: images, max_images: images, default_texts: defaults,
      }), texts, texts, images, images, JSON.stringify(defaults), JSON.stringify(tags));
    }
    db.query("INSERT INTO preset VALUES (?, ?, 'character', '1', NULL, NULL)")
      .run(JSON.stringify("旧专属预设"), "jinhsi");
  } finally {
    db.close();
  }
}

test("排除固定模板及明确游戏标签，保留普通素材和共享词", () => {
  expect(isExcludedMemeTemplate("KUROGAMES_ROSETTA")).toBe(true);
  expect(isExcludedMemeTemplate("kurogames_chun_holdsign", ["崩坏3"])).toBe(true);
  for (const tag of ["鸣潮", "Wuthering_Waves", "ｗｕｗａ", "战双", "戰雙帕彌什", "Punishing: Gray Raven", "PGR",
    "战场双马尾", "戰場雙馬尾", "Twin Tails Battleground"]) {
    expect(isExcludedMemeTemplate("custom", [tag])).toBe(true);
  }
  expect(isExcludedMemeTemplate("kurogames_generic", ["库洛", "猫抓", "Wuthering Waves Music"])).toBe(false);
});

test("旧目录、查询、预设、随机和戳一戳都拦截相同的禁用模板，直接生成和预览不发请求", () =>
  fixture(async (file, signal, calls) => {
    insertOldCatalog(file);
    const list = module.commands["#表情列表"]("1", owner);
    expect(list).toContain("共 2 项");
    expect(list).toContain("kurogames_generic · 猫抓");
    expect(await module.fallback("#表情搜索 汐汐", owner)).toContain("没有找到");
    expect(await module.fallback("#表情搜索 罗塞塔", owner)).toContain("没有找到");
    expect(await module.fallback("#表情搜索 猫抓", owner)).toEqual({
      type: "quoted", message: [{ type: "text", text: "1. 猫抓" }],
    });
    for (const input of ["汐汐", "罗塞塔", "来自旧库", "仅来源标签", "旧专属预设"]) {
      expect(resolveMemeTrigger(input, owner)).toBeUndefined();
      expect(await module.fallback(input, owner)).toBeUndefined();
    }
    for (const key of ["jinhsi", "kurogames_rosetta", "custom", "stale"]) {
      expect(await module.commands["#表情详情"](key, owner)).toContain("没有找到");
      expect(await requestMemePreview(key, server)).toBeUndefined();
      expect(await requestMemeImage({ key, body: new FormData() }, server)).toBeUndefined();
    }
    expect(calls).toEqual([]);
    expect(resolveMemeTrigger("猫抓", owner)).toMatchObject({ key: "kurogames_generic" });
    expect(await module.commands["#表情详情"]("猫抓", owner)).toMatchObject({ type: "quoted" });
    expect(await module.fallback("#随机表情", owner)).toBeDefined();
    const local = createModule({ signal });
    const replies: unknown[] = [];
    try {
      await local.handlePoke({ backend: "onebot", actorId: 42, botId: 99, targetId: 99, signal,
        allowed: () => true, isBotMaster: () => false, reply(message) { replies.push(message); return true; } });
    } finally {
      await local.dispose();
    }
    expect(replies).toHaveLength(1);
    expect(calls).toEqual(["GET /memes/kurogames_generic/preview", "POST /memes/kurogames_generic/", "GET /g", "POST /memes/avatar/"]);
  }));

test("启动清理旧缓存和排除预设，远端目录同步不索取已知排除模板的资料", () =>
  fixture(async (file, signal, calls) => {
    insertOldCatalog(file);
    await runAutomaticCatalogRefresh(signal, true);
    expect(await requestMemeImage({ key: "CUSTOM", body: new FormData() }, server)).toBeUndefined();
    expect(await requestMemePreview("stale", server)).toBeUndefined();
    expect(calls).toEqual([]);
    const catalog = new Database(file);
    try {
      expect(catalog.query("SELECT key FROM meme ORDER BY key").values()).toEqual([["avatar"], ["kurogames_generic"]]);
      expect(catalog.query("SELECT key FROM preset").values()).toEqual([]);
      expect(await module.fallback("#表情更新资源", owner)).toContain("更新 1 项，移除 2 项");
      expect(calls).toEqual(["GET /memes/keys", "GET /memes/custom/info", "GET /memes/ordinary/info"]);
      expect(catalog.query("SELECT key FROM meme").values()).toEqual([["ordinary"]]);
    } finally {
      catalog.close();
    }
  }));

test("从旧目录首次切换到本机目录会原子更新既有模板，后续同一版本沿用缓存", () =>
  fixture(async (file, signal, calls) => {
    insertOldCatalog(file);
    delete Bun.env.LOTUS_MEME_SERVER_URL;
    const reads: string[] = [];
    const withdraw = publishManagedMemeServer({
      catalogIdentity: "fixture-managed-v1",
      async keys() { reads.push("keys"); return ["kurogames_generic", "kurogames_chun_holdsign"]; },
      async info(key) {
        reads.push(key);
        return { key, keywords: ["新的普通表情"], tags: [],
          params_type: { min_images: 0, max_images: 0, min_texts: 0, max_texts: 0 } };
      },
      async generate() { return undefined; },
      async preview() { return undefined; },
    });
    try {
      expect(await runAutomaticCatalogRefresh(signal, true)).toContain("更新 1 项");
      expect(reads).toEqual(["keys", "kurogames_generic"]);
      expect(resolveMemeTrigger("安慰", owner)).toBeUndefined();
      expect(resolveMemeTrigger("新的普通表情", owner)).toMatchObject({ key: "kurogames_generic" });
      expect(await runAutomaticCatalogRefresh(signal, true)).toBeUndefined();
      expect(reads).toEqual(["keys", "kurogames_generic"]);
      expect(calls).toEqual([]);
    } finally {
      withdraw();
    }
  }));

const legacyMislabeled = [
  ["acacia_anan_holdsign", ["安安举牌", "夏目安安举牌"], [0, 0, 1, 1]],
  ["admission_letter", ["录取通知书"], [0, 0, 1, 1]],
  ["cinderella_eat", ["灰姑娘吃"], [1, 1, 0, 0]],
  ["clownish", ["滑稽"], [1, 1, 0, 0]],
  ["xiluo_disgust", ["希罗嫌弃", "二阶堂希罗嫌弃"], [1, 1, 0, 1]],
  ["xueli_think", ["雪莉想", "雪梨想", "橘雪莉想"], [1, 1, 0, 1]],
] as const;

test("六种旧归档误标保持可查，同键内容或来源发生变化仍按新标签过滤", () =>
  fixture(async (file, signal, calls) => {
    insertOldCatalog(file);
    const catalog = new Database(file);
    try {
      const write = catalog.query(`INSERT INTO meme
        (key, info, keyWords, params, min_images, max_images, min_texts, max_texts, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const [key, keywords, [min_images, max_images, min_texts, max_texts]] of legacyMislabeled) {
        const params = { min_images, max_images, min_texts, max_texts };
        const tags = ["鸣潮"];
        write.run(key, JSON.stringify({ key, keywords, params_type: params, tags }), JSON.stringify(keywords),
          JSON.stringify(params), min_images, max_images, min_texts, max_texts, JSON.stringify(tags));
      }
      // An unfamiliar template only shares two of the proven legacy fields.
      write.run("laydown_do", "{}", '["躺撅"]', null, 1, 1, 0, 0, '["鸣潮"]');
      write.run("sitdown_do", "{}", '["坐撅"]', null, 1, 1, 0, 0, '["鸣潮"]');
      await runAutomaticCatalogRefresh(signal, true);
      for (const [key, [keyword]] of legacyMislabeled) expect(resolveMemeTrigger(keyword, owner)).toMatchObject({ key });
      for (const keyword of ["躺撅", "坐撅"]) expect(resolveMemeTrigger(keyword, owner)).toBeUndefined();
      for (const key of ["laydown_do", "sitdown_do"]) expect(isExcludedMemeTemplate(key)).toBe(false);
      expect(calls).toEqual([]);

      catalog.query("UPDATE meme SET params = ? WHERE key = ?")
        .run('{"min_images":0,"max_images":0,"min_texts":1,"max_texts":2}', "acacia_anan_holdsign");
      catalog.query("UPDATE meme SET info = ? WHERE key = ?")
        .run('{"tags":["鸣潮","PGR"]}', "admission_letter");
      catalog.query("UPDATE meme SET keyWords = ? WHERE key = ?")
        .run('["新的游戏表情"]', "clownish");
      expect(resolveMemeTrigger("安安举牌", owner)).toBeUndefined();
      expect(resolveMemeTrigger("录取通知书", owner)).toBeUndefined();
      expect(resolveMemeTrigger("新的游戏表情", owner)).toBeUndefined();
      expect(resolveMemeTrigger("雪莉想", owner)).toMatchObject({ key: "xueli_think" });
      expect(await requestMemePreview("acacia_anan_holdsign", server)).toBeUndefined();
      expect(calls).toEqual([]);
    } finally {
      catalog.close();
    }
  }));

test("远端同名注册不会继承旧 SQLite 误标豁免", () =>
  fixture(async (_file, _signal, calls) => {
    expect(await module.fallback("#表情强制更新资源", owner)).toContain("更新 0 项");
    expect(resolveMemeTrigger("录取通知书", owner)).toBeUndefined();
    expect(await requestMemeImage({ key: "admission_letter", body: new FormData() }, server)).toBeUndefined();
    expect(calls).toEqual(["GET /memes/keys", "GET /memes/admission_letter/info"]);
  }, {
    admission_letter: { key: "admission_letter", keywords: ["录取通知书"], tags: ["鸣潮"],
      params_type: { min_images: 0, max_images: 0, min_texts: 1, max_texts: 1 } },
  }));
