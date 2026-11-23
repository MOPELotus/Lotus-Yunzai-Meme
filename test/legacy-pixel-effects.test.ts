import { expect, test } from "bun:test";
import { renderExactPng, renderRgba } from "../../../packages/skia/index.ts";
import { createBundledMemeResources } from "../backend-builtin-assets.ts";
import { readMemeImageSequence } from "../templates/animated-input.ts";
import { encodeMemeGif } from "../templates/gif.ts";
import { legacyPixelEffectTemplates } from "../templates/legacy-pixel-effects.ts";

const signal = new AbortController().signal;
const context = { signal, ...createBundledMemeResources(signal) };

function frameBytes(width: number, height: number, red: number) {
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < rgba.length; i += 4) rgba.set([red, 80, 140, 255], i);
  return rgba;
}

function imageFile(bytes: Uint8Array, name: string) {
  return new File([new Uint8Array(bytes)], name);
}

async function animation(template: (typeof legacyPixelEffectTemplates)[number], input: File) {
  const bytes = await template.render({ images: [input], texts: [], args: {} }, context);
  return readMemeImageSequence(imageFile(bytes, "effect.gif"), signal);
}

test("灰飞烟灭延续旧尺寸和 2.8 秒节拍，静图开场合并为同一帧", async () => {
  const source = await renderExactPng(190, 110, draw => {
    draw.fillStyle = "#1d5987";
    draw.fillRect(0, 0, 190, 110);
  });
  const input = imageFile(source.png, "avatar.png");
  const result = await animation(legacyPixelEffectTemplates[0]!, input);
  expect([result.frames[0].width, result.frames[0].height]).toEqual([190, 110]);
  expect(Math.round(result.frames.length * result.averageDelayMs)).toBe(2_800);
  expect(result.frames.length).toBeLessThanOrEqual(26);
});

test("脑瓜崩保留手势和弹动，按旧时序循环输入 GIF 并输出 240 像素画布", async () => {
  const width = 84, height = 49;
  const incoming = encodeMemeGif(width, height, [40, 90, 110].map((delayMs, index) => ({
    delayMs, rgba: frameBytes(width, height, 40 + index * 70),
  })), signal);
  const result = await animation(legacyPixelEffectTemplates[1]!, imageFile(incoming, "avatar.gif"));
  expect([result.frames[0].width, result.frames[0].height]).toEqual([240, 240]);
  expect(Math.round(result.frames.length * result.averageDelayMs)).toBe(1_500);
  expect(result.frames.length).toBeGreaterThan(10);
  expect(legacyPixelEffectTemplates[1]?.info.keywords).toEqual(["弹", "脑瓜崩"]);
});


test("旧 GIF 透明像素留空，半透明输入仍能在灰飞烟灭和脑瓜崩中看见", async () => {
  const source = await renderExactPng(40, 40, draw => {
    draw.fillStyle = "rgba(60, 160, 200, 0.2)";
    draw.fillRect(10, 10, 20, 20);
  });
  for (const template of legacyPixelEffectTemplates) {
    const { frames: [frame] } = await animation(template, imageFile(source.png, "transparent-avatar.png"));
    const { width, height } = frame;
    const { rgba } = await renderRgba(width, height, draw => draw.drawImage(frame, 0, 0));
    expect(rgba[3]).toBe(0);
    expect(rgba[(Math.trunc(height / 2) * width + Math.trunc(width / 2)) * 4 + 3]).toBe(255);
  }
});
