import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createManagedMemeBackend } from "../backend-lifecycle.ts";
import { nativeCatalogTable, openMemeCatalogReader } from "../catalog-file.ts";
import { generationServer, sameGenerationServer } from "../catalog-policy.ts";
import { readMemeUsage, recordMemeUsage } from "../usage.ts";
import type { MemeTemplate } from "../builtin-template.ts";
import { excludedMemeTemplateMessage } from "../template-policy.ts";

test("内置表情在就绪后直接生成，排除项不会注册或读取资源，显式远端和停止生效", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lotus-meme-builtin-"));
  const config = join(directory, "config");
  await mkdir(config);
  const previousConfig = Bun.env.LOTUS_MEME_CONFIG_DIR;
  const previousServer = Bun.env.LOTUS_MEME_SERVER_URL;
  const lifetime = new AbortController();
  const params = { min_images: 1, max_images: 1, min_texts: 1, max_texts: 1 };
  let called = 0;
  const unchanged = new Uint8Array([2, 4, 8]);
  const allowed: MemeTemplate = {
    info: { key: "allowed", keywords: ["保留"], params_type: params },
    async render({ images, texts, args }, context) {
      expect(await images[0]?.text()).toBe("input");
      expect(texts).toEqual(["文字"]);
      expect(args).toEqual({ circle: true });
      expect(context.signal.aborted).toBe(false);
      for (const path of ["jinhsi/01.png", "anyliew/emoji/jinhsi/images/01.png", "python/meme_generator/memes/jinhsi/images/01.png"]) {
        await expect(context.imageAsset(path)).rejects.toThrow(excludedMemeTemplateMessage);
      }
      await expect(context.imageAsset("python/meme_generator/memes/allowed/images/missing.png")).rejects.toThrow("表情资源清单缺少");
      await expect(context.imageAsset("../outside.png")).rejects.toThrow("无效的表情资源路径");
      called++;
      return unchanged;
    },
    async preview() { return unchanged; },
  };
  const excluded: MemeTemplate = {
    info: { key: "jinhsi", keywords: ["排除"], params_type: params },
    async render() { throw new Error("排除模板不能运行"); },
  };
  Bun.env.LOTUS_MEME_CONFIG_DIR = config;
  delete Bun.env.LOTUS_MEME_SERVER_URL;
  const backend = createManagedMemeBackend(lifetime.signal, [allowed, excluded]);
  try {
    expect(generationServer()).toBeUndefined();
    backend.ensure();
    const builtin = generationServer();
    if (builtin?.protocol !== "native") throw new Error("内置表情未就绪");
    expect(await builtin.keys()).toEqual(["allowed"]);
    expect(await builtin.info("allowed")).toEqual(allowed.info);
    expect(await builtin.info("jinhsi")).toBeUndefined();
    expect(await builtin.preview("jinhsi")).toBeUndefined();
    expect(await builtin.preview("allowed")).toEqual(unchanged);
    expect(await builtin.generate("allowed", new FormData())).toBeUndefined();
    const body = new FormData();
    body.append("images", new File(["input"], "image.png"));
    body.append("texts", "文字");
    body.append("args", JSON.stringify({ circle: true }));
    expect(await builtin.generate("allowed", body)).toEqual(unchanged);
    expect(await builtin.generate("jinhsi", body)).toBeUndefined();
    expect(called).toBe(1);
    expect(await Bun.file(join(directory, "backend", "resources", "resources.json")).exists()).toBe(false);

    await writeFile(join(config, "server.yaml"), "backend: auto\nurl: https://meme.pippi.top/pippi/\n");
    expect(generationServer()).toMatchObject({ protocol: "legacy", base: new URL("https://meme.pippi.top/pippi/") });
    await writeFile(join(config, "server.yaml"), "backend: managed\nurl: https://meme.pippi.top/pippi/\n");
    expect(sameGenerationServer(builtin, generationServer())).toBe(true);
    Bun.env.LOTUS_MEME_SERVER_URL = "http://example.invalid/meme/";
    expect(generationServer()).toMatchObject({ protocol: "legacy", base: new URL("http://example.invalid/meme/") });
    expect(sameGenerationServer(builtin, generationServer())).toBe(false);
    backend.ensure();
    delete Bun.env.LOTUS_MEME_SERVER_URL;
    expect(sameGenerationServer(builtin, generationServer())).toBe(true);
    lifetime.abort();
    expect(generationServer()).toBeUndefined();
    await expect(builtin.generate("allowed", body)).rejects.toThrow();
  } finally {
    backend.dispose();
    if (previousConfig === undefined) delete Bun.env.LOTUS_MEME_CONFIG_DIR;
    else Bun.env.LOTUS_MEME_CONFIG_DIR = previousConfig;
    if (previousServer === undefined) delete Bun.env.LOTUS_MEME_SERVER_URL;
    else Bun.env.LOTUS_MEME_SERVER_URL = previousServer;
    await rm(directory, { recursive: true, force: true });
  }
});

