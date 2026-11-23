import { expect, test } from "bun:test";
import { Canvas, type CanvasRenderingContext2D, type Image } from "skia-canvas";
import type { MemeTemplateContext } from "../builtin-template.ts";
import { readMemeImageSequence } from "../templates/animated-input.ts";
import { encodeMemeGif } from "../templates/gif.ts";
import { pat, rub } from "../templates/pat-rub.ts";

function canvas(width: number, height: number, draw: (context: CanvasRenderingContext2D) => void) {
  const layer = new Canvas(width, height);
  draw(layer.getContext("2d"));
  return layer;
}

function pixel(image: Image, x: number, y: number) {
  const layer = canvas(image.width, image.height, draw => draw.drawImage(image, 0, 0));
  return Array.from(layer.getContext("2d").getImageData(x, y, 1, 1).data);
}

function fixture(width: number, height: number, key: "pat" | "rub", colors: readonly string[]) {
  const requested: string[] = [];
  const context: MemeTemplateContext = {
    signal: AbortSignal.timeout(20_000),
    async imageAsset(path) {
      const match = new RegExp(`^${key}/(\\d+)\\.png$`, "u").exec(path);
      const color = match && colors[Number(match[1])];
      if (!color) throw new Error("未知测试资源");
      requested.push(path);
      return canvas(width, height, draw => {
        if (key === "rub") {
          draw.fillStyle = "#333333";
          draw.fillRect(0, 0, width, height);
        }
        draw.fillStyle = color;
        draw.fillRect(0, 0, 5, 5);
      }).png;
    },
    async fontAsset() { throw new Error("模板不应读取字体"); },
  };
  return { context, requested };
}

const pngFile = async (layer: Canvas) => new File([Buffer.from(await layer.png)], "avatar.png");
const gifFile = (bytes: Uint8Array) => new File([Buffer.from(bytes)], "avatar.gif");

test("拍保留 28 帧顺序、白底、中心裁切、两种压扁位置及 85ms 平均节奏", async () => {
  const palette = ["#000000", "#332211", "#116633", "#2277cc", "#eeaa11", "#cc8811", "#22aa33", "#1166bb", "#5511aa", "#aaaaaa"];
  const { context, requested } = fixture(235, 196, "pat", palette);
  const original = canvas(120, 80, draw => {
    draw.fillStyle = "#0000ff";
    draw.fillRect(0, 0, 120, 80);
    draw.fillStyle = "#ff0000";
    draw.fillRect(20, 0, 80, 80);
  });
  const next = canvas(120, 80, draw => {
    draw.fillStyle = "#ffff00";
    draw.fillRect(0, 0, 120, 80);
  });
  const raw = await Promise.all([original, next].map(layer => layer.toBuffer("raw", { colorType: "rgba", premultiplied: false })));
  const input = gifFile(encodeMemeGif(120, 80, raw.map(rgba => ({ rgba, delayMs: 200 })), context.signal));
  const output = await readMemeImageSequence(gifFile(await pat.render({ images: [input], texts: [], args: {} }, context)), context.signal);
  expect(requested).toEqual(Array.from({ length: 10 }, (_, index) => `pat/${index}.png`));
  expect(output.frames.map(frame => [frame.width, frame.height])).toEqual(Array.from({ length: 28 }, () => [235, 196]));
  expect(output.averageDelayMs).toBe(85);
  const order = [0, 1, 2, 3, 1, 2, 3, 0, 1, 2, 3, 0, 0, 1, 2, 3, 0, 0, 0, 0, 4, 5, 5, 5, 6, 7, 8, 9];
  for (const [index, pose] of order.entries()) {
    const color = palette[pose]!;
    expect(pixel(output.frames[index]!, 1, 1)).toEqual([1, 3, 5].map(start => parseInt(color.slice(start, start + 2), 16)).concat(255));
    expect(pixel(output.frames[index]!, 60, 120)).toEqual([255, 0, 0, 255]);
  }
  expect(pixel(output.frames[0], 9, 90)).toEqual([255, 255, 255, 255]);
  expect(pixel(output.frames[2]!, 9, 90)).toEqual([255, 0, 0, 255]);
});

test("贴贴保留六帧、输入层顺序、圆形边缘、旋转和 50ms 帧间隔", async () => {
  const { context, requested } = fixture(240, 240, "rub", ["#000000", "#331100", "#003300", "#0033aa", "#880055", "#552200"]);
  const self = await pngFile(canvas(80, 80, draw => {
    draw.fillStyle = "#0000ff";
    draw.fillRect(0, 0, 80, 38);
    draw.fillStyle = "#ff00ff";
    draw.fillRect(0, 38, 80, 42);
  }));
  const target = await pngFile(canvas(80, 80, draw => {
    draw.fillStyle = "#00ff00";
    draw.fillRect(0, 0, 80, 80);
  }));
  const output = await readMemeImageSequence(gifFile(await rub.render({ images: [self, target], texts: [], args: {} }, context)), context.signal);
  expect(requested).toEqual(Array.from({ length: 6 }, (_, index) => `rub/${index}.png`));
  expect(output.frames.map(frame => [frame.width, frame.height])).toEqual(Array.from({ length: 6 }, () => [240, 240]));
  expect(output.averageDelayMs).toBe(50);
  expect(pixel(output.frames[0], 77, 120)).toEqual([0, 255, 0, 255]);
  expect(pixel(output.frames[0], 137, 110)).toEqual([0, 0, 255, 255]);
  expect(pixel(output.frames[0], 40, 92)).toEqual([51, 51, 51, 255]);
  expect(pixel(output.frames[3]!, 125, 52)).toEqual([0, 0, 255, 255]);
  expect(pixel(output.frames[3]!, 98, 52)).toEqual([255, 0, 255, 255]);
  expect((await readMemeImageSequence(gifFile(await rub.preview!(context)), context.signal)).frames).toHaveLength(6);
});
