import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { Canvas, loadImage } from "skia-canvas";
import { readMemeImageSequence } from "../templates/animated-input.ts";
import { encodeMemeGif } from "../templates/gif.ts";
import { photoCompositeMemeTemplates } from "../templates/photo-composites.ts";

const signal = new AbortController().signal;
const context = {
  signal,
  async imageAsset() { throw new Error("这个模板不需要底图。"); },
  async fontAsset() { return readFile(new URL("../../starrail/rogue-theme/SR.ttf", import.meta.url)); },
};
const [call110, trance, kaleidoscope] = photoCompositeMemeTemplates;

async function sample(width: number, height: number, color: string) {
  const canvas = new Canvas(width, height);
  const draw = canvas.getContext("2d");
  draw.fillStyle = color;
  draw.fillRect(0, 0, width, height);
  draw.fillStyle = "black";
  draw.fillRect(0, Math.floor(height / 3), width, Math.floor(height / 3));
  return new File([new Uint8Array(await canvas.png)], "头像.png");
}

async function inspect(bytes: Uint8Array) {
  const image = await loadImage(Buffer.from(bytes));
  const draw = new Canvas(image.width, image.height).getContext("2d");
  draw.drawImage(image, 0, 0);
  return {
    shape: [image.width, image.height],
    color: (x: number, y: number) => draw.getImageData(x, y, 1, 1).data,
  };
}

test("遇到困难请拨打按 110 顺序绘制两张居中方裁的头像", async () => {
  const images = await Promise.all([sample(20, 10, "#0000ff"), sample(10, 20, "#ff0000")]);
  const result = await inspect(await call110.render({ images, texts: [], args: {} }, context));
  expect(result.shape).toEqual([900, 500]);
  expect(result.color(175, 425)[2]).toBeGreaterThan(245);
  expect(result.color(450, 425)[2]).toBeGreaterThan(245);
  expect(result.color(725, 425)[0]).toBeGreaterThan(245);
});

test("恍惚保留原始画布大小及上下两侧的拖影", async () => {
  const image = await sample(80, 90, "white");
  const result = await inspect(await trance.render({ images: [image], texts: [], args: {} }, context));
  expect(result.shape).toEqual([80, 90]);
  expect(result.color(40, 10)[0]).toBeGreaterThan(248);
  expect(result.color(40, 25)[0]).toBeLessThan(248);
  expect(result.color(40, 45)[0]).toBeLessThan(12);
  expect(result.color(40, 64)[0]).toBeLessThan(248);
  expect(result.color(40, 80)[0]).toBeGreaterThan(248);
});

test("万花筒与万花镜共用原版画布，圆形开关保留输入动图帧间隔", async () => {
  expect(kaleidoscope.info).toMatchObject({
    keywords: ["万花筒", "万花镜"],
    params_type: { args_type: { parser_options: [{ names: ["--circle", "圆"], dest: "circle" }] } },
  });
  const rgba = Uint8Array.from({ length: 24 * 16 * 4 }, (_, index) => index % 4 < 2 ? 0 : 255);
  const second = Uint8Array.from(rgba, (value, index) => index % 4 === 0 ? 255 : value);
  const gif = encodeMemeGif(24, 16, [{ rgba, delayMs: 100 }, { rgba: second, delayMs: 140 }], signal);
  const file = new File([new Uint8Array(gif)], "头像.gif");
  const bytes = await kaleidoscope.render({ images: [file], texts: [], args: { circle: true } }, context);
  const sequence = await readMemeImageSequence(new File([new Uint8Array(bytes)], "万花镜.gif"), signal);
  expect([sequence.frames[0].width, sequence.frames[0].height, sequence.frames.length, sequence.averageDelayMs])
    .toEqual([1200, 1200, 2, 120]);
});