test("本机目录发布快捷指令，优先匹配较长别名并传入原模板参数", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lotus-meme-shortcut-"));
  const config = join(directory, "config");
  await mkdir(config);
  const env = ["LOTUS_MEME_CONFIG_DIR", "LOTUS_MEME_SERVER_URL", "LOTUS_MEME_DB"] as const;
  const previous = env.map((name) => Bun.env[name]);
  const signal = new AbortController().signal;
  Bun.env.LOTUS_MEME_CONFIG_DIR = config;
  Bun.env.LOTUS_MEME_DB = join(directory, "meme.db");
  delete Bun.env.LOTUS_MEME_SERVER_URL;
  const { perspectiveMemeTemplates } = await import("../templates/perspective.ts");
  const { captionOverlayMemeTemplates } = await import("../templates/caption-overlays.ts");
  const { legacyPhotoCaptionTemplates } = await import("../templates/legacy-photo-captions.ts");
  const launch = perspectiveMemeTemplates.find(template => template.info.key === "genshin_start")!;
  const fullHead = captionOverlayMemeTemplates.find(template => template.info.key === "fill_head")!;
  const speechless = legacyPhotoCaptionTemplates.find(template => template.info.key === "speechless")!;
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  let coldCaption: readonly string[] | undefined;
  const backend = createManagedMemeBackend(signal, [{
    info: {
      key: "always",
      keywords: ["一直"],
      shortcuts: [{ key: "一直一直", args: ["--mode", "loop"], humanized: "一直一直" }],
      params_type: {
        min_images: 1, max_images: 1, min_texts: 0, max_texts: 0,
        args_type: {
          args_model: { properties: { mode: { type: "string", enum: ["normal", "loop"] } } },
          parser_options: [{ names: ["--mode"], dest: "mode", args: [{ name: "mode" }] }],
        },
      },
    },
    async render() { return new Uint8Array([1]); },
  }, launch, fullHead, {
    ...speechless,
    async render({ texts }) {
      coldCaption = texts;
      return png;
    },
  }]);
  let disposeHost: (() => Promise<void>) | undefined;
  try {
    const { runAutomaticCatalogRefresh } = await import("../catalog-update.ts");
    const { createModule, prepareMemeRequest, resolveMemeTrigger } = await import("../lotus.ts");
    const host = createModule({ signal });
    disposeHost = host.dispose;
    backend.ensure();
    expect(await Bun.file(join(directory, "meme.db")).exists()).toBeFalse();
    const text = "#典型的跨/段思维";
    const reply = await host.fallback(text, {
      message_type: "private", user_id: 1234, isMaster: true, isBotMaster: () => true,
      message: [{ type: "text", text }, { type: "image", file: "base64://" + Buffer.from(png).toString("base64") }],
    });
    expect(reply).toEqual({ type: "image", file: png });
    expect(coldCaption).toEqual(["典型的跨/段思维"]);
    expect(resolveMemeTrigger("#典型的思维")).toBeUndefined();
    expect(resolveMemeTrigger("#典型的跨段思维更多字")).toBeUndefined();
    expect(resolveMemeTrigger("#一直一直")).toEqual({ key: "always", keyword: "一直一直", text: "" });
    const request = await prepareMemeRequest("#一直一直", {
      user_id: 1234, isMaster: true, avatar: async () => new Blob(["avatar"], { type: "image/png" }),
    });
    expect(typeof request === "object" && request.body.get("args")).toContain('"mode":"loop"');
    const launchTitle = "旅行/下午启动！";
    const launchRequest = await prepareMemeRequest(`#${launchTitle} @456`, {
      user_id: 1234, isMaster: true, avatar: async user => new Blob([user], { type: "image/png" }),
    });
    expect(typeof launchRequest === "object" && launchRequest.key).toBe("genshin_start");
    expect(typeof launchRequest === "object" && launchRequest.body.getAll("texts")).toEqual([launchTitle]);
    const targetAvatar = typeof launchRequest === "object" && launchRequest.body.get("images");
    expect(targetAvatar instanceof File && await targetAvatar.text()).toBe("456");
    expect(await prepareMemeRequest(`#${launchTitle}不匹配`, { user_id: 1234, isMaster: true })).toBeUndefined();

    const fillHeadInput = {
      user_id: 1234, isMaster: true, avatar: async (user: string) => new Blob([user], { type: "image/png" }),
      nickname: async (user: string) => user === "789" ? "指定群友" : "发指令的人",
    };
    const alias = await prepareMemeRequest("#满脑子 @789", fillHeadInput);
    expect(typeof alias === "object" && alias.body.getAll("texts")).toEqual([]);
    expect(typeof alias === "object" && alias.body.get("args")).toBeNull();
    await writeFile(join(config, "meme.yaml"), "userName: true\n");
    const named = await prepareMemeRequest("#满脑子 @789", fillHeadInput);
    expect(typeof named === "object" && named.body.getAll("texts")).toEqual(["指定群友"]);
    const captured = await prepareMemeRequest("#满脑子都是阿/尔 @789", fillHeadInput);
    expect(typeof captured === "object" && captured.key).toBe("fill_head");
    expect(typeof captured === "object" && captured.body.getAll("texts")).toEqual(["阿/尔"]);
    const capturedAvatar = typeof captured === "object" && captured.body.get("images");
    expect(capturedAvatar instanceof File && await capturedAvatar.text()).toBe("789");
    await writeFile(join(config, "access.yaml"), "blackListEnable: true\nblackList: [一直一直]\n");
    expect(resolveMemeTrigger("#一直一直")).toBeUndefined();
    expect(resolveMemeTrigger("#一直")).toEqual({ key: "always", keyword: "一直", text: "" });

    const requests: string[] = [];
    const legacy = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(request) {
      const route = new URL(request.url).pathname;
      requests.push(route);
      if (route === "/memes/keys") return Response.json(["always"]);
      if (route === "/memes/always/info") return Response.json({
        key: "always", keywords: ["远端别名"], params_type: { min_images: 0, max_images: 0, min_texts: 0, max_texts: 0 },
      });
      return new Response(null, { status: 404 });
    } });
    try {
      Bun.env.LOTUS_MEME_SERVER_URL = legacy.url.href;
      await runAutomaticCatalogRefresh(signal);
      expect(requests).toEqual(["/memes/keys", "/memes/always/info"]);
      expect(resolveMemeTrigger("#远端别名")).toMatchObject({ key: "always" });
      expect(resolveMemeTrigger("#一直一直")).toBeUndefined();
    } finally {
      await legacy.stop(true);
    }
  } finally {
    await disposeHost?.();
    backend.dispose();
    for (const [index, name] of env.entries()) {
      const value = previous[index];
      if (value === undefined) delete Bun.env[name];
      else Bun.env[name] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
});


