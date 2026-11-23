import { expect, test } from "bun:test";
import { Canvas, loadImage, type Image } from "skia-canvas";
import { jumpSoldAssets } from "../backend-jump-sold-assets.ts";
import type { MemeTemplateContext } from "../builtin-template.ts";
import { readMemeImageSequence } from "../templates/animated-input.ts";
import { encodeMemeGif } from "../templates/gif.ts";
import { jumpSoldMemeTemplates } from "../templates/jump-sold.ts";
import type { Draw } from "../templates/template-layout.ts";

const signal = new AbortController().signal;

async function raster(width: number, height: number, paint: Draw) {
  const canvas = new Canvas(width, height);
  paint(canvas.getContext("2d"));
  return canvas.png;
}

async function pixel(image: Image, x: number, y: number) {
  const canvas = new Canvas(image.width, image.height);
  const draw = canvas.getContext("2d");
  draw.drawImage(image, 0, 0);
  return [...draw.getImageData(x, y, 1, 1).data];
}

function fromFile(bytes: Uint8Array, name: string) {
  return new File([new Uint8Array(bytes)], name);
}

const fontAsset = async () => { throw new Error("原模板无字体"); };

test("跳保留处于底图上方的圆头像、8 帧与负坐标原裁切", async () => {
  const template = jumpSoldMemeTemplates.find(item => item.info.key === "jump")!;
  const art = await raster(100, 110, draw => {
    draw.fillStyle = "#c00000";
    draw.fillRect(0, 0, 100, 110);
  });
  const avatar = await raster(80, 40, draw => {
    draw.fillStyle = "#00e000";
    draw.fillRect(20, 0, 40, 40);
  });
  const requested: string[] = [];
  const context: MemeTemplateContext = { signal, fontAsset, async imageAsset(path) { requested.push(path); return art; } };
  const content = await template.render({ images: [fromFile(avatar, "avatar.png")], texts: [], args: {} }, context);
  const output = await readMemeImageSequence(fromFile(content, "meme.gif"), signal);
  expect(requested).toEqual(Array.from({ length: 8 }, (_, i) => `jump/${i}.png`));
  expect([output.frames.length, output.averageDelayMs]).toEqual([8, 50]);
  expect(await pixel(output.frames[0], 35, 70)).toEqual([0, 224, 0, 255]);
  expect(await pixel(output.frames[0], 15, 50)).toEqual([192, 0, 0, 255]);
  expect(await pixel(output.frames[5]!, 36, 0)).toEqual([0, 224, 0, 255]);
});

test("卖掉了保留短边 600 与旧图标按高度定位，静图 JPEG，动图按输入平均时长保留", async () => {
  const template = jumpSoldMemeTemplates.find(item => item.info.key === "sold_out")!;
  const icon = await raster(60, 40, draw => {
    draw.fillStyle = "#ff0000";
    draw.fillRect(0, 0, 60, 40);
  });
  const avatar = await raster(100, 50, draw => {
    draw.fillStyle = "#c8c8c8";
    draw.fillRect(0, 0, 100, 50);
  });
  const context: MemeTemplateContext = {
    signal, fontAsset, async imageAsset(path) { expect(path).toBe("sold_out/0.png"); return icon; },
  };
  const run = (photo: File) => template.render({ images: [photo], texts: [], args: {} }, context);
  const result = await run(fromFile(avatar, "avatar.png"));
  expect([...result.slice(0, 3)]).toEqual([255, 216, 255]);
  const image = await loadImage(Buffer.from(result));
  expect([image.width, image.height]).toEqual([1200, 600]);
  const background = await pixel(image, 550, 300);
  expect(background.slice(0, 3).every(v => v > 163 && v < 178)).toBeTrue();
  expect((await pixel(image, 575, 300))[1]).toBeGreaterThan(130);
  expect((await pixel(image, 610, 300))[0]).toBeGreaterThan(230);
  const solid = (gray: number) => Uint8Array.from({ length: 10 * 10 * 4 }, (_, i) => i % 4 === 3 ? 255 : gray);
  const gif = encodeMemeGif(10, 10, [{ rgba: solid(120), delayMs: 20 }, { rgba: solid(240), delayMs: 100 }], signal);
  const output = await readMemeImageSequence(fromFile(await run(fromFile(gif, "source.gif")), "result.gif"), signal);
  expect([output.frames[0].width, output.frames[0].height, output.frames.length, output.averageDelayMs]).toEqual([600, 600, 2, 60]);
  expect((await pixel(output.frames[0], 50, 50))[0]).toBeLessThan(100);
  expect((await pixel(output.frames[1]!, 50, 50))[0]).toBeGreaterThan(170);
});

test("蜘蛛和豆的固定清单沿用各自旧版路径与个数", () => {
  expect(jumpSoldAssets).toHaveLength(85);
  expect(jumpSoldAssets[0]?.[0]).toBe("images/python/meme_generator/memes/spider/images/0.png");
  expect(jumpSoldAssets[51]?.[0]).toBe("images/python/meme_generator/memes/spider/images/51.png");
  expect(jumpSoldAssets[52]?.[0]).toBe("images/anyliew/emoji/peas/images/1.png");
  expect(jumpSoldAssets[84]?.[0]).toBe("images/anyliew/emoji/peas/images/33.png");
});
