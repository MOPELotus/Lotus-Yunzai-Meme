import { Database } from "bun:sqlite";
import { expect, spyOn, test } from "bun:test";
import { mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import module, { prepareMemeRequest, resolveMemeTrigger } from "../lotus.ts";
import { nativeCatalogTable } from "../catalog-file.ts";
import { publishMemeProvider } from "../catalog-policy.ts";

test("旧随机表情仅选择可用的单图或单文本模板，并沿普通生成发送说明和图片", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lotus-meme-random-"));
  const filename = join(directory, "data.db");
  const environment = {
    LOTUS_MEME_DB: Bun.env.LOTUS_MEME_DB,
    LOTUS_MEME_CONFIG_DIR: Bun.env.LOTUS_MEME_CONFIG_DIR,
    LOTUS_MEME_SERVER_URL: Bun.env.LOTUS_MEME_SERVER_URL,
  };
  const png = Uint8Array.fromBase64("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=");
  const requests: { key: string; texts: FormDataEntryValue[]; image?: Uint8Array }[] = [];
  let fail = false;
  const identity = "lotus-skia:fixture-random";
  const withdraw = publishMemeProvider({
    catalogIdentity: identity,
    async keys() { return ["selected"]; },
    async info() { throw new Error("unchanged local catalog should not be rebuilt"); },
    async generate(key, form) {
      const image = form.get("images");
      requests.push({ key, texts: form.getAll("texts"), image: image instanceof Blob ? await image.bytes() : undefined });
      return fail ? undefined : png;
    },
    async preview() { return; },
  });
  try {
    const db = new Database(filename);
    db.run(`CREATE TABLE ${nativeCatalogTable} (key TEXT PRIMARY KEY, keyWords TEXT, min_images INTEGER, max_images INTEGER,
      min_texts INTEGER, max_texts INTEGER, params TEXT, defText TEXT);
      CREATE TABLE preset (name TEXT PRIMARY KEY, key TEXT, arg_name TEXT, arg_value TEXT);
      CREATE TABLE lotus_catalog_provider (id INTEGER PRIMARY KEY, identity TEXT NOT NULL);`);
    db.run("INSERT INTO lotus_catalog_provider VALUES (1, ?)", [identity]);
    const insert = db.query(`INSERT INTO ${nativeCatalogTable} VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const [key, images, texts, defaults] of [
      ["selected", 1, 1, ["默认文字"]], ["blocked-key", 1, 1, ["禁用"]],
      ["blocked-alias", 1, 1, ["禁用"]], ["no-default", 1, 1, null],
      ["too-complex", 2, 2, ["多图"]],
    ] as const) {
      insert.run(key, JSON.stringify([`关键词-${key}`]), images, images, texts, texts,
        JSON.stringify({ min_images: images, max_images: images, min_texts: texts, max_texts: texts, default_texts: defaults }),
        JSON.stringify(defaults));
    }
    insert.run("dianzhongdian", JSON.stringify(["典中典"]), 1, 1, 1, 2,
      JSON.stringify({ min_images: 1, max_images: 1, min_texts: 1, max_texts: 2, default_texts: ["救命啊"] }),
      JSON.stringify(["救命啊"]));
    db.close();
    const before = await readFile(filename);
    Bun.env.LOTUS_MEME_DB = filename;
    Bun.env.LOTUS_MEME_CONFIG_DIR = directory;
    Bun.env.LOTUS_MEME_SERVER_URL = "http://legacy.invalid/remote";
    await writeFile(join(directory, "server.yaml"), "backend: obsolete\nurl: [invalid]\n");
    const access = join(directory, "access.yaml");
    const meme = join(directory, "meme.yaml");
    const hidden = "blackListEnable: true\nblackList: [blocked-key, 关键词-blocked-alias]\n";
    await writeFile(access, hidden);
    await writeFile(meme, "forceSharp: true\nreply: true\n");
    const input = {
      message_type: "group" as const, user_id: 10001, isMaster: false, isBotMaster: () => false,
      reply_id: 42,
      lookupReply: async () => ({ user_id: 10002, message: [{ type: "image", file: png }] }),
    };
    expect(await module.fallback("随机表情包", input)).toBeUndefined();
    expect(await module.fallback("#表情随机表情包", input)).toEqual({
      type: "quoted",
      message: ["本次随机表情信息如下\n表情的名称：selected\n表情的别名：[关键词-selected]\n", { type: "image", file: png }],
    });
    expect(requests).toEqual([{ key: "selected", texts: ["默认文字"], image: png }]);

    expect(await module.fallback("#随机meme", {
      ...input, lookupReply: async () => {
        await writeFile(access, hidden + "enable: true\nmode: 0\nuserWhiteList: []\n");
        return input.lookupReply();
      },
    })).toContain("无权");
    expect(requests).toHaveLength(1);
    // 典中典 is the only single-image template with a default caption left.
    await writeFile(access, "blackListEnable: true\nblackList: [selected, blocked-key, 关键词-blocked-alias]\n");
    expect(await module.fallback("#随机表情", input)).toContain("未找到可用");
    expect(requests).toHaveLength(1);
    await writeFile(access, hidden);
    await writeFile(meme, "errorReply: false\n");
    fail = true;
    expect(await module.fallback("#随机表情", input)).toBeUndefined();
    expect(requests).toHaveLength(2);
    expect(await readFile(filename)).toEqual(before);
  } finally {
    withdraw();
    for (const [key, value] of Object.entries(environment)) {
      if (value === undefined) delete Bun.env[key];
      else Bun.env[key] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
});

test("从本机表情目录分页并查询详情，数据库保持不变", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lotus-meme-catalog-"));
  const filename = join(directory, "data.db");
  const previousPath = Bun.env.LOTUS_MEME_DB;
  const previousConfiguration = Bun.env.LOTUS_MEME_CONFIG_DIR;
  const identity = "lotus-skia:fixture-commands";
  let withdraw: (() => void) | undefined;
  try {
    const db = new Database(filename);
    db.run(`CREATE TABLE ${nativeCatalogTable} (
      key TEXT PRIMARY KEY, keyWords TEXT, min_images INTEGER, max_images INTEGER,
      min_texts INTEGER, max_texts INTEGER, params TEXT, info TEXT
    );
    CREATE TABLE preset (name TEXT PRIMARY KEY, key TEXT, arg_name TEXT, arg_value TEXT);
    CREATE TABLE lotus_catalog_provider (id INTEGER PRIMARY KEY, identity TEXT NOT NULL);`);
    db.run("INSERT INTO lotus_catalog_provider VALUES (1, ?)", [identity]);
    const insert = db.query(`INSERT INTO ${nativeCatalogTable} VALUES (?, ?, 1, 2, 0, 1, NULL, NULL)`);
    for (let index = 1; index <= 13; index++) {
      insert.run(`meme-${String(index).padStart(2, "0")}`, JSON.stringify(["表情", "样例", `别名${index}`,
        `${index}组合甲`, `${index}组合乙`, `${index}组合丙`]));
    }
    db.run(`UPDATE ${nativeCatalogTable} SET keyWords = ?, max_texts = 0 WHERE key = ?`, [JSON.stringify(["只图", "a+b"]), "meme-12"]);
    db.run(`UPDATE ${nativeCatalogTable} SET params = ? WHERE key = ?`, [JSON.stringify({
      min_images: 1, max_images: 2, min_texts: 0, max_texts: 0, args_type: {
        args_model: { properties: {
          user_infos: { type: "array" },
          number: { type: "integer", default: 2 },
          circle: { type: "boolean", default: false },
          mode: { type: "string", enum: ["left", "right"], default: "left" },
        } },
        parser_options: [
          { names: ["-n", "--number"], args: [{ name: "number" }] },
          { names: ["--circle", "圆"], args: null, action: { type: 0, value: true } },
          { names: ["--right"], args: null, dest: "mode", action: { type: 0, value: "right" } },
        ],
      },
    }), "meme-12"]);
    db.run(`UPDATE ${nativeCatalogTable} SET params = ? WHERE key = ?`, [JSON.stringify({
      min_images: 1, max_images: 4, min_texts: 2, max_texts: 3, default_texts: ["默认"], args_type: null,
    }), "meme-13"]);
    db.close();
    const before = await readFile(filename);

    Bun.env.LOTUS_MEME_DB = filename;
    Bun.env.LOTUS_MEME_CONFIG_DIR = directory;
    expect(module.commands["#表情列表"]("")).toContain("表情列表 1/2（共 13 项）");
    expect(module.commands["#表情列表"]("2")).toContain("meme-13 · 表情、样例");
    expect(module.commands["#表情列表"]("3")).toBe("表情目录共有 2 页。");
    expect(await module.commands["#表情详情"]("meme-13")).toContain("图片：1–2 张");
    expect(await module.commands["#表情详情"]("missing")).toContain("没有找到对应表情");
    expect(await module.commands["#表情详情"]("别名13")).toContain("表情 meme-13");
    expect(await module.commands["#表情详情"]("表情")).toContain("对应多个表情");
    const search = module.commands["#表情搜索"];
    const found = { type: "quoted" as const, message: [{ type: "text" as const, text: "1. a+b" }] };
    expect(search("A+")).toEqual(found);
    expect(search("表情")).toEqual({ type: "quoted", message: [{ type: "text", text: "1. 表情" }] });
    expect(search("组合")).toMatchObject({ type: "forward", nodes: [[{ text: "表情搜索 · 36 个关键词" }],
      [{ text: expect.stringContaining("30. ") }], [{ text: expect.stringContaining("36. ") }]] });
    expect(search("missing")).toContain("没有找到");
    expect(search("")).toContain("用法");
    const searchContext = { message_type: "group" as const, user_id: 10003, isMaster: false, isBotMaster: () => false };
    expect(await module.fallback("#表情搜索A+", searchContext)).toEqual(found);
    expect(await module.fallback("#清语表情搜索A+", searchContext)).toBeUndefined();
    const access = join(directory, "access.yaml");
    await writeFile(access, 'blackListEnable: true\nblackList: ["a+b"]\n');
    expect(search("A+")).toContain("没有找到");
    await writeFile(access, "enable: true\nmode: 0\nuserWhiteList: [10001]\n");
    expect(search("A+", searchContext)).toContain("无权");
    expect(search("A+", { user_id: 10001 })).toEqual(found);
    await rm(access);
    expect(resolveMemeTrigger("别名13 好耶")).toEqual({ key: "meme-13", keyword: "别名13", text: "好耶" });
    expect(resolveMemeTrigger("#A+B @10001")).toEqual({ key: "meme-12", keyword: "a+b", text: "@10001" });
    expect(resolveMemeTrigger("#只图普通聊天")).toBeUndefined();

    const moduleConfig = join(directory, "meme.yaml");
    await writeFile(moduleConfig, "forceSharp: true\n");
    expect(resolveMemeTrigger("别名13 好耶")).toBeUndefined();
    expect(resolveMemeTrigger("#别名13 好耶")).toEqual({ key: "meme-13", keyword: "别名13", text: "好耶" });

    const argumentInput = {
      user_id: 10003, isMaster: false,
      images: [new Blob(["fixture"])],
      nickname: async () => "测试昵称",
      gender: async () => "female" as const,
    };
    async function argsFor(message: string) {
      const result = await prepareMemeRequest(message, argumentInput);
      if (!result || typeof result === "string") throw new Error(String(result));
      expect(result.body.getAll("texts")).toEqual([]);
      return JSON.parse(String(result.body.get("args")));
    }
    expect(await argsFor("#只图")).toEqual({ user_infos: [{ name: "测试昵称", gender: "female" }] });
    expect(await argsFor("#只图 #number 5 #circle false")).toEqual({
      user_infos: [{ name: "测试昵称", gender: "female" }], number: 5, circle: false,
    });
    expect(await argsFor("#只图 -n -2 --circle --right")).toEqual({
      user_infos: [{ name: "测试昵称", gender: "female" }], number: -2, circle: true, mode: "right",
    });
    expect(await argsFor("#只图 圆")).toEqual({
      user_infos: [{ name: "测试昵称", gender: "female" }], circle: true,
    });
    expect(await prepareMemeRequest("#只图 圆形", argumentInput)).toBeUndefined();
    expect(await prepareMemeRequest("#只图 --number", argumentInput)).toContain("缺少值");
    expect(await prepareMemeRequest("#只图 #mode 中间", argumentInput)).toContain("值无效");
    expect(await prepareMemeRequest("#只图 #user_infos user", argumentInput)).toContain("不支持参数");
    expect(await prepareMemeRequest("#只图 -n 2 普通聊天", argumentInput)).toBeUndefined();
    expect(await prepareMemeRequest("#只图 --unknown", argumentInput)).toBeUndefined();

    const protectConfig = join(directory, "protect.yaml");
    await writeFile(protectConfig, "enable: true\nmaster: true\nlist: [别名13]\n");
    await writeFile(moduleConfig, "forceSharp: true\nuserName: true\nreply: true\n");
    const input = {
      user_id: 10003, isMaster: false, mentions: [10001, 10002, 10001, 10004],
      images: [new Blob(["当前图片"], { type: "image/png" })],
      quoted: { userId: 10004, images: [new Blob(["引用图片"], { type: "image/png" })] },
      avatar: async (user: string) => new Blob([user], { type: "image/png" }),
      nickname: async () => "昵称",
    };
    expect(await prepareMemeRequest("#别名13 @10001", input)).toContain("确认目标的主人身份");
    const prepared = await prepareMemeRequest("#别名13 @10001", {
      ...input, isTargetMaster: (user) => user === "10002",
    });
    if (!prepared || typeof prepared === "string") throw new Error("未生成请求体");
    expect(prepared.key).toBe("meme-13");
    expect(prepared.quote).toBe(true);
    const transmitted = prepared.body;
    expect(transmitted.getAll("texts")).toEqual(["昵称", "默认"]);
    expect(await Promise.all(transmitted.getAll("images").map((image) => (image as Blob).text()))).toEqual([
      "10002", "10001", "引用图片", "当前图片",
    ]);

    await writeFile(protectConfig, "enable: true\nuserEnable: true\nuser: 10002\nlist: [meme-13]\n");
    const fallback = await prepareMemeRequest("#别名13 第一段 / 第二段", {
      user_id: 10003, isMaster: false, mentions: [10002], avatar: input.avatar,
    });
    if (!fallback || typeof fallback === "string") throw new Error("未生成头像回填请求");
    expect(fallback.body.getAll("texts")).toEqual(["第一段", "第二段"]);
    expect(await Promise.all(fallback.body.getAll("images").map((image) => (image as Blob).text()))).toEqual([
      "10003", "10002",
    ]);

    const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=";
    let received: FormData | undefined;
    let count = 0;
    let renderFailed = false;
    withdraw = publishMemeProvider({
      catalogIdentity: identity,
      async keys() { return ["meme-13"]; },
      async info() { throw new Error("unchanged local catalog should not be rebuilt"); },
      async generate(key, body, signal) {
        expect(key).toBe("meme-13");
        expect(signal).toBeInstanceOf(AbortSignal);
        received = body;
        count++;
        if (!renderFailed) return Uint8Array.fromBase64(png);
      },
      async preview() { return; },
    });
    const fallbackContext = {
      message_type: "group" as const,
      user_id: 10003, isMaster: false, isBotMaster: () => false,
      message: [{ type: "image", file: `base64://${png}` }],
    };
    expect(await module.fallback("别名13 前 / 后", fallbackContext)).toBeUndefined();
    expect(await module.fallback("#别名13 前 / 后", {
      ...fallbackContext, message: [{ type: "image", url: "https://legacy.invalid/elsewhere" }],
    })).toContain("无法读取");
    expect(await module.fallback("#别名13 前 / 后", { ...fallbackContext, reply_id: 42 })).toContain("引用消息");
    expect(count).toBe(0);
    const reply = await module.fallback("#别名13 前 / 后", fallbackContext);
    expect(reply).toEqual({ type: "quoted", message: { type: "image", file: Uint8Array.fromBase64(png) } });
    expect(received?.getAll("texts")).toEqual(["前", "后"]);
    expect(await (received?.get("images") as Blob).bytes()).toEqual(Uint8Array.fromBase64(png));
    expect(count).toBe(1);

    const sourceBytes = Uint8Array.fromBase64(png);
    const tagged = (tag: number) => Uint8Array.from([...sourceBytes, tag]);
    let lookups = 0;
    const withQuotedImage = {
      ...fallbackContext, reply_id: 42,
      lookupReply: async () => {
        lookups++;
        return { user_id: 10004, message: [{ type: "image", file: tagged(42) }] };
      },
    };
    expect(await module.fallback("#别名13 前 / 后", withQuotedImage)).toEqual(reply);
    expect(lookups).toBe(1);
    expect(await module.fallback("#别名13 前 / 后", {
      ...withQuotedImage,
      lookupReply: async () => ({ user_id: 10004, message: [
        { type: "image", url: "https://legacy.invalid/elsewhere" },
      ] }),
    })).toContain("无法读取引用消息中的表情图片");
    const sentImages = async () => {
      if (!received) throw new Error("没有收到表情生成请求");
      return Promise.all(received.getAll("images").map((image) => (image as Blob).bytes()));
    };
    expect(await sentImages()).toEqual([tagged(42), sourceBytes]);

    const fetchedAvatars: string[] = [];
    const fetchedImages: string[] = [];
    const signedImage = "https://multimedia.nt.qq.com.cn/download?appid=1406&fileid=ab%2Fcd&rkey=ef%2Bgh";
    const oldPrivateImage = "https://c2cpicdw.qpic.cn/offpic_new/10004/clip/0";
    const mockFetch = async (...[request, options]: Parameters<typeof fetch>) => {
      const url = new URL(request instanceof Request ? request.url : request.toString());
      if (url.href === signedImage || url.href === oldPrivateImage) {
        fetchedImages.push(url.href);
        expect(options?.redirect).toBe("error");
        expect(options?.signal).toBeInstanceOf(AbortSignal);
        return new Response(tagged(url.href === signedImage ? 45 : 46));
      }
      if (url.origin !== "https://q1.qlogo.cn" || url.pathname !== "/g") {
        throw new Error("不应访问外部地址");
      }
      const user = url.searchParams.get("nk") ?? "";
      fetchedAvatars.push(user);
      expect(options?.redirect).toBe("error");
      return new Response(tagged(user === "10004" ? 44 : 43));
    };
    const intercept = spyOn(globalThis, "fetch").mockImplementation(Object.assign(mockFetch, {
      preconnect: globalThis.fetch.preconnect,
    }));
    try {
      const textOnly = { ...fallbackContext, message: [] };
      expect(await module.fallback("#别名13 前 / 后", {
        ...textOnly, reply_id: 42, lookupReply: async () => ({ user_id: 10004, message: [] }),
      })).toEqual(reply);
      expect(fetchedAvatars).toEqual(["10004"]);
      expect(await sentImages()).toEqual([tagged(44)]);

      expect(await module.fallback("#别名13 前 / 后", textOnly)).toEqual(reply);
      expect(fetchedAvatars).toEqual(["10004", "10003"]);
      expect(await sentImages()).toEqual([tagged(43)]);

      expect(await module.fallback("#别名13 前 / 后", {
        ...withQuotedImage,
        lookupReply: async () => ({ user_id: 10004, message: [
          { type: "image", file: "message.png", url: signedImage },
        ] }),
        message: [{ type: "image", resource_id: "from-milky", getDownloadUrl: async () => oldPrivateImage }],
      })).toEqual(reply);
      expect(fetchedImages).toEqual([signedImage, oldPrivateImage]);
      expect(await sentImages()).toEqual([tagged(45), tagged(46)]);
      for (const url of [
        "http://multimedia.nt.qq.com.cn/download",
        "https://multimedia.nt.qq.com.cn:8443/download",
        "https://multimedia.nt.qq.com.cn.example.invalid/download",
        "https://gchat.qpic.cn/other/path",
        "https://name@gchat.qpic.cn/download",
        "file:///tmp/image.png",
      ]) {
        expect(await module.fallback("#别名13 前 / 后", {
          ...fallbackContext, message: [{ type: "image", url }],
        })).toContain("无法读取");
      }
      expect(fetchedImages).toEqual([signedImage, oldPrivateImage]);
    } finally {
      intercept.mockRestore();
    }

    const beforePolicyChange = count;
    const policyDuringLookup = join(directory, "access.yaml");
    expect(await module.fallback("#别名13 前 / 后", {
      ...withQuotedImage,
      lookupReply: async () => {
        await writeFile(policyDuringLookup, "enable: true\nmode: 0\nuserWhiteList: []\n");
        return { user_id: 10004, message: [{ type: "image", file: tagged(42) }] };
      },
    })).toContain("无权");
    expect(count).toBe(beforePolicyChange);
    await writeFile(policyDuringLookup, "{}\n");

    const original = join(directory, "original.db");
    const replacement = join(directory, "replacement.db");
    await writeFile(replacement, before);
    const replaced = new Database(replacement);
    replaced.run(`DELETE FROM ${nativeCatalogTable}`);
    replaced.close();
    expect(await module.fallback("#别名13 前 / 后", {
      ...withQuotedImage,
      lookupReply: async () => {
        await rename(filename, original);
        await rename(replacement, filename);
        return { user_id: 10004, message: [{ type: "image", file: tagged(42) }] };
      },
    })).toBeUndefined();
    expect(count).toBe(beforePolicyChange);
    await rename(original, filename);

    renderFailed = true;
    expect(await module.fallback("#别名13 前 / 后", fallbackContext)).toContain("表情生成失败");

    withdraw();
    withdraw = undefined;
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
    expect(await module.commands["#表情详情"]("meme-13", user)).toContain("没有找到");
    expect(await module.commands["#表情详情"]("别名13", user)).toContain("没有找到");
    expect(resolveMemeTrigger("#别名13 好耶", user)).toBeUndefined();
    expect(await module.commands["#表情详情"]("meme-02", user)).toContain("图片：1–2 张");

    await writeFile(accessConfig, "enable: true\nmode: 1\nuserBlackList: [10001]\n");
    expect(module.commands["#表情列表"]("", user)).toContain("无权");
    expect(module.commands["#表情列表"]("", { user_id: 10002 })).toContain("共 13 项");
    expect(module.commands["#表情列表"]("")).toContain("无权");

    await writeFile(moduleConfig, "enable: false\n");
    expect(module.commands["#表情列表"]("", { user_id: 10002 })).toBe("表情模块已停用。");
    await writeFile(moduleConfig, "enable: [\n");
    expect(await module.commands["#表情详情"]("meme-02", { user_id: 10002 })).toContain("无法读取表情配置");
    expect(await readFile(filename)).toEqual(before);
  } finally {
    withdraw?.();
    if (previousPath === undefined) delete Bun.env.LOTUS_MEME_DB;
    else Bun.env.LOTUS_MEME_DB = previousPath;
    if (previousConfiguration === undefined) delete Bun.env.LOTUS_MEME_CONFIG_DIR;
    else Bun.env.LOTUS_MEME_CONFIG_DIR = previousConfiguration;
    await rm(directory, { recursive: true, force: true });
  }
});
