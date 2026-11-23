import { expect, test } from "bun:test";
import { legacyTextOverlayAssets } from "../backend-legacy-text-overlay-assets.ts";
import type { MemeTemplateContext } from "../builtin-template.ts";
import { legacyTextOverlayTemplates } from "../templates/legacy-text-overlays.ts";

test("旧静态文字图沿用各自输入形态、关键词、默认内容，以及固定底图", async () => {
  const descriptors = new Map([
    ["imprison", ["坐牢", "我发涩图被抓起来了"]],
    ["murmur", ["低语", "你的假期余额不足"]],
    ["shutup", ["别说了", "你不要再说了"]],
    ["slap", ["一巴掌"]],
    ["emperor_dragon", ["皇帝龙图"]],
    ["osu", ["osu", "hso!"]],
  ]);
  const sourcePaths = new Set<string>(legacyTextOverlayAssets.map(([path]) => path)
    .filter(path => descriptors.has(path.split("/")[4] ?? "")));
  let loaded = 0;
  const context: MemeTemplateContext = {
    signal: new AbortController().signal,
    async imageAsset(path) {
      loaded++;
      expect(sourcePaths.has("images/" + path)).toBeTrue();
      throw new Error("已核素材路径");
    },
    async fontAsset() { throw new Error("离线测试没有字体"); },
  };
  expect(legacyTextOverlayTemplates.map(({ info }) => info.key)).toEqual([...descriptors.keys()]);
  expect(sourcePaths.size).toBe(descriptors.size);
  for (const template of legacyTextOverlayTemplates) {
    const [keyword, ...defaults] = descriptors.get(template.info.key)!;
    expect(template.info.keywords).toEqual([keyword!]);
    expect(template.info.params_type).toMatchObject({ min_images: 0, max_images: 0, min_texts: 1, max_texts: 1 });
    expect(template.info.params_type.default_texts ?? []).toEqual(defaults);
    const before = loaded;
    await expect(template.render({ images: [], texts: [], args: {} }, context)).rejects.toThrow("1 段文字");
    expect(loaded).toBe(before);
    await expect(template.preview!(context)).rejects.toThrow("已核素材路径");
    expect(loaded).toBe(before + 1);
  }
});
