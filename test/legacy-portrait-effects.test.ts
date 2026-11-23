import { expect, test } from "bun:test";
import { Canvas } from "skia-canvas";
import type { MemeTemplateContext } from "../builtin-template.ts";
import { legacyPortraitEffectTemplates } from "../templates/legacy-portrait-effects.ts";

const ask = legacyPortraitEffectTemplates.find(({ info }) => info.key === "ask")!;
const charpic = legacyPortraitEffectTemplates.find(({ info }) => info.key === "charpic")!;

test("两个旧模板保留可选文案与无参数入口", () => {
  expect(ask.info).toMatchObject({
    keywords: ["问问"],
    params_type: {
      min_images: 1, max_images: 1, min_texts: 0, max_texts: 1, default_texts: [], args_type: null,
    },
  });
  expect(charpic.info).toMatchObject({
    keywords: ["字符画"],
    params_type: {
      min_images: 1, max_images: 1, min_texts: 0, max_texts: 0, default_texts: [], args_type: null,
    },
  });
});

test("问问缺名字时回提示，旧用户资料可代替显式名字", async () => {
  const context: MemeTemplateContext = {
    signal: new AbortController().signal,
    async imageAsset() { throw new Error("问问不加载模板图片。"); },
    async fontAsset() { throw new Error("已进入绘制。"); },
  };
  const images = [new File([new Uint8Array(await new Canvas(2, 2).png)], "avatar.png")];
  await expect(ask.render({ images, texts: [], args: {} }, context)).rejects.toThrow("文字或昵称数量不足");
  await expect(ask.render({ images, texts: [], args: { user_infos: [{ name: "旧昵称", gender: "male" }] } }, context))
    .rejects.toThrow("已进入绘制。");
});
