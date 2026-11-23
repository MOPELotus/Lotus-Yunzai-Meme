import { expect, test } from "bun:test";
import { renderExactPng } from "../../../packages/skia/index.ts";
import { createBundledMemeResources } from "../backend-builtin-assets.ts";
import { readMemeImageSequence } from "../templates/animated-input.ts";
import { builtinMemeTemplates } from "../templates/index.ts";
import { tudouTailSpecs } from "../templates/tudou-tail-specs.ts";
import { tudouTailTemplates } from "../templates/tudou-tail.ts";

test("剩余 Tudou 模板独立登记使用的每张原图", async () => {
  const { files } = await Bun.file(new URL("../resources/builtin/manifest.json", import.meta.url)).json();
  for (const scene of tudouTailSpecs) {
    expect(builtinMemeTemplates.filter(entry => entry.info.key === scene.key)).toHaveLength(1);
    for (let frame = 0; frame < (scene.repeatArtwork ? 1 : scene.frames); frame++) {
      expect(files[`images/python/meme_generator/memes/${scene.key}/tudou/${frame}.png`]).toMatch(/^[a-f\d]{64}$/u);
    }
  }
  expect(tudouTailTemplates).toHaveLength(23);
});

test("鲁鲁喂猪保持最多八头像，招牌保留原五秒 GIF，正在找你读取会话姓名", async () => {
  const signal = new AbortController().signal;
  const context = { signal, ...createBundledMemeResources(signal) };
  const { png } = await renderExactPng(40, 30, draw => {
    draw.fillStyle = "#3bcfc6";
    draw.fillRect(0, 0, 40, 30);
    draw.fillStyle = "#da354e";
    draw.fillRect(5, 5, 13, 17);
  });
  const avatar = new File([new Uint8Array(png)], "头像.png");
  const locate = (key: string) => tudouTailTemplates.find(entry => entry.info.key === key)!;
  const buyPig = locate("lulu_feed_pig");
  expect(buyPig.info.params_type.min_images).toBe(1);
  expect(buyPig.info.params_type.max_images).toBe(8);
  const pig = await buyPig.render({ images: [avatar], texts: [], args: {} }, context);
  const parsed = await readMemeImageSequence(new File([new Uint8Array(pig)], "鲁鲁.gif"), signal);
  expect([parsed.frames.length, parsed.averageDelayMs]).toEqual([19, 50]);
  const sign = await locate("zhaopai").render({ images: [avatar], texts: [], args: {} }, context);
  expect(Buffer.from(sign).toString("ascii", 0, 6)).toMatch(/^GIF8[79]a$/u);
  const frameControl = Buffer.from(sign).indexOf(Buffer.from([0x21, 0xf9, 0x04]));
  expect(Buffer.from(sign).readUInt16LE(frameControl + 4)).toBe(500);
  const lookingForYou = locate("zheng_zai_zhao_ni");
  const nickname = await lookingForYou.render({ images: [avatar], texts: [], args: { user_infos: [{ name: "测试名称" }] } }, context);
  const text = await lookingForYou.render({ images: [avatar], texts: ["测试名称"], args: { user_infos: [{ name: "旧昵称" }] } }, context);
  expect(Buffer.from(nickname).equals(Buffer.from(text))).toBeTrue();
}, 20_000);
