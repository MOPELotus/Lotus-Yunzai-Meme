import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { Canvas, type Image } from "skia-canvas";
import type { MemeTemplate, MemeTemplateContext } from "../builtin-template.ts";
import { readMemeImageSequence } from "../templates/animated-input.ts";
import { mirrorFlashMemeTemplates } from "../templates/mirror-flash.ts";

const [mirror, flash] = mirrorFlashMemeTemplates;
const signal = new AbortController().signal;
const context: MemeTemplateContext = {
  signal,
  async imageAsset() { throw new Error("这两项模板没有外部图像素材"); },
  async fontAsset(name) {
    expect(name).toBe("NotoSansSC-Regular.ttf");
    return readFile(new URL("../../starrail/rogue-theme/SR.ttf", import.meta.url));
  },
};

async function pixels(image: Image) {
  const canvas = new Canvas(image.width, image.height);
  if (Bun.env.LOTUS_SKIA_MODE === "gpu") canvas.gpu = true;
  canvas.getContext("2d").drawImage(image, 0, 0);
  const raw = await canvas.toBuffer("raw", { colorType: "rgba", premultiplied: false });
  if (Bun.env.LOTUS_SKIA_MODE === "gpu") expect(canvas.engine.device).toContain("RTX A4000");
  return (x: number, y: number) => [...raw.subarray(4 * (y * image.width + x), 4 * (y * image.width + x) + 4)];
}

function render(template: MemeTemplate, image: File, texts: string[] = []) {
  return template.render({ images: [image], texts, args: {} }, context);
}

async function frames(content: Uint8Array) {
  return readMemeImageSequence(new File([new Uint8Array(content)], "output.gif"), signal);
}

test("哈哈镜从中间正方形取景，畸变随原曲线递增再反向播放", async () => {
  const input = new Canvas(600, 500);
  const draw = input.getContext("2d");
  draw.fillStyle = "#222";
  draw.fillRect(0, 0, 600, 500);
  draw.fillStyle = "#fff";
  draw.fillRect(320, 0, 160, 500);
  const output = await frames(await render(mirror, new File([new Uint8Array(await input.png)], "source.png")));
  expect([output.frames[0].width, output.frames[0].height, output.frames.length, output.averageDelayMs])
    .toEqual([500, 500, 22, 50]);
  const original = await pixels(output.frames[0]);
  const strongest = await pixels(output.frames[10]!);
  const reverse = await pixels(output.frames[11]!);
  const end = await pixels(output.frames[21]!);
  expect(original(273, 250)[0]).toBeGreaterThan(245);
  expect(strongest(273, 250)[0]).toBeLessThan(60);
  expect(reverse(280, 250)).toEqual(strongest(280, 250));
  expect(end(273, 250)).toEqual(original(273, 250));
});

test("闪瞎按原顺序 30ms 翻色和放大，文字可省且交替反相", async () => {
  const input = new Canvas(500, 200);
  const draw = input.getContext("2d");
  draw.fillStyle = "#305070";
  draw.fillRect(0, 0, 500, 200);
  draw.fillStyle = "#ba6826";
  draw.fillRect(0, 0, 20, 200);
  const file = new File([new Uint8Array(await input.png)], "source.png");
  const output = await frames(await render(flash, file));
  expect([output.frames[0].width, output.frames[0].height, output.frames.length, output.averageDelayMs])
    .toEqual([500, 200, 4, 30]);
  const positive = await pixels(output.frames[0]);
  const negative = await pixels(output.frames[1]!);
  const zoom = await pixels(output.frames[2]!);
  const repeated = await pixels(output.frames[3]!);
  expect(positive(5, 30)).toEqual([186, 104, 38, 255]);
  expect(negative(5, 30)).toEqual([69, 151, 217, 255]);
  expect(zoom(5, 30)).toEqual([48, 80, 112, 255]);
  expect(repeated(5, 30)).toEqual(negative(5, 30));
  const caption = await frames(await render(flash, file, ["闪瞎示例"]));
  expect((await pixels(caption.frames[0]))(15, 190)).toEqual([0, 0, 0, 255]);
  expect((await pixels(caption.frames[1]!))(15, 190)).toEqual([255, 255, 255, 255]);
  await expect(render(flash, file, ["超过边界".repeat(30)])).rejects.toThrow("文字过长");
});
