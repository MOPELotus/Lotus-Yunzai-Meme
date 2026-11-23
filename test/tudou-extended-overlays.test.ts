import { expect, test } from "bun:test";
import { renderExactPng } from "../../../packages/skia/index.ts";
import { createBundledMemeResources } from "../backend-builtin-assets.ts";
import { readMemeImageSequence } from "../templates/animated-input.ts";
import { builtinMemeTemplates } from "../templates/index.ts";
import { tudouExtendedOverlays } from "../templates/tudou-extended-overlays.ts";
import { tudouExtendedOverlayTemplates } from "../templates/tudou-layered-animations.ts";

const signal = new AbortController().signal;

test("23 款 Tudou 动图均注册一次并打包原始的 780 张有效素材", async () => {
  expect(tudouExtendedOverlayTemplates).toHaveLength(23);
  const manifest = await Bun.file(new URL("../resources/builtin/manifest.json", import.meta.url)).json() as { files: Record<string, string> };
  let frameCount = 0;
  for (const [i, scene] of tudouExtendedOverlays.entries()) {
    expect(builtinMemeTemplates.filter(template => template.info.key === scene.key)).toEqual([tudouExtendedOverlayTemplates[i]!]);
    for (let frame = 0; frame < scene.frames; frame++) {
      expect(manifest.files[`images/python/meme_generator/memes/${scene.key}/tudou/${frame}.png`]).toMatch(/^[0-9a-f]{64}$/u);
      frameCount++;
    }
  }
  expect(frameCount).toBe(780);
  const scene = (key: string) => tudouExtendedOverlays.find(entry => entry.key === key)!;
  expect(scene("daobao").layers[0]!.visible).toEqual([[0, 81]]);
  expect(scene("guan_bingxiang").layers[0]!.visible).toEqual([[0, 55]]);
  expect(scene("wanhuo").layers[0]!.visible).toEqual([[0, 17]]);
  expect(scene("zizuozuo").frames).toBe(25);
  expect(scene("zhuwu").frames).toBe(44);
  const dancers = builtinMemeTemplates.filter(template => template.info.keywords.includes("跳舞")).map(template => template.info.key).sort();
  expect(dancers).toContain("stickman_dancing");
  expect(dancers).toContain("tiaowu_mao");
  expect(dancers[0]).toBe("stickman_dancing");
});

test("实际渲染保留长动图时间和单帧 GIF 的 3 秒延时", async () => {
  const { png } = await renderExactPng(91, 64, draw => {
    draw.fillStyle = "#4dab98";
    draw.fillRect(0, 0, 91, 64);
    draw.fillStyle = "#be2954";
    draw.fillRect(0, 0, 30, 64);
  });
  const avatar = new File([new Uint8Array(png)], "测试头像.png");
  const context = { signal, ...createBundledMemeResources(signal) };
  for (const [key, width, height, duration] of [
    ["daobao", 250, 188, 6050], ["guan_bingxiang", 480, 480, 3600], ["tuhalang", 155, 155, 4200],
    ["dunmatong", 1179, 1115, 3000],
  ] as const) {
    const template = tudouExtendedOverlayTemplates.find(item => item.info.key === key)!;
    const bytes = await template.render({ images: [avatar], texts: [], args: {} }, context);
    const result = await readMemeImageSequence(new File([new Uint8Array(bytes)], "结果.gif"), signal);
    expect([result.frames[0].width, result.frames[0].height]).toEqual([width, height]);
    if (key === "dunmatong") {
      expect(result.frames).toHaveLength(1);
      const control = bytes.findIndex((value, i) => value === 0x21 && bytes[i + 1] === 0xf9 && bytes[i + 2] === 4);
      expect(control).toBeGreaterThanOrEqual(0);
      expect(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(control + 4, true) * 10).toBe(duration);
    } else {
      expect(Math.round(result.averageDelayMs * result.frames.length)).toBe(duration);
    }
  }
}, 30_000);
