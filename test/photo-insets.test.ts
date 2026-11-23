import { expect, test } from "bun:test";
import { Canvas, loadImage } from "skia-canvas";
import { tudouWelcomePath } from "../backend-tudou-portrait-animation-assets.ts";
import type { MemeTemplateContext } from "../builtin-template.ts";
import { encodeMemeGif } from "../templates/gif.ts";
import { photoInsetMemeTemplates } from "../templates/photo-insets.ts";
import type { Draw } from "../templates/template-layout.ts";

const signal = new AbortController().signal;

async function raster(width: number, height: number, paint: Draw) {
  const canvas = new Canvas(width, height);
  paint(canvas.getContext("2d"));
  return canvas.png;
}

async function sample(content: Uint8Array) {
  expect([...content.slice(0, 3)]).toEqual([255, 216, 255]);
  const image = await loadImage(Buffer.from(content));
  const canvas = new Canvas(image.width, image.height);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  return { image, pixel: (x: number, y: number) => [...context.getImageData(x, y, 1, 1).data] };
}

test("防诱拐只取动图首帧并 cover 居中裁切，保留原图前景及白底 JPEG", async () => {
  const template = photoInsetMemeTemplates.find(item => item.info.key === "anti_kidnap")!;
  const createFrame = (first: boolean) => Uint8Array.from({ length: 6 * 2 * 4 }, (_, i) => {
    const x = Math.floor(i / 4) % 6;
    if (i % 4 === 3) return 255;
    if (!first) return i % 4 === 2 ? 250 : 0;
    return i % 4 === 1 && x >= 2 && x <= 3 ? 230 : 0;
  });
  const source = encodeMemeGif(6, 2, [
    { rgba: createFrame(true), delayMs: 60 }, { rgba: createFrame(false), delayMs: 90 },
  ], signal);
  const context: MemeTemplateContext = {
    signal,
    async fontAsset() { throw new Error("原模板无字体资源"); },
    async imageAsset(path) {
      expect(path).toBe("anti_kidnap/0.png");
      return raster(500, 550, draw => {
        draw.fillStyle = "#df1818";
        draw.fillRect(100, 200, 65, 65);
      });
    },
  };
  const content = await template.render({ images: [new File([new Uint8Array(source)], "photo.gif")], texts: [], args: {} }, context);
  const { image, pixel } = await sample(content);
  expect([image.width, image.height]).toEqual([500, 550]);
  expect(pixel(255, 302)[1]).toBeGreaterThan(220);
  expect(pixel(255, 302)[2]).toBeLessThan(10);
  expect(pixel(130, 225)[0]).toBeGreaterThan(200);
  expect(pixel(130, 225)[1]).toBeLessThan(36);
  expect(pixel(10, 30).slice(0, 3).every(value => value > 246)).toBeTrue();
});

test("白天黑夜保留双图输入顺序和分隔，透明输入替换原图而变为 JPEG 白底", async () => {
  const template = photoInsetMemeTemplates.find(item => item.info.key === "daynight")!;
  expect(template.info).toMatchObject({ keywords: ["白天黑夜", "白天晚上"], params_type: { min_images: 2, max_images: 2 } });
  const top = await raster(333, 360, draw => {
    draw.fillStyle = "#f22222";
    draw.fillRect(0, 0, 160, 360);
  });
  const bottom = await raster(333, 360, draw => {
    draw.fillStyle = "#1828e8";
    draw.fillRect(0, 0, 333, 360);
  });
  const context: MemeTemplateContext = {
    signal,
    async fontAsset() { throw new Error("原模板无字体资源"); },
    async imageAsset(path) {
      expect(path).toBe("daynight/0.png");
      return raster(682, 718, draw => {
        draw.fillStyle = "#258816";
        draw.fillRect(0, 0, 682, 718);
      });
    },
  };
  const images = [top, bottom].map((image, i) => new File([new Uint8Array(image)], `${i}.png`));
  await expect(template.render({ images: images.slice(0, 1), texts: [], args: {} }, context)).rejects.toThrow("2 张");
  const { image, pixel } = await sample(await template.render({ images, texts: [], args: {} }, context));
  expect([image.width, image.height]).toEqual([682, 718]);
  expect(pixel(420, 200)[0]).toBeGreaterThan(220);
  expect(pixel(420, 570)[2]).toBeGreaterThan(220);
  expect(pixel(620, 175).slice(0, 3).every(value => value > 245)).toBeTrue();
  expect(pixel(220, 360)[1]).toBeGreaterThan(130);
});

test("欢迎保留两个旧目录别名，取模板 GIF 首帧输出白底 JPEG", async () => {
  const template = photoInsetMemeTemplates.find(item => item.info.key === "huanying")!;
  expect(template.info).toMatchObject({ keywords: ["欢迎", "欢迎新人"], params_type: { min_images: 1, max_images: 1 } });
  const avatar = await raster(220, 65, draw => {
    draw.fillStyle = "#ef2020";
    draw.fillRect(0, 0, 220, 65);
  });
  const frames = [false, true].map(alternate => {
    const rgba = new Uint8Array(300 * 315 * 4);
    for (let y = 175; y < 195; y++) {
      for (let x = 90; x < 110; x++) {
        const i = (y * 300 + x) * 4;
        rgba[i + (alternate ? 1 : 2)] = 235;
        rgba[i + 3] = 255;
      }
    }
    return { rgba, delayMs: 50 };
  });
  const context: MemeTemplateContext = {
    signal,
    async imageAsset(path) {
      expect(path).toBe(tudouWelcomePath);
      return Buffer.from(encodeMemeGif(300, 315, frames, signal));
    },
    async fontAsset() { throw new Error("旧模板没有字体资源"); },
  };
  const { image, pixel } = await sample(await template.render({ images: [new File([new Uint8Array(avatar)], "头像.png")], texts: [], args: {} }, context));
  expect([image.width, image.height]).toEqual([300, 315]);
  expect(pixel(100, 185)[2]).toBeGreaterThan(225);
  expect(pixel(140, 205)[0]).toBeGreaterThan(230);
  expect(pixel(20, 30).slice(0, 3).every(value => value > 245)).toBeTrue();
});
