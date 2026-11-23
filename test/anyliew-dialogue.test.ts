import { expect, test } from "bun:test";
import type { MemeTemplateContext } from "../builtin-template.ts";
import { anyliewDialogueAssets } from "../backend-dialogue-assets.ts";
import { anyliewDialogueTemplates } from "../templates/anyliew-dialogue.ts";

test("固定对话模板使用旧入口、输入数量、默认文案和各自固定背景", async () => {
  expect(anyliewDialogueTemplates).toHaveLength(18);
  const assets = new Map<string, string>(anyliewDialogueAssets);
  const requested: string[] = [];
  const context: MemeTemplateContext = {
    signal: new AbortController().signal,
    async imageAsset(path) { requested.push(path); throw new Error("图像夹具"); },
    async fontAsset() { throw new Error("字体夹具"); },
  };
  const avatar = new File([Uint8Array.fromBase64("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=")], "avatar.png",
    { type: "image/png" });
  for (const template of anyliewDialogueTemplates) {
    expect(template.info.params_type).toMatchObject({ min_images: 1, max_images: 1, min_texts: 0, max_texts: 1, args_type: null });
    const imagePath = `emoji/${template.info.key}/images/0.png`;
    expect(assets.get(imagePath)).toMatch(/^[\da-f]{64}$/u);
    await expect(template.render({ images: [avatar], texts: [], args: {} }, context)).rejects.toThrow("图像夹具");
    expect(requested.at(-1)).toBe("anyliew/" + imagePath);
  }
  expect(new Set(requested).size).toBe(18);
  expect(anyliewDialogueTemplates.flatMap(({ info }) => info.params_type.default_texts)).toEqual([
    "亚托莉喜欢这个", "坤坤喜欢这个", "丛雨讨厌这个", "丛雨喜欢这个",
  ]);
  const aliases = (key: string) => anyliewDialogueTemplates.find(template => template.info.key === key)?.info.keywords;
  expect(aliases("doro_orange")).toContain("🍊");
  expect(aliases("allegiance")).toEqual(["충성", "忠橙", "敬礼"]);
});
