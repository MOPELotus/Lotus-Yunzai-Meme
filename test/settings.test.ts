import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { catalogPolicy, catalogRefreshSchedule, configDirectory, generationServer, generationSettings } from "../catalog-policy.ts";
import module from "../lotus.ts";
import { buildGenerationBody } from "../generation.ts";
import { handleMemeSettings, supportGuoba } from "../settings.ts";

test("表情设置命令可安全更新旧 YAML 并即时生效", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lotus-meme-settings-"));
  const previous = Bun.env.LOTUS_MEME_CONFIG_DIR;
  try {
    Bun.env.LOTUS_MEME_CONFIG_DIR = directory;
    const meme = join(directory, "meme.yaml");
    const access = join(directory, "access.yaml");
    const source = "# 保留旧注释\nforceSharp: true # 前缀设置\ncache: true\n未知字段: { a: 1 }\n";
    await writeFile(meme, source, { mode: 0o640 });
    await writeFile(access, "enable: true\nmode: 0\nuserWhiteList: [10001]\nblackList: []\n");
    const owner = { message_type: "group" as const, user_id: 10001, isMaster: true, isBotMaster: () => false };
    const user = { ...owner, isMaster: false };
    const milkyOwner = { ...user, isBotMaster: (id: number) => id === 10001 };
    function settings(argument: string, actor: Parameters<typeof module.fallback>[1]) {
      return module.fallback("#表情合成设置 " + argument, actor);
    }
    expect(await module.fallback("#清语表情设置强制触发关闭", owner)).toBeUndefined();
    expect(await settings("强制触发关闭", { ...owner, isDelegated: true })).toContain("只有主人");
    expect(await settings("强制触发关闭", user)).toContain("只有主人");
    expect(await module.fallback("#表情合成设置强制触发关闭", user)).toBe("只有主人可以修改表情合成设置。");
    expect(await readFile(meme, "utf8")).toBe(source);
    expect(await settings("强制触发", owner)).toBe("强制触发：开启");
    expect(await module.fallback("#表情设置 强制触发", owner)).toBe("强制触发：开启");
    expect(await readFile(meme, "utf8")).toBe(source);

    expect(await module.fallback("#表情合成设置表情设置 强制触发关闭", owner)).toBe("强制触发：关闭");
    expect(catalogPolicy(10001, true).forceSharp).toBe(false);
    expect(await readFile(meme, "utf8")).toContain("# 保留旧注释");
    expect(await readFile(meme, "utf8")).toContain("# 前缀设置");
    expect(Bun.YAML.parse(await readFile(meme, "utf8"))).toEqual({
      forceSharp: false, cache: true, 未知字段: { a: 1 },
    });
    expect((await stat(meme)).mode & 0o777).toBe(0o640);
    expect(await settings("引用回复开启", milkyOwner)).toBe("引用回复：开启");
    expect(generationSettings().quote).toBe(true);
    expect(await settings("缓存关闭", milkyOwner)).toBe("头像缓存：关闭");
    expect(generationSettings().avatarCache).toBe(false);

    expect(await settings("名单设置 用户白名单 添加", {
      ...owner, message: [{ type: "at", qq: 10001 }, { type: "at", qq: 10002 }],
    })).toBe("用户白名单：10001、10002");
    expect(catalogPolicy(10002).allowed).toBe(true);
    expect(await settings("用户白名单 删除10001", owner)).toBe("用户白名单：10002");
    expect(catalogPolicy(10001).allowed).toBe(false);
    expect(await settings("黑名单表情列表 添加可莉吃", owner)).toBe("黑名单表情列表：可莉吃");
    expect(await settings("禁用表情列表开启", owner)).toBe("禁用表情列表：开启");
    expect(catalogPolicy(10002).hidden).toEqual(["可莉吃"]);

    const protect = join(directory, "protect.yaml");
    const oldProtection = `# 旧保护设置
enable: false
master: false
userEnable: false
user: 10002
list: []
保留字段: 原样
`;
    await writeFile(protect, oldProtection);
    expect(await settings("保护用户列表", milkyOwner)).toBe("保护用户列表：10002");
    expect(await settings("保护用户列表 添加10002", milkyOwner)).toBe("保护用户列表：10002");
    expect(await readFile(protect, "utf8")).toBe(oldProtection);
    expect(await settings("表情保护列表 添加旧关键词", milkyOwner)).toBe("表情保护列表：旧关键词");
    expect(await settings("表情保护开启", milkyOwner)).toBe("表情保护：开启");
    expect(await settings("用户保护开启", milkyOwner)).toBe("用户保护：开启");

    const recipe = JSON.stringify({ min_images: 1, max_images: 2, min_texts: 0, max_texts: 0 });
    async function imageOrder(isMaster: boolean, targetMaster = false) {
      const prepared = await buildGenerationBody("fixture", ["旧关键词"], "", recipe, {
        user_id: 10001, isMaster, mentions: [10002],
        avatar: async (user) => new Blob([user]), isTargetMaster: () => targetMaster,
      });
      if (typeof prepared === "string") throw new Error(prepared);
      return await Promise.all(prepared.body.getAll("images").map((image) => (image as Blob).text()));
    }
    expect(await imageOrder(false)).toEqual(["10001", "10002"]);
    expect(await settings("主人保护开启", milkyOwner)).toBe("主人保护：开启");
    expect(await imageOrder(false, false)).toEqual(["10002", "10001"]);
    expect(await imageOrder(false, true)).toEqual(["10001", "10002"]);
    expect(await imageOrder(true, true)).toEqual(["10002", "10001"]);
    expect(await settings("保护用户列表 添加10003", milkyOwner)).toBe("保护用户列表：10002、10003");
    expect(await settings("保护用户列表 删除10002", milkyOwner)).toBe("保护用户列表：10003");
    expect(await readFile(protect, "utf8")).toContain("# 旧保护设置");
    expect(Bun.YAML.parse(await readFile(protect, "utf8"))).toEqual({
      enable: true, master: true, userEnable: true, user: ["10003"], list: ["旧关键词"], 保留字段: "原样",
    });

    expect(await settings("戳一戳触发开启", milkyOwner)).toBe("戳一戳表情：开启");
    expect(await settings("统计设置表情统计关闭", milkyOwner)).toBe("表情统计：关闭");
    expect(await settings("其他设置自动更新资源关闭", milkyOwner)).toContain("重启后");
    expect(await settings("服务设置 超时时间9", milkyOwner)).toBe("请求超时（秒）：9 秒");
    expect(await settings("服务设置 自定义地址https://example.test/meme/", milkyOwner)).toBe("服务地址：已配置");
    expect(Bun.YAML.parse(await readFile(join(directory, "server.yaml"), "utf8"))).toEqual({
      timeout: 9, url: "https://example.test/meme/",
    });
    const overview = await settings("", milkyOwner);
    expect(overview).toContain("用户白名单：已配置 1 项");
    expect(overview).not.toContain("10002");
    expect(overview).not.toContain("https://example.test");
    expect(await settings("服务设置 自定义地址清除", milkyOwner)).toBe("服务地址：未配置");

    await writeFile(meme, "forceSharp: [\n");
    expect(await settings("强制触发关闭", owner)).toContain("无法读取或保存");
    expect(await readFile(meme, "utf8")).toBe("forceSharp: [\n");
    const alternate = join(directory, "alternate");
    await writeFile(alternate, "forceSharp: true\n");
    await rm(meme);
    await symlink(alternate, meme);
    expect(await settings("强制触发关闭", owner)).toContain("无法读取或保存");
    expect(await readFile(alternate, "utf8")).toBe("forceSharp: true\n");
  } finally {
    if (previous === undefined) delete Bun.env.LOTUS_MEME_CONFIG_DIR;
    else Bun.env.LOTUS_MEME_CONFIG_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  }
});

