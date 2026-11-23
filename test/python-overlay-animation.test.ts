import { expect, test } from "bun:test";
import { Canvas, type Image } from "skia-canvas";
import { pythonOverlayAssets } from "../backend-python-overlay-assets.ts";
import { readMemeImageSequence } from "../templates/animated-input.ts";
import { encodeMemeGif } from "../templates/gif.ts";
import { pythonOverlayMemeTemplates } from "../templates/python-overlay-animation.ts";

const signal = new AbortController().signal;
const fontAsset = async () => { throw new Error("旧模板不需要字体。"); };

async function inspectPixel(image: Image, x: number, y: number) {
  const canvas = new Canvas(image.width, image.height);
  const draw = canvas.getContext("2d");
  draw.drawImage(image, 0, 0);
  return [...draw.getImageData(x, y, 1, 1).data];
}

async function decode(bytes: Uint8Array) {
  expect(Buffer.from(bytes).subarray(0, 6).toString()).toBe("GIF89a");
  return readMemeImageSequence(new File([new Uint8Array(bytes)], "meme.gif"), signal);
}

test("吃只采首帧头像、横图居中方裁并贴在原画半透明笔划之下", async () => {
  const eat = pythonOverlayMemeTemplates.find(template => template.info.key === "eat")!;
  const first = Uint8Array.from({ length: 6 * 2 * 4 }, (_, i) => {
    const column = Math.floor(i / 4) % 6;
    return i % 4 === 3 ? 255 : i % 4 === 1 && column >= 2 && column < 4 ? 200 : 0;
  });
  const second = Uint8Array.from(first, (channel, index) => index % 4 === 0 ? 255 : channel);
  const source = new File([new Uint8Array(encodeMemeGif(6, 2, [
    { rgba: first, delayMs: 70 }, { rgba: second, delayMs: 110 },
  ], signal))], "avatar.gif");
  const requested: string[] = [];
  async function imageAsset(path: string) {
    const index = requested.length;
    requested.push(path);
    const canvas = new Canvas(60, 67);
    const draw = canvas.getContext("2d");
    draw.fillStyle = `rgb(${70 + index}, 50, 20)`;
    draw.fillRect(index, 0, 1, 1);
    draw.fillStyle = "rgba(200, 0, 0, 0.5)";
    draw.fillRect(8, 48, 5, 5);
    return canvas.png;
  }
  const output = await decode(await eat.render({ images: [source], texts: [], args: {} }, { signal, fontAsset, imageAsset }));
  expect(requested).toEqual(["eat/0.png", "eat/1.png", "eat/2.png"]);
  expect([output.frames[0].width, output.frames[0].height, output.frames.length, output.averageDelayMs]).toEqual([60, 67, 3, 50]);
  for (const frame of output.frames) {
    expect(await inspectPixel(frame, 24, 50)).toEqual([0, 200, 0, 255]);
    const blend = await inspectPixel(frame, 10, 50);
    expect(Math.abs(blend[0]! - 100)).toBeLessThan(3);
    expect(Math.abs(blend[1]! - 100)).toBeLessThan(3);
    expect(blend[3]).toBe(255);
    expect((await inspectPixel(frame, 50, 50))[3]).toBe(0);
  }
});

test("顶 / 玩保留 58 帧重复片段和无头像的 20 帧结尾", async () => {
  const play = pythonOverlayMemeTemplates.find(template => template.info.key === "play")!;
  expect(play.info).toMatchObject({ keywords: ["顶", "玩"], tags: ["猫猫虫", "咖波"], params_type: { min_images: 1, max_images: 1 } });
  const avatar = new Canvas(10, 10);
  const avatarDraw = avatar.getContext("2d");
  avatarDraw.fillStyle = "#00ff00";
  avatarDraw.fillRect(0, 0, 10, 10);
  const source = new File([new Uint8Array(await avatar.png)], "avatar.png");
  const requested: string[] = [];
  const playAssets = pythonOverlayAssets.filter(([path]) => path.startsWith("images/python/meme_generator/memes/play/images/"));
  expect(playAssets).toHaveLength(38);
  async function imageAsset(path: string) {
    const index = requested.length;
    const [key, metadata] = playAssets[index]!;
    expect<string>(key).toBe(`images/${path}`);
    expect<string>(metadata.path).toBe(path.slice("python/".length));
    expect(metadata.digest).toMatch(/^[0-9a-f]{64}$/u);
    requested.push(path);
    const canvas = new Canvas(310, 245);
    const draw = canvas.getContext("2d");
    draw.fillStyle = `rgb(${40 + index}, 0, 0)`;
    draw.fillRect(0, 0, 1, 1);
    return canvas.png;
  }
  const output = await decode(await play.render({ images: [source], texts: [], args: {} }, { signal, fontAsset, imageAsset }));
  expect([output.frames.length, output.averageDelayMs, requested.length]).toEqual([58, 60, 38]);
  const ordered = [[0, 0], [11, 11], [12, 0], [23, 11], [24, 0], [31, 7], [32, 12], [37, 17], [38, 18], [57, 37]];
  for (const [outputIndex, artIndex] of ordered) {
    expect((await inspectPixel(output.frames[outputIndex!]!, 0, 0))[0]).toBe(40 + artIndex!);
  }
  expect(await inspectPixel(output.frames[0], 230, 100)).toEqual([0, 255, 0, 255]);
  expect((await inspectPixel(output.frames[38]!, 230, 100))[3]).toBe(0);
  await expect(play.render({ images: [source, source], texts: [], args: {} }, { signal, fontAsset, imageAsset })).rejects.toThrow("一张图片");
});
