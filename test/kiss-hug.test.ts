import { expect, test } from "bun:test";
import { Canvas, type Image } from "skia-canvas";
import type { MemeTemplateContext } from "../builtin-template.ts";
import { readMemeImageSequence } from "../templates/animated-input.ts";
import { encodeMemeGif } from "../templates/gif.ts";
import { hug, kiss } from "../templates/kiss-hug.ts";

function pixel(image: Image, x: number, y: number) {
  const draw = new Canvas(image.width, image.height).getContext("2d");
  draw.drawImage(image, 0, 0);
  return Array.from(draw.getImageData(x, y, 1, 1).data);
}

function expectColor(image: Image, x: number, y: number, expected: readonly number[]) {
  const actual = pixel(image, x, y);
  // Circular antialiasing introduces enough colors for GIF palette quantization.
  expect(actual.slice(0, 3).every((channel, index) => Math.abs(channel - expected[index]!) <= 4)).toBe(true);
  expect(actual[3]).toBe(expected[3]!);
}

async function fixture(size: number) {
  const requested: string[] = [];
  const art = new Canvas(size, size);
  const drawArt = art.getContext("2d");
  drawArt.fillStyle = "#00f";
  drawArt.fillRect(150, 55, 20, 20);
  const artPng = await art.png;
  const context: MemeTemplateContext = {
    signal: new AbortController().signal,
    async imageAsset(path) {
      requested.push(path);
      return artPng;
    },
    async fontAsset() {
      throw new Error("亲亲和抱抱不读取字体");
    },
  };
  const senderColor = (color: readonly number[]) => Uint8Array.from(Array.from({ length: 36 }, () => color).flat());
  const sender = encodeMemeGif(6, 6, [
    { rgba: senderColor([255, 0, 0, 255]), delayMs: 300 },
    { rgba: senderColor([0, 255, 0, 255]), delayMs: 300 },
  ], context.signal);
  const target = new Canvas(16, 8);
  const drawTarget = target.getContext("2d");
  drawTarget.fillStyle = "#0ff";
  drawTarget.fillRect(0, 0, 16, 8);
  drawTarget.fillStyle = "#ff0";
  drawTarget.fillRect(4, 0, 8, 8);
  return {
    requested, context, input: {
      images: [new File([Buffer.from(sender)], "sender.gif"), new File([Buffer.from(await target.png)], "target.png")],
      texts: [], args: {},
    },
  };
}

async function gif(bytes: Uint8Array, context: MemeTemplateContext) {
  expect(Buffer.from(bytes).subarray(0, 6).toString()).toBe("GIF89a");
  return readMemeImageSequence(new File([Buffer.from(bytes)], "render.gif"), context.signal);
}

test("亲亲保留 13 张背景、50 毫秒间隔、圆形中心裁切和发送者叠层", async () => {
  const { context, requested, input } = await fixture(200);
  const result = await gif(await kiss.render(input, context), context);
  expect(kiss.info.keywords).toEqual(["亲", "亲亲"]);
  expect(requested).toEqual(Array.from({ length: 13 }, (_, i) => `kiss/${String(i).padStart(2, "0")}.png`));
  expect(result.frames.map(({ width, height }) => [width, height])).toEqual(Array.from({ length: 13 }, () => [200, 200]));
  expect(result.averageDelayMs).toBe(50);
  expect(pixel(result.frames[0], 58, 90)[3]).toBe(0);
  expectColor(result.frames[0], 79, 110, [255, 255, 0, 255]);
  expectColor(result.frames[0], 108, 84, [255, 0, 0, 255]);
  expectColor(result.frames[1]!, 155, 60, [255, 0, 0, 255]);
  expectColor(result.frames[12]!, 95, 87, [255, 0, 0, 255]);
  const preview = await gif(await kiss.preview!(context), context);
  expectColor(preview.frames[0], 78, 110, [204, 204, 204, 255]);
});

test("抱抱保留 10 张前景、50 毫秒间隔、头像转角及白底", async () => {
  const { context, requested, input } = await fixture(300);
  const result = await gif(await hug.render(input, context), context);
  expect(hug.info.keywords).toEqual(["抱", "抱抱"]);
  expect(requested).toEqual(Array.from({ length: 10 }, (_, i) => `hug/${i}.png`));
  expect(result.frames.map(({ width, height }) => [width, height])).toEqual(Array.from({ length: 10 }, () => [300, 300]));
  expect(result.averageDelayMs).toBe(50);
  expect(pixel(result.frames[0], 159, 66)).toEqual([0, 0, 255, 255]);
  expect(pixel(result.frames[0], 135, 40)).toEqual([255, 255, 0, 255]);
  expect(pixel(result.frames[0], 88, 125)).toEqual([255, 255, 255, 255]);
  expect(pixel(result.frames[0], 157, 200)).toEqual([255, 0, 0, 255]);
  expect(pixel(result.frames[2]!, 118, 133)).toEqual([255, 0, 0, 255]);
  expect(pixel(result.frames[9]!, 162, 186)).toEqual([255, 0, 0, 255]);
  await expect(hug.render({ ...input, texts: ["文字"] }, context)).rejects.toThrow("不接收文字");
  await expect(kiss.render({ ...input, images: [] }, context)).rejects.toThrow("两张图片");
});
