import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { memeProvider, publishMemeProvider } from "../catalog-policy.ts";
import { initializeLocalCatalog } from "../catalog-update.ts";
import { scanMemeCatalogExclusions } from "../catalog-exclusions.ts";
import { requestMemeImage, requestMemePreview } from "../generate-reply.ts";
import module, { resolveMemeTrigger } from "../lotus.ts";
import { isExcludedMemeTemplate } from "../template-policy.ts";

const png = Uint8Array.fromBase64("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=");
const owner = { message_type: "private" as const, user_id: 42, isMaster: true, isBotMaster: (user: number) => user === 42 };
const parameters = { min_images: 0, max_images: 0, min_texts: 0, max_texts: 0 };

async function fixture(run: (file: string, signal: AbortSignal) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "lotus-meme-template-exclusion-"));
  const file = join(dir, "catalog.sqlite");
  const envKeys = ["LOTUS_MEME_DB", "LOTUS_MEME_CONFIG_DIR", "LOTUS_MEME_SERVER_URL"] as const;
  const previous = envKeys.map(key => [key, Bun.env[key]] as const);
  const controller = new AbortController();
  try {
    Bun.env.LOTUS_MEME_DB = file;
    Bun.env.LOTUS_MEME_CONFIG_DIR = dir;
    Bun.env.LOTUS_MEME_SERVER_URL = "http://127.0.0.1:1/ignored";
    await writeFile(join(dir, "server.yaml"), "backend: remote\nurl: invalid-legacy-value\n");
    await run(file, controller.signal);
  } finally {
    controller.abort();
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

test("只打开本机目录，保留旧预设、统计及排除记录，拒绝已知或历史禁用键", () =>
  fixture(async (file, signal) => {
    insertOldCatalog(file);
    const legacy = new Database(file);
    try {
      legacy.exec(`CREATE TABLE stat (key TEXT NOT NULL PRIMARY KEY, "all" INTEGER);
        INSERT INTO stat VALUES ('ordinary', 11);
        CREATE TABLE lotus_catalog_denied_keys (key TEXT NOT NULL PRIMARY KEY);
        INSERT INTO lotus_catalog_denied_keys VALUES ('historic-denial');`);
      legacy.query("INSERT INTO preset VALUES (?, 'ordinary', 'style', 'saved', NULL, NULL)")
        .run(JSON.stringify("普通预设"));
    } finally {
      legacy.close();
    }
    expect(resolveMemeTrigger("安慰", owner)).toContain("无法读取表情目录");

    const reads: string[] = [];
    const renders: string[] = [];
    const withdraw = publishMemeProvider({
      catalogIdentity: "test-local",
      async keys() {
        reads.push("keys");
        return ["jinhsi", "ordinary", "custom", "historic-denial", "new-tagged"];
      },
      async info(key) {
        reads.push(key);
        const name = { ordinary: "本机普通表情", custom: "旧禁新名", "historic-denial": "历史禁用", "new-tagged": "新禁" };
        return { key, keywords: [name[key as keyof typeof name]], tags: key === "new-tagged" ? ["战双"] : [], params_type: parameters };
      },
      async generate(key) { renders.push(key); return png; },
      async preview(key) { renders.push(key); return png; },
    });
    try {
      expect(await initializeLocalCatalog(signal)).toContain("表情包数据更新完成");
      expect(reads).toEqual(["keys", "ordinary", "custom", "historic-denial", "new-tagged"]);
      expect(await initializeLocalCatalog(signal)).toBeUndefined();
      expect(reads).toHaveLength(5);
      expect(resolveMemeTrigger("本机普通表情", owner)).toMatchObject({ key: "ordinary" });
      expect(resolveMemeTrigger("普通预设", owner)).toMatchObject({ key: "ordinary" });
      for (const keyword of ["安慰", "旧专属预设", "罗塞塔", "旧禁新名", "历史禁用", "新禁"]) {
        expect(resolveMemeTrigger(keyword, owner)).toBeUndefined();
      }
      const provider = memeProvider()!;
      for (const key of ["JINHSI", "custom", "historic-denial", "stale", "new-tagged"]) {
        expect(await requestMemeImage({ key, body: new FormData() }, provider)).toBeUndefined();
        expect(await requestMemePreview(key, provider)).toBeUndefined();
      }
      expect(renders).toEqual([]);
      expect(await requestMemeImage({ key: "ordinary", body: new FormData() }, provider)).toEqual(png);
      expect(await requestMemePreview("ordinary", provider)).toEqual(png);
      expect(renders).toEqual(["ordinary", "ordinary"]);
      expect(await module.commands["#表情列表"]("1", owner)).toContain("共 1 项");

      const archived = new Database(file, { readonly: true });
      try {
        expect(archived.query("SELECT key FROM main.meme ORDER BY key").values()).toEqual([
          ["avatar"], ["cat_scratch"], ["custom"], ["jinhsi"], ["kurogames_generic"], ["kurogames_rosetta"], ["stale"],
        ]);
        expect(archived.query("SELECT key, arg_value FROM preset ORDER BY key").values()).toEqual([
          ["jinhsi", "1"], ["ordinary", "saved"],
        ]);
        expect(archived.query('SELECT key, "all" FROM stat').values()).toEqual([["ordinary", 11]]);
        expect(archived.query("SELECT key FROM lotus_catalog_denied_keys ORDER BY key").values()).toEqual([
          ["custom"], ["historic-denial"], ["new-tagged"], ["stale"],
        ]);
      } finally {
        archived.close();
      }
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

test("旧归档误标只在已核实的指纹范围内豁免，同键内容变化仍记录为禁用", () =>
  fixture(async (file) => {
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
      write.run("laydown_do", "{}", '["躺撅"]', null, 1, 1, 0, 0, '["鸣潮"]');
      write.run("sitdown_do", "{}", '["坐撅"]', null, 1, 1, 0, 0, '["鸣潮"]');
      const initial = scanMemeCatalogExclusions(catalog);
      expect([...initial.correctedArchiveKeys].sort()).toEqual(legacyMislabeled.map(([key]) => key).sort());
      for (const key of ["laydown_do", "sitdown_do"]) expect(initial.keys.has(key)).toBe(true);

      catalog.query("UPDATE meme SET params = ? WHERE key = ?")
        .run('{"min_images":0,"max_images":0,"min_texts":1,"max_texts":2}', "acacia_anan_holdsign");
      catalog.query("UPDATE meme SET info = ? WHERE key = ?")
        .run('{"tags":["鸣潮","PGR"]}', "admission_letter");
      catalog.query("UPDATE meme SET keyWords = ? WHERE key = ?")
        .run('["新的游戏表情"]', "clownish");
      const changed = scanMemeCatalogExclusions(catalog);
      for (const key of ["acacia_anan_holdsign", "admission_letter", "clownish"]) expect(changed.keys.has(key)).toBe(true);
      expect(changed.correctedArchiveKeys.has("xueli_think")).toBe(true);
    } finally {
      catalog.close();
    }
  }));

test("本机注册的新同名内容不会继承旧 SQLite 误标豁免", () =>
  fixture(async (_file, signal) => {
    const withdraw = publishMemeProvider({
      catalogIdentity: "test-tagged-local",
      async keys() { return ["admission_letter"]; },
      async info(key) {
        return { key, keywords: ["录取通知书"], tags: ["鸣潮"], params_type: {
          ...parameters, min_texts: 1, max_texts: 1,
        } };
      },
      async generate() { throw new Error("禁用模板不能生成"); },
      async preview() { throw new Error("禁用模板不能预览"); },
    });
    try {
      expect(await initializeLocalCatalog(signal)).toContain("更新 0 项");
      expect(resolveMemeTrigger("录取通知书", owner)).toBeUndefined();
      expect(await requestMemeImage({ key: "admission_letter", body: new FormData() }, memeProvider()!)).toBeUndefined();
    } finally {
      withdraw();
    }
  }));
