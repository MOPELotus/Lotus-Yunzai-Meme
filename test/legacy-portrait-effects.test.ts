import { expect, test } from "bun:test";
import { loadImage } from "skia-canvas";
import { renderExactPng } from "../../../packages/skia/index.ts";
import { createBundledMemeResources } from "../backend-builtin-assets.ts";
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
  const controller = new AbortController();
  const canceled = new Error("验收已停止。");
  controller.abort(canceled);
  const context: MemeTemplateContext = {
    signal: controller.signal,
    async imageAsset() { throw new Error("问问不加载模板图片。"); },
    async fontAsset() { throw canceled; },
  };
  const images = [new File([], "avatar.png")];
  await expect(ask.render({ images, texts: [], args: {} }, context)).rejects.toThrow("文字或昵称数量不足");
  await expect(ask.render({ images, texts: [], args: { user_infos: [{ name: "旧昵称", gender: "male" }] } }, context))
    .rejects.toThrow(canceled);
});

test("字符画使用随包开放字体并保持原 150 列的输出尺寸", async () => {
  const signal = AbortSignal.timeout(5_000);
  const resources = createBundledMemeResources(signal);
  const fontReads: string[] = [];
  const picture = await renderExactPng(24, 22, draw => {
    draw.fillStyle = "#4079ad";
    draw.fillRect(0, 0, 24, 22);
  });
  const image = new File([new Uint8Array(picture.png)], "avatar.png", { type: "image/png" });
  const bytes = await charpic.render({ images: [image], texts: [], args: {} }, {
    signal,
    ...resources,
    async fontAsset(name) {
      fontReads.push(name);
      return resources.fontAsset(name);
    },
  });
  const rendered = await loadImage(Buffer.from(bytes));
  expect(rendered.width).toBe(1238);
  expect(rendered.height).toBe(1134);
  expect(fontReads).toEqual(["CascadiaMono.ttf"]);
});
