import { expect, test } from "bun:test";
import { renderExactPng, renderRgba } from "../../../packages/skia/index.ts";
import { anyliewShortAnimationAssets } from "../backend-short-animation-assets.ts";
import { extraMemeAssets } from "../backend-extra-assets.ts";
import type { MemeTemplateContext } from "../builtin-template.ts";
import { readMemeImageSequence } from "../templates/animated-input.ts";
import { shortAvatarAnimations } from "../templates/short-avatar-animation.ts";
import { builtinMemeTemplates } from "../templates/index.ts";

test("短动图的旧别名及实际帧图白名单完整", () => {
  const row = (key: string) => shortAvatarAnimations.find(({ info }) => info.key === key)!.info;
  expect(shortAvatarAnimations).toHaveLength(9);
  expect(shortAvatarAnimations.every(template => builtinMemeTemplates.includes(template))).toBeTrue();
  expect(row("question_mark").keywords).toEqual(["🐷", "猪"]);
  expect(row("capoo_lashings").keywords).toEqual(["咖波捶打", "捶打"]);
  expect(row("hello").keywords).toEqual(["hello", "Hello"]);
  expect(row("nailoong_nestle").params_type).toEqual({ min_images: 1, max_images: 1, min_texts: 0, max_texts: 0,
    args_type: null, default_texts: [] });
  const assets = new Map<string, string>(anyliewShortAnimationAssets);
  expect(assets.size).toBe(294);
  expect(anyliewShortAnimationAssets.every(([path, digest]) => extraMemeAssets.get(`images/anyliew/${path}`)?.digest === digest)).toBeTrue();
  expect(assets.get("emoji/nailoong_nestle/images/0.png")).toMatch(/^[\da-f]{64}$/u);
  expect(assets.get("emoji/steal/images/0.png")).toMatch(/^[\da-f]{64}$/u);
  expect(assets.has("emoji/finger/images/93.png")).toBeTrue();
  expect(assets.has("emoji/finger/images/94.png")).toBeFalse();
});

test("单帧 GIF 仍保留原时长、圆形透明边和原前后景的绘制顺序", async () => {
  const [foreground, avatar] = await Promise.all([
    renderExactPng(480, 440, draw => {
      draw.fillStyle = "#0000ff";
      draw.fillRect(210, 60, 24, 24);
      draw.fillRect(240, 210, 24, 24);
    }),
    renderExactPng(160, 75, draw => {
      draw.fillStyle = "#ff0000";
      draw.fillRect(0, 0, 160, 75);
    }),
  ]);
  for (const [key, center, corner, color] of [
    ["nailoong_nestle", [220, 70], [161, 10], [255, 0, 0, 255]],
    ["steal", [249, 222], [62, 35], [0, 0, 255, 255]],
  ] as const) {
    const reads: string[] = [];
    const signal = new AbortController().signal;
    const context: MemeTemplateContext = {
      signal,
      async imageAsset(path) { reads.push(path); return foreground.png; },
      async fontAsset() { throw new Error("原模板不用字体"); },
    };
    const template = shortAvatarAnimations.find(({ info }) => info.key === key)!;
    const bytes = await template.render({
      images: [new File([new Uint8Array(avatar.png)], "avatar.png")], texts: [], args: {},
    }, context);
    const result = await readMemeImageSequence(new File([new Uint8Array(bytes)], "result.gif"), signal);
    expect(reads).toEqual([`anyliew/emoji/${key}/images/0.png`]);
    expect(result.frames).toHaveLength(1);
    const control = bytes.findIndex((value, index) => value === 0x21 && bytes[index + 1] === 0xf9 && bytes[index + 2] === 4);
    expect(control).toBeGreaterThan(0);
    expect(new DataView(bytes.buffer, bytes.byteOffset).getUint16(control + 4, true)).toBe(13);
    const { rgba } = await renderRgba(480, 440, draw => draw.drawImage(result.frames[0], 0, 0));
    const pixel = ([x, y]: readonly [number, number]) => [...rgba.subarray((y * 480 + x) * 4, (y * 480 + x) * 4 + 4)];
    expect(pixel(center)).toEqual([...color]);
    expect(pixel(corner)).toEqual([0, 0, 0, 0]);
  }
});