test("本机合成与原目录各自同步，旧服务离线切回仍保留预设、统计及干净旧目录", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lotus-meme-provider-switch-"));
  const config = join(directory, "config");
  const file = join(directory, "catalog.db");
  const serverYaml = join(config, "server.yaml");
  const env = ["LOTUS_MEME_CONFIG_DIR", "LOTUS_MEME_DB", "LOTUS_MEME_SERVER_URL"] as const;
  const previous = env.map(name => Bun.env[name]);
  const signal = new AbortController().signal;
  const parameters = { min_images: 0, max_images: 0, min_texts: 0, max_texts: 0 };
  const keys = ["legacy_only", "shared"];
  let unavailable = false;
  const remote = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(request) {
    if (unavailable) return new Response(null, { status: 521 });
    const route = new URL(request.url).pathname;
    if (route === "/memes/keys") return Response.json(keys);
    const key = route.split("/")[2];
    const alias = key === "legacy_only" ? "旧独有" : key === "shared" ? "旧共用" : "远端恢复新增";
    return Response.json({ key, keywords: [alias], params_type: parameters });
  } });
  const backend = createManagedMemeBackend(signal, [{
    info: { key: "shared", keywords: ["本机共用"], params_type: parameters },
    async render() { return Uint8Array.of(1); },
  }]);
  try {
    await mkdir(config);
    Bun.env.LOTUS_MEME_CONFIG_DIR = config;
    Bun.env.LOTUS_MEME_DB = file;
    delete Bun.env.LOTUS_MEME_SERVER_URL;
    const { runAutomaticCatalogRefresh } = await import("../catalog-update.ts");
    const { resolveMemeTrigger } = await import("../lotus.ts");
    const select = (mode: "remote" | "managed") =>
      writeFile(serverYaml, `backend: ${mode}
url: ${remote.url.href}
`);

    await select("remote");
    backend.ensure();
    await runAutomaticCatalogRefresh(signal, true);
    const legacy = new Database(file);
    try {
      legacy.exec('CREATE TABLE stat (key TEXT PRIMARY KEY, "all" INTEGER NOT NULL)');
      legacy.query("INSERT INTO stat VALUES ('shared', 6)").run();
      legacy.query("INSERT INTO preset VALUES (?, 'legacy_only', 'mode', 'keep', '', '')").run(JSON.stringify("旧专用预设"));
      legacy.query(`INSERT INTO meme SELECT 'unexpected_old_brand', '{}', '["退役素材"]', params, min_texts, max_texts,
        min_images, max_images, defText, args_type, '["鸣潮"]', createdAt, updatedAt FROM meme WHERE key = 'legacy_only'`).run();
    } finally {
      legacy.close();
    }
    expect(resolveMemeTrigger("#旧独有")).toMatchObject({ key: "legacy_only" });
    expect(resolveMemeTrigger("#旧专用预设")).toMatchObject({ key: "legacy_only" });
    expect(resolveMemeTrigger("#退役素材")).toBeUndefined();

    await select("managed");
    await runAutomaticCatalogRefresh(signal, true);
    expect(resolveMemeTrigger("#本机共用")).toMatchObject({ key: "shared" });
    expect(resolveMemeTrigger("#旧独有")).toBeUndefined();
    recordMemeUsage("shared", file);
    const combined = openMemeCatalogReader();
    try {
      expect(readMemeUsage(combined).get("shared")).toBe(7);
      expect(combined.query("SELECT key FROM main.meme ORDER BY key").all()).toEqual([{ key: "legacy_only" }, { key: "shared" }]);
      expect(combined.query(`SELECT key FROM main.${nativeCatalogTable}`).all()).toEqual([{ key: "shared" }]);
    } finally {
      combined.close();
    }

    unavailable = true;
    await select("remote");
    expect(resolveMemeTrigger("#旧独有")).toMatchObject({ key: "legacy_only" });
    expect(resolveMemeTrigger("#旧共用")).toMatchObject({ key: "shared" });
    expect(resolveMemeTrigger("#本机共用")).toBeUndefined();
    await expect(runAutomaticCatalogRefresh(signal)).rejects.toThrow();
    await runAutomaticCatalogRefresh(signal, true);
    expect(resolveMemeTrigger("#旧专用预设")).toMatchObject({ key: "legacy_only" });
    expect(resolveMemeTrigger("#退役素材")).toBeUndefined();
    const offline = openMemeCatalogReader();
    try {
      expect(readMemeUsage(offline).get("shared")).toBe(7);
    } finally {
      offline.close();
    }

    keys.push("recovered");
    unavailable = false;
    await runAutomaticCatalogRefresh(signal);
    expect(resolveMemeTrigger("#远端恢复新增")).toMatchObject({ key: "recovered" });
    await select("managed");
    expect(resolveMemeTrigger("#本机共用")).toMatchObject({ key: "shared" });
    expect(resolveMemeTrigger("#远端恢复新增")).toBeUndefined();
  } finally {
    backend.dispose();
    await remote.stop(true);
    for (const [index, name] of env.entries()) {
      const value = previous[index];
      if (value === undefined) delete Bun.env[name];
      else Bun.env[name] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
});

