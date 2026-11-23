import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { Canvas, loadImage } from "skia-canvas";
import type { MemeTemplateContext } from "../builtin-template.ts";
import { readMemeImageSequence } from "../templates/animated-input.ts";
import { basicImageMemeTemplates } from "../templates/basic-image-transforms.ts";
import { encodeMemeGif } from "../templates/gif.ts";

const signal = new AbortController().signal;
const context: MemeTemplateContext = {
  signal,
  async imageAsset() { throw new Error("这两个模板不需要背景素材"); },
  async fontAsset(name) {
    expect(name).toBe("NotoSansSC-Regular.ttf");
    return readFile(new URL("../../starrail/rogue-theme/SR.ttf", import.meta.url));
  },
};
const [pixelate, upsideDown] = basicImageMemeTemplates;

test("像素化两次最近邻采样，保留原尺寸、帧数和平均延时", async () => {
  const rgba = Uint8Array.from({ length: 5 * 5 * 4 }, (_, index) => {
    const pixel = Math.floor(index / 4);
    return index % 4 === 3 ? 255 : pixel % 5 * 45;
  });
  const next = Uint8Array.from(rgba, (value, i) => i % 4 === 3 ? value : value + 20);
  const gif = encodeMemeGif(5, 5, [{ rgba, delayMs: 20 }, { rgba: next, delayMs: 100 }], signal);
  const file = new File([Uint8Array.from(gif)], "gradient.gif");
  const render = (number: number) => pixelate!.render({ images: [file], texts: [], args: { number } }, context);
  await expect(render(0)).rejects.toThrow("像素化大小");
  await expect(render(5)).rejects.toThrow("像素化大小");
  const data = await render(2);
  const sequence = await readMemeImageSequence(new File([Uint8Array.from(data)], "output.gif"), signal);
  expect([sequence.frames[0].width, sequence.frames[0].height, sequence.frames.length, sequence.averageDelayMs]).toEqual([5, 5, 2, 60]);
  const canvas = new Canvas(5, 5);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(sequence.frames[0], 0, 0);
  const row = ctx.getImageData(0, 0, 5, 1).data;
  expect([row[0], row[4], row[8], row[12], row[16]]).toEqual([45, 45, 135, 135, 135]);
});

test("反了先排原版顶部文字，再把整张图翻转 180 度", async () => {
  const input = new Canvas(40, 20);
  const draw = input.getContext("2d");
  for (const [index, color] of ["#000000", "#444444", "#888888", "#cccccc"].entries()) {
    draw.fillStyle = color;
    draw.fillRect(index % 2 * 20, Math.floor(index / 2) * 10, 20, 10);
  }
  const data = await upsideDown!.render({ images: [new File([new Uint8Array(await input.png)], "input.png")], texts: [], args: {} }, context);
  expect(Buffer.from(data).subarray(0, 3)).toEqual(Buffer.from([255, 216, 255]));
  const image = await loadImage(Buffer.from(data));
  expect([image.width, image.height]).toEqual([500, 330]);
  const canvas = new Canvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  const points = [[60, 110], [440, 110], [60, 270], [440, 270]];
  const expected = [204, 136, 68, 0];
  points.forEach(([x, y], index) => expect(Math.abs(ctx.getImageData(x!, y!, 1, 1).data[0]! - expected[index]!)).toBeLessThan(6));
  expect(ctx.getImageData(5, 10, 1, 1).data[0]).toBeGreaterThan(245);
  const lettering = ctx.getImageData(20, 2, 460, 76).data;
  expect(lettering.some((value, index) => index % 4 === 0 && value < 80)).toBe(true);
});