test("原生表情面板只写明确编辑的运行项，保留旧 YAML 与目录优先级", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lotus-meme-guoba-"));
  const previousDirectory = Bun.env.LOTUS_MEME_CONFIG_DIR;
  const previousServer = Bun.env.LOTUS_MEME_SERVER_URL;
  const Result = { ok: () => ({ ok: true }), error: (_message: string, status: number) => ({ ok: false, status }) };
  try {
    delete Bun.env.LOTUS_MEME_CONFIG_DIR;
    expect(configDirectory()).toBe(fileURLToPath(new URL("../../../data/meme/config/", import.meta.url)));
    Bun.env.LOTUS_MEME_CONFIG_DIR = directory;
    Bun.env.LOTUS_MEME_SERVER_URL = "http://127.0.0.1:1/env";
    expect(configDirectory()).toBe(directory);

    const original = {
      meme: "\uFEFF# 原表情设置\r\nenable: false\r\nreply: false # 原引用\r\ncache: true\r\ncustom: {flag:keep}\r\n",
      access: "# 保留紧凑流式样式\r\n{enable: true, mode: 0, userWhiteList: [10001], custom: keep,}\r\n",
      protect: "# 老配置保存一个 QQ\nuser: 10002\n",
      server: "url: 'http://127.0.0.1:1/saved' # 本地值\ntimeout: 5\nretry: 4\n",
      other: "autoUpdateRes: true\nautoUpdateResCron: '0 0 2 * * ?'\nautoUpdate: false\n",
    };
    const path = (file: string) => join(directory, file + ".yaml");
    const read = (file: string) => readFile(path(file), "utf8");
    await Promise.all(Object.entries(original).map(([file, text]) => writeFile(path(file), text, { mode: 0o640 })));
    const { configInfo: form } = supportGuoba();
    const fields = form.schemas.flatMap(schema => "field" in schema ? [schema.field] : []);
    expect(fields).toHaveLength(27);
    expect(fields).toContain("meme.cache");
    for (const field of ["server.retry", "other.autoUpdate", "other.hijackRes", "other.renderScale"]) {
      expect(fields).not.toContain(field);
    }
    expect(form.getConfigData()).toMatchObject({
      meme: { enable: false, reply: false, cache: true, imagesInMessage: true, pokeEnable: false, pokeProbability: 50, pokeLimit: 20 },
      access: { mode: 0, userWhiteList: [10001] }, protect: { user: [10002] },
      server: { url: "http://127.0.0.1:1/saved", timeout: 5 }, stat: { enable: true },
    });
    expect(generationServer()?.base.href).toBe("http://127.0.0.1:1/env");

    expect(form.setConfigData({ "meme.reply": true, "access.mode": 1, "protect.user": [], "server.timeout": 999 }, {
      Result, changedFields: ["meme.reply", "access.mode"],
    })).toEqual({ ok: true });
    expect(await read("meme")).toBe(original.meme.replace("reply: false", "reply: true"));
    expect(await read("access")).toBe(original.access.replace("mode: 0", "mode: 1"));
    expect(generationSettings().quote).toBe(true);
    expect(catalogPolicy(10001).allowed).toBe(true);
    expect((await stat(path("meme"))).mode & 0o777).toBe(0o640);
    for (const file of ["protect", "server", "other"] as const) expect(await read(file)).toBe(original[file]);

    for (const invalid of [
      { "meme.cache": "false" }, { "protect.user": ["bad-id"] }, { "access.mode": 7 },
      { "server.timeout": 0 }, { "server.url": "http://user@127.0.0.1/" },
      { "other.autoUpdateResCron": "0 0 99 * * *" }, { "other.autoUpdateResCron": "tomorrow" },
      { "meme.pokeProbability": 101 }, { "meme.pokeLimit": -1 }, { "meme.pokeLimit": 1.5 },
    ]) {
      expect(form.setConfigData({ "meme.reply": false, ...invalid }, { Result })).toEqual({ ok: false, status: 422 });
    }
    expect(await read("meme")).toBe(original.meme.replace("reply: false", "reply: true"));
    expect(await read("server")).toBe(original.server);
    expect(await read("other")).toBe(original.other);

    expect(form.setConfigData({ "meme.cache": false, "meme.pokeEnable": true, "meme.pokeProbability": 0, "meme.pokeLimit": 0 }, { Result }))
      .toEqual({ ok: true });
    expect(form.getConfigData().meme).toMatchObject({ reply: true, cache: false, pokeEnable: true, pokeProbability: 0, pokeLimit: 0 });
    expect(generationSettings().avatarCache).toBe(false);
    const withPoke = await read("meme");

    expect(form.setConfigData({ "other.autoUpdateResCron": "*/15 * * * ?", "stat.enable": false }, { Result })).toEqual({ ok: true });
    expect(catalogRefreshSchedule()).toBe("0 */15 * * * *");
    expect(form.getConfigData().stat).toEqual({ enable: false });
    expect(form.setConfigData({ "protect.user": [10002, "10003"] }, { Result })).toEqual({ ok: true });
    expect(await read("protect")).toBe(original.protect.replace("user: 10002", 'user: [10002,"10003"]'));
    await writeFile(path("stat"), "enable: [\n");
    expect(() => form.setConfigData({ "meme.reply": false, "stat.enable": true }, { Result })).toThrow();
    expect(await read("meme")).toBe(withPoke);
  } finally {
    if (previousDirectory === undefined) delete Bun.env.LOTUS_MEME_CONFIG_DIR;
    else Bun.env.LOTUS_MEME_CONFIG_DIR = previousDirectory;
    if (previousServer === undefined) delete Bun.env.LOTUS_MEME_SERVER_URL;
    else Bun.env.LOTUS_MEME_SERVER_URL = previousServer;
    await rm(directory, { recursive: true, force: true });
  }
});