test("首次真正请求本机表情才建目录，远端等待与切换不会覆盖当前目录", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lotus-meme-hot-switch-"));
  const config = join(directory, "config");
  const file = join(directory, "catalog.db");
  await mkdir(config);
  await writeFile(join(config, "meme.yaml"), "forceSharp: true\n");
  const env = ["LOTUS_MEME_CONFIG_DIR", "LOTUS_MEME_DB", "LOTUS_MEME_SERVER_URL"] as const;
  const previous = env.map(name => Bun.env[name]);
  const lifetime = new AbortController();
  const params = { min_images: 0, max_images: 0, min_texts: 0, max_texts: 0 };
  const png = Uint8Array.fromBase64("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR14AAAAASUVORK5CYII=");
  const remoteStarted = Promise.withResolvers<void>();
  const releaseRemote = Promise.withResolvers<void>();
  let deferRemote = false;
  const remote = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/memes/keys") {
      if (deferRemote) {
        remoteStarted.resolve();
        await releaseRemote.promise;
        return Response.json(["awaited_remote"]);
      }
      return Response.json(["old"]);
    }
    if (path === "/memes/old/") return new Response(png, { headers: { "Content-Type": "image/png" } });
    const key = path.split("/")[2];
    return Response.json({ key, keywords: [key === "old" ? "远端早已就绪" : "陈旧回包"], params_type: params });
  } });
  const backend = createManagedMemeBackend(lifetime.signal, [{
    info: { key: "instant", keywords: ["本机立刻合成"], params_type: params },
    async render() { return png; },
  }]);
  const { createModule, resolveMemeTrigger } = await import("../lotus.ts");
  const { runAutomaticCatalogRefresh } = await import("../catalog-update.ts");
  const { publishManagedMemeServer } = await import("../catalog-policy.ts");
  const module = createModule({ signal: lifetime.signal });

  try {
    Bun.env.LOTUS_MEME_CONFIG_DIR = config;
    Bun.env.LOTUS_MEME_DB = file;
    delete Bun.env.LOTUS_MEME_SERVER_URL;
    const select = (mode: "managed" | "remote") =>
      writeFile(join(config, "server.yaml"), `backend: ${mode}\nurl: ${remote.url.href}\n`);
    const call = (message: string) => module.fallback(message, {
      message_type: "private", user_id: 1234, isMaster: true, isBotMaster: () => true, message,
    });

    await select("remote");
    backend.ensure();
    await runAutomaticCatalogRefresh(lifetime.signal, true);
    deferRemote = true;
    const remoteRefresh = runAutomaticCatalogRefresh(lifetime.signal).then(() => false, () => true);
    await remoteStarted.promise;

    await select("managed");
    expect(await call("这句话没匹配")).toBeUndefined();
    expect(await call("本机立刻合成")).toBeUndefined();
    const before = new Database(file, { readonly: true });
    try {
      expect(before.query("SELECT 1 FROM sqlite_schema WHERE name = ?").get(nativeCatalogTable)).toBeNull();
    } finally {
      before.close();
    }

    const generated = await Promise.all([call("#本机立刻合成"), call("#本机立刻合成")]);
    expect(generated).toEqual([{ type: "image", file: png }, { type: "image", file: png }]);
    releaseRemote.resolve();
    expect(await remoteRefresh).toBe(true);

    const nativeStarted = Promise.withResolvers<void>();
    const releaseNative = Promise.withResolvers<void>();
    const fresh = publishManagedMemeServer({
      catalogIdentity: "lotus-skia:late-native",
      async keys() { nativeStarted.resolve(); await releaseNative.promise; return ["late_native"]; },
      async info() { return { key: "late_native", keywords: ["迟到的本机"], params_type: params }; },
      async generate() { return png; },
      async preview() { return png; },
    });
    try {
      const pending = call("#表情列表");
      await nativeStarted.promise;
      await select("remote");
      expect(await call("#远端早已就绪")).toEqual({ type: "image", file: png });
      expect(resolveMemeTrigger("#陈旧回包")).toBeUndefined();
      await module.dispose();
      releaseNative.resolve();
      await pending;
      const preserved = new Database(file, { readonly: true });
      try {
        expect(preserved.query("SELECT key FROM meme").all()).toEqual([{ key: "old" }]);
        expect(preserved.query(`SELECT key FROM ${nativeCatalogTable}`).all()).toEqual([{ key: "instant" }]);
      } finally {
        preserved.close();
      }
    } finally {
      fresh();
      releaseNative.resolve();
    }
  } finally {
    releaseRemote.resolve();
    await module.dispose();
    backend.dispose();
    await remote.stop(true);
    for (const [index, name] of env.entries()) {
      const value = previous[index];
      if (value === undefined) delete Bun.env[name];
      else Bun.env[name] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
});
