import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalMemeBackend } from "../backend-lifecycle.ts";
import { nativeCatalogTable } from "../catalog-file.ts";
import { memeProvider, sameMemeProvider } from "../catalog-policy.ts";
import type { MemeTemplate } from "../builtin-template.ts";
import { excludedMemeTemplateMessage } from "../template-policy.ts";

test("内置表情在就绪后直接生成，排除项不会注册或读取资源，旧远端配置无效且停止会撤回本机服务", async () => {
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
      await expect(context.imageAsset("python/meme_generator/memes/allowed/images/missing.png")).rejects.toThrow("素材清单缺少");
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
  const backend = createLocalMemeBackend(lifetime.signal, [allowed, excluded]);
  try {
    expect(memeProvider()).toBeUndefined();
    backend.ensure();
    const builtin = memeProvider();
    if (!builtin) throw new Error("内置表情未就绪");
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

    await writeFile(join(config, "server.yaml"), `backend: remote\nurl: "://ignored"\ntimeout: invalid\nmanagedTimeout: 9\n`);
    Bun.env.LOTUS_MEME_SERVER_URL = "invalid and deliberately ignored";
    expect(memeProvider()?.timeout).toBe(9000);
    expect(sameMemeProvider(builtin, memeProvider())).toBe(true);
    expect(await memeProvider()?.generate("allowed", body)).toEqual(unchanged);
    expect(called).toBe(2);
    lifetime.abort();
    expect(memeProvider()).toBeUndefined();
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

test("宿主尚未发出就绪通知时，第一次本机命令仍会生成目录", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lotus-meme-first-command-"));
  const config = join(directory, "config");
  await mkdir(config);
  const env = ["LOTUS_MEME_CONFIG_DIR", "LOTUS_MEME_DB"] as const;
  const previous = env.map(name => Bun.env[name]);
  Bun.env.LOTUS_MEME_CONFIG_DIR = config;
  Bun.env.LOTUS_MEME_DB = join(directory, "meme.db");
  const { createModule } = await import("../lotus.ts");
  const host = createModule({ signal: new AbortController().signal });
  try {
    expect(memeProvider()).toBeUndefined();
    expect(await Bun.file(Bun.env.LOTUS_MEME_DB).exists()).toBe(false);
    const result = await host.fallback("#表情搜索 红温", {
      message_type: "private", user_id: 100, isMaster: true, isBotMaster: () => true,
    });
    expect(result).toEqual({ type: "quoted", message: [{ type: "text", text: "1. 红温" }] });
    expect(await Bun.file(Bun.env.LOTUS_MEME_DB).exists()).toBe(true);
    expect(await memeProvider()?.keys()).toContain("flush");
  } finally {
    await host.dispose();
    env.forEach((name, index) => {
      if (previous[index] === undefined) delete Bun.env[name];
      else Bun.env[name] = previous[index];
    });
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
  const backend = createLocalMemeBackend(signal, [{
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

    let requests = 0;
    const legacy = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch() {
      requests++;
      return new Response("unexpected", { status: 591 });
    } });
    try {
      Bun.env.LOTUS_MEME_SERVER_URL = legacy.url.href;
      await writeFile(join(config, "server.yaml"), `backend: remote\nurl: ${legacy.url.href}\n`);
      expect(await host.fallback("#表情强制更新资源", {
        message_type: "private", user_id: 1234, isMaster: true, isBotMaster: () => true,
      })).toContain("更新 4 项");
      expect(requests).toBe(0);
      expect(resolveMemeTrigger("#一直")).toMatchObject({ key: "always" });
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


test("首次实际使用时共用本机目录初始化，已取消的更新保留现有目录", async () => {
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
  const backend = createLocalMemeBackend(lifetime.signal, [{
    info: { key: "instant", keywords: ["本机立刻合成"], params_type: params },
    async render() { return png; },
  }]);
  const { createModule } = await import("../lotus.ts");
  const { publishMemeProvider } = await import("../catalog-policy.ts");
  const module = createModule({ signal: lifetime.signal });

  try {
    Bun.env.LOTUS_MEME_CONFIG_DIR = config;
    Bun.env.LOTUS_MEME_DB = file;
    delete Bun.env.LOTUS_MEME_SERVER_URL;
    const call = (message: string) => module.fallback(message, {
      message_type: "private", user_id: 1234, isMaster: true, isBotMaster: () => true, message,
    });

    backend.ensure();
    expect(await call("这句话没匹配")).toBeUndefined();
    expect(await call("本机立刻合成")).toBeUndefined();
    expect(await Bun.file(file).exists()).toBeFalse();

    const generated = await Promise.all([call("#本机立刻合成"), call("#本机立刻合成")]);
    expect(generated).toEqual([{ type: "image", file: png }, { type: "image", file: png }]);

    const nativeStarted = Promise.withResolvers<void>();
    const releaseNative = Promise.withResolvers<void>();
    const fresh = publishMemeProvider({
      catalogIdentity: "lotus-skia:late-native",
      async keys() { nativeStarted.resolve(); await releaseNative.promise; return ["late_native"]; },
      async info() { return { key: "late_native", keywords: ["迟到的本机"], params_type: params }; },
      async generate() { return png; },
      async preview() { return png; },
    });
    try {
      const pending = call("#表情列表");
      await nativeStarted.promise;
      await module.dispose();
      releaseNative.resolve();
      await pending;
      const preserved = new Database(file, { readonly: true });
      try {
        expect(preserved.query(`SELECT key FROM ${nativeCatalogTable}`).all()).toEqual([{ key: "instant" }]);
      } finally {
        preserved.close();
      }
    } finally {
      fresh();
      releaseNative.resolve();
    }
  } finally {
    await module.dispose();
    backend.dispose();
    for (const [index, name] of env.entries()) {
      const value = previous[index];
      if (value === undefined) delete Bun.env[name];
      else Bun.env[name] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
});