test("面板与聊天设置隐藏下线模板，拒绝通过旧键和别名再次添加", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lotus-meme-unavailable-"));
  const previous = Bun.env.LOTUS_MEME_CONFIG_DIR;
  const previousCatalog = Bun.env.LOTUS_MEME_DB;
  const Result = { ok: () => ({ ok: true }), error: (_message: string, status: number) => ({ ok: false, status }) };
  try {
    Bun.env.LOTUS_MEME_CONFIG_DIR = directory;
    Bun.env.LOTUS_MEME_DB = join(directory, "catalog.sqlite");
    const database = new Database(Bun.env.LOTUS_MEME_DB);
    try {
      database.exec("CREATE TABLE meme (key TEXT, keyWords TEXT, tags TEXT)");
      const insert = database.query("INSERT INTO meme VALUES (?, ?, ?)");
      insert.run("old_custom_key", JSON.stringify(["陈旧别名", "共享别名"]), JSON.stringify(["鸣潮"]));
      insert.run("ordinary_cat", JSON.stringify(["共享别名"]), JSON.stringify(["猫"]));
    } finally {
      database.close();
    }
    const access = join(directory, "access.yaml");
    const protect = join(directory, "protect.yaml");
    const oldAccess = "blackListEnable: true\nblackList: [jinhsi, 今汐, kuroGames_rosetta, old_custom_key, 共享别名, 可莉吃]\n";
    const oldProtect = "list: [今汐, 小猫]\nuser: 10001\n";
    await writeFile(access, oldAccess);
    await writeFile(protect, oldProtect);
    const { configInfo: form } = supportGuoba();
    expect(form.getConfigData()).toMatchObject({ access: { blackList: ["共享别名", "可莉吃"] }, protect: { list: ["小猫"], user: [10001] } });
    const owner = { isMaster: true };
    expect(handleMemeSettings("#表情合成设置 黑名单表情列表", owner)).toBe("黑名单表情列表：共享别名、可莉吃");
    expect(handleMemeSettings("#表情合成设置 表情保护列表 添加 jinhsi", owner)).toBe("该表情不在可管理目录中。");
    expect(form.setConfigData({ "access.blackList": ["今汐"], "protect.list": ["保持原样"] }, { Result }))
      .toEqual({ ok: false, status: 422 });
    expect(form.setConfigData({ "access.blackList": ["old_custom_key"] }, { Result })).toEqual({ ok: false, status: 422 });
    expect(form.setConfigData({ "access.blackList": ["kurogames_rosetta"] }, { Result })).toEqual({ ok: false, status: 422 });
    expect(form.setConfigData({ "protect.list": ["爱弥斯抓"] }, { Result })).toEqual({ ok: false, status: 422 });
    expect(await readFile(access, "utf8")).toBe(oldAccess);
    expect(await readFile(protect, "utf8")).toBe(oldProtect);
    expect(handleMemeSettings("#表情合成设置 黑名单表情列表 删除 jinhsi", owner)).toBe("黑名单表情列表：共享别名、可莉吃");
    expect(Bun.YAML.parse(await readFile(access, "utf8"))).toEqual({
      blackListEnable: true, blackList: ["今汐", "kuroGames_rosetta", "old_custom_key", "共享别名", "可莉吃"],
    });
    expect(form.setConfigData({ "protect.list": ["小猫", "共享别名"] }, { Result })).toEqual({ ok: true });
    expect(Bun.YAML.parse(await readFile(protect, "utf8"))).toEqual({ list: ["小猫", "共享别名"], user: 10001 });
  } finally {
    if (previous === undefined) delete Bun.env.LOTUS_MEME_CONFIG_DIR;
    else Bun.env.LOTUS_MEME_CONFIG_DIR = previous;
    if (previousCatalog === undefined) delete Bun.env.LOTUS_MEME_DB;
    else Bun.env.LOTUS_MEME_DB = previousCatalog;
    await rm(directory, { recursive: true, force: true });
  }
});
