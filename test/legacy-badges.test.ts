import { expect, test } from "bun:test";
import { Canvas, loadImage, type Image } from "skia-canvas";
import { pythonOverlayAssets } from "../backend-python-overlay-assets.ts";
import type { MemeTemplateContext } from "../builtin-template.ts";
import { readMemeImageSequence } from "../templates/animated-input.ts";
import { encodeMemeGif } from "../templates/gif.ts";
import { legacyBadgeTemplates } from "../templates/legacy-badges.ts";

const ace = legacyBadgeTemplates.find(({ info }) => info.key === "ace_attorney_dialog")!;
const mihoyo = legacyBadgeTemplates.find(({ info }) => info.key === "mihoyo")!;
const signal = new AbortController().signal;
const logoPath = "python/meme_generator/memes/mihoyo/images/logo.png";

function screenshot(image: Image) {
  const context = new Canvas(image.width, image.height).getContext("2d");
  context.drawImage(image, 0, 0);
  return (x: number, y: number) => [...context.getImageData(x, y, 1, 1).data];
}

test("逆转裁判气泡保留专用入口、默认文字和原模板限制", () => {
  expect(ace.info).toMatchObject({
    keywords: ["逆转裁判气泡"],
    params_type: { min_images: 0, max_images: 0, min_texts: 1, max_texts: 1, default_texts: ["表情包制作"], args_type: null },
  });
});

test("米哈游居中方裁，底部使用旧标志且保留圆角透明", async () => {
  const requested: string[] = [];
  const context: MemeTemplateContext = {
    signal,
    async imageAsset(path) {
      requested.push(path);
      const canvas = new Canvas(200, 50);
      const draw = canvas.getContext("2d");
      draw.fillStyle = "white";
      draw.fillRect(0, 0, 200, 50);
      return canvas.png;
    },
    async fontAsset() { throw new Error("此模板不用字体。"); },
  };
  const canvas = new Canvas(12, 6);
  const draw = canvas.getContext("2d");
  draw.fillStyle = "blue";
  draw.fillRect(0, 0, 12, 6);
  draw.fillStyle = "red";
  draw.fillRect(3, 0, 6, 6);
  const bytes = await mihoyo.render({
    images: [new File([new Uint8Array(await canvas.png)], "avatar.png", { type: "image/png" })], texts: [], args: {},
  }, context);
  const image = await loadImage(Buffer.from(bytes));
  const pixel = screenshot(image);
  expect([image.width, image.height, requested]).toEqual([500, 500, [logoPath]]);
  expect(pixel(0, 0)[3]).toBe(0);
  expect(pixel(250, 220)).toEqual([255, 0, 0, 255]);
  expect(pixel(250, 460)).toEqual([255, 255, 255, 255]);
  expect(pixel(110, 475)[0]).toBeLessThan(80);
  expect(pythonOverlayAssets.map(([path, { digest }]) => [String(path), digest])).toContainEqual([
    `images/${logoPath}`, "dfae8c9ac643b3f935e3c6c5bb61e5613e3e020befd881bb5099bef098247322",
  ]);
});

test("米哈游动图按旧平均帧时长逐帧合成", async () => {
  function solid([red, blue]: readonly [number, number]) {
    return Uint8Array.from({ length: 8 * 8 * 4 }, (_, i) => [red, 0, blue, 255][i % 4]!);
  }
  const gif = encodeMemeGif(8, 8, [
    { rgba: solid([255, 0]), delayMs: 90 },
    { rgba: solid([0, 255]), delayMs: 120 },
  ], signal);
  const buffer = await mihoyo.render({
    images: [new File([new Uint8Array(gif)], "avatar.gif", { type: "image/gif" })], texts: [], args: {},
  }, {
    signal,
    async imageAsset() { return new Canvas(200, 50).png; },
    async fontAsset() { throw new Error("此模板不用字体。"); },
  });
  expect(Buffer.from(buffer).subarray(0, 6).toString()).toBe("GIF89a");
  const output = await readMemeImageSequence(new File([new Uint8Array(buffer)], "out.gif"), signal);
  expect([output.averageDelayMs, output.frames.length]).toEqual([100, 2]);
  const [first, second] = output.frames.map(screenshot);
  expect(first!(250, 250)).toEqual([255, 0, 0, 255]);
  expect(second!(250, 250)).toEqual([0, 0, 255, 255]);
  expect(second!(0, 0)[3]).toBe(0);
});
