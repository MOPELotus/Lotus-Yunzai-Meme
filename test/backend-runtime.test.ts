import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createManagedMemeBackend } from "../backend-lifecycle.ts";
import { generationServer, sameGenerationServer } from "../catalog-policy.ts";
import type { MemeTemplate } from "../builtin-template.ts";

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
      await expect(context.imageAsset("jinhsi/01.png")).rejects.toThrow();
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
  }]);
  try {
    const { runAutomaticCatalogRefresh } = await import("../catalog-update.ts");
    const { prepareMemeRequest, resolveMemeTrigger } = await import("../lotus.ts");
    backend.ensure();
    await runAutomaticCatalogRefresh(signal, true);
    expect(resolveMemeTrigger("#一直一直")).toEqual({ key: "always", keyword: "一直一直", text: "" });
    const request = await prepareMemeRequest("#一直一直", {
      user_id: 1234, isMaster: true, avatar: async () => new Blob(["avatar"], { type: "image/png" }),
    });
    expect(typeof request === "object" && request.body.get("args")).toContain('"mode":"loop"');
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
    backend.dispose();
    for (const [index, name] of env.entries()) {
      const value = previous[index];
      if (value === undefined) delete Bun.env[name];
      else Bun.env[name] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
});
