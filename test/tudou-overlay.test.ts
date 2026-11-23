import { expect, test } from "bun:test";
import { renderExactPng } from "../../../packages/skia/index.ts";
import { createBundledMemeResources } from "../backend-builtin-assets.ts";
import { readMemeImageSequence } from "../templates/animated-input.ts";
import { builtinMemeTemplates } from "../templates/index.ts";
import { tudouOverlayTemplates } from "../templates/tudou-layered-animations.ts";
import { tudouOverlays } from "../templates/tudou-overlay-specs.ts";

const signal = new AbortController().signal;

test("16 项 Tudou 原版登记与 152 张实际播放素材随模块提供", async () => {
  expect(tudouOverlayTemplates).toHaveLength(16);
  const paths = await Bun.file(new URL("../resources/builtin/manifest.json", import.meta.url)).json() as { files: Record<string, string> };
  let count = 0;
  for (const [i, scene] of tudouOverlays.entries()) {
    expect(builtinMemeTemplates.filter(template => template.info.key === scene.key)).toEqual([tudouOverlayTemplates[i]!]);
    for (let frame = 0; frame < scene.frames; frame++) {
      expect(paths.files[`images/python/meme_generator/memes/${scene.key}/tudou/${frame}.png`]).toMatch(/^[0-9a-f]{64}$/u);
      count++;
    }
  }
  expect(count).toBe(152);
  const scene = (key: string) => tudouOverlays.find(entry => entry.key === key)!;
  const hammer = scene("chiwoyichui").layers[0]!.poses;
  expect(hammer[7]).toEqual(hammer[6]);
  expect(scene("mengqin").frames).toBe(4);
  expect(scene("shuibuzhao").frames).toBe(4);
  expect(scene("painitou").layers[0]!.initialCircle).toEqual([130, 110]);
  expect(scene("chuosini").layers[0]?.squareFirst).toBe(true);
  expect(scene("daqi").artworkLast).toBe(true);
});

test("保留实际时间、画布和圆形裁剪，未播放的素材尾帧不出图", async () => {
  const { png } = await renderExactPng(91, 64, draw => {
    draw.fillStyle = "#00cc7c";
    draw.fillRect(0, 0, 91, 64);
    draw.fillStyle = "#ff0033";
    draw.fillRect(0, 5, 29, 55);
  });
  const context = { signal, ...createBundledMemeResources(signal) };
  const file = new File([new Uint8Array(png)], "多色头像.png");
  for (const [key, width, height, frames, delay] of [
    ["anmo", 247, 202, 21, 50], ["chuosini", 185, 158, 4, 50], ["daqi", 123, 85, 18, 80],
    ["mengqin", 240, 240, 4, 50], ["painitou", 472, 472, 5, 80], ["shuibuzhao", 488, 500, 4, 40],
    ["maodielanqiu", 50, 49, 22, 50], ["zhuatou", 240, 240, 22, 50],
  ] as const) {
    const template = tudouOverlayTemplates.find(item => item.info.key === key)!;
    const content = await template.render({ images: [file], texts: [], args: {} }, context);
    const result = await readMemeImageSequence(new File([new Uint8Array(content)], "结果.gif"), signal);
    expect([result.frames[0].width, result.frames[0].height]).toEqual([width, height]);
    expect(result.frames).toHaveLength(key === "maodielanqiu" ? 21 : frames);
    expect(Math.round(result.averageDelayMs * result.frames.length)).toBe(frames * delay);
  }
}, 30_000);
