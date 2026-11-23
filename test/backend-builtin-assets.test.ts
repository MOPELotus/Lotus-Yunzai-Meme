import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createBundledMemeResources } from "../backend-builtin-assets.ts";
import { extraMemeAssets } from "../backend-extra-assets.ts";
import { excludedMemeTemplateMessage } from "../template-policy.ts";
import { builtinMemeTemplates } from "../templates/index.ts";

test("随模块的素材清单覆盖已注册模板的固定素材，文件随 Git 提供", async () => {
  const directory = new URL("../resources/builtin/", import.meta.url);
  const { files }: { files: Record<string, string> } = await Bun.file(new URL("manifest.json", directory)).json();
  const registered = new Set(builtinMemeTemplates.map(({ info }) => info.key));
  const bundled = new Set(await readdir(directory, { recursive: true }));
  const missingFiles = Object.entries(files).filter(([, digest]) =>
    !bundled.has(`${digest.slice(0, 2)}/${digest.slice(2)}`)).map(([path]) => path);
  const missingImages = [...extraMemeAssets].filter(([path, asset]) => {
    const key = /^images\/(?:anyliew\/emoji\/|python\/meme_generator\/memes\/)?([^/]+)/u.exec(path)?.[1];
    return key !== undefined && registered.has(key) && files[path] !== asset.digest;
  }).map(([path]) => path);
  expect(missingFiles).toEqual([]);
  expect(missingImages).toEqual([]);
});

test("内置表情原图和字体直接按目录摘要读取，不依赖首用缓存", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotus-meme-bundled-"));
  try {
    const data = Buffer.from("原始资源");
    const digest = createHash("sha256").update(data).digest("hex");
    const shard = join(root, digest.slice(0, 2));
    await mkdir(shard);
    const asset = join(shard, digest.slice(2));
    await Bun.write(asset, data);
    await Bun.write(join(root, "manifest.json"), JSON.stringify({
      format: 1,
      files: {
        "images/template/1.png": digest,
        "fonts/template.ttf": digest,
        "images/python/meme_generator/memes/kurogames_rosetta/images/0.png": digest,
      },
    }));
    const lifetime = new AbortController();
    const resources = createBundledMemeResources(lifetime.signal, pathToFileURL(root + "/"));
    const both = await Promise.all([resources.imageAsset("template/1.png"), resources.fontAsset("template.ttf")]);
    expect(both).toEqual([data, data]);
    await expect(resources.imageAsset("template/../1.png")).rejects.toThrow("路径");
    await expect(resources.imageAsset("python/meme_generator/memes/kurogames_rosetta/images/0.png")).rejects.toThrow(excludedMemeTemplateMessage);
    await expect(resources.imageAsset("template/missing.png")).rejects.toThrow("清单缺少");
    await Bun.write(asset, "摘要不匹配");
    await expect(resources.imageAsset("template/1.png")).rejects.toThrow("校验失败");
    lifetime.abort();
    await expect(resources.fontAsset("template.ttf")).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
