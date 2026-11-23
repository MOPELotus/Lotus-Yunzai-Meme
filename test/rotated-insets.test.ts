import { expect, test } from "bun:test";
import { Canvas, loadImage } from "skia-canvas";
import type { MemeTemplateContext } from "../builtin-template.ts";
import { rotatedInsetMemeTemplates } from "../templates/rotated-insets.ts";

const signal = new AbortController().signal;

async function colorAt(key: string) {
  const template = rotatedInsetMemeTemplates.find(item => item.info.key === key)!;
  const source = new Canvas(30, 30);
  const draw = source.getContext("2d");
  draw.fillStyle = "#22cc44";
  draw.fillRect(0, 0, 30, 30);
  const context: MemeTemplateContext = {
    signal,
    async fontAsset() { throw new Error("旋转贴图不需要字体"); },
    async imageAsset(path) {
      expect(path).toBe(`${key}/0.png`);
      return new Canvas(340, 330).png;
    },
  };
  const result = await template.render({
    images: [new File([new Uint8Array(await source.png)], "photo.png")], texts: [], args: {},
  }, context);
  expect([...result.slice(0, 3)]).toEqual([255, 216, 255]);
  const image = await loadImage(Buffer.from(result));
  expect([image.width, image.height]).toEqual([340, 330]);
  const output = new Canvas(image.width, image.height);
  const sample = output.getContext("2d");
  sample.drawImage(image, 0, 0);
  return (x: number, y: number) => [...sample.getImageData(x, y, 1, 1).data];
}

test("绘画旋转后按 Pillow 扩边，为什么@我按原 265 像素画布裁边", async () => {
  const expanded = await colorAt("paint");
  expect(expanded(216, 214)[0]).toBeLessThan(60);
  expect(expanded(223, 228).slice(0, 3).every(value => value > 240)).toBeTrue();
  const clipped = await colorAt("why_at_me");
  expect(clipped(290, 120)[0]).toBeLessThan(60);
  expect(clipped(312, 120).slice(0, 3).every(value => value > 240)).toBeTrue();
});

test("怒撕同一图按相反角度进入两个独立原位置", async () => {
  const pixel = await colorAt("rip_angrily");
  expect(pixel(88, 240)[0]).toBeLessThan(60);
  expect(pixel(233, 135)[0]).toBeLessThan(60);
  expect(pixel(184, 258).slice(0, 3).every(value => value > 240)).toBeTrue();
});
