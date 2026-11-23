import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { Canvas, loadImage } from "skia-canvas";
import { readMemeImageSequence } from "../templates/animated-input.ts";
import { avatarCaptionMemeTemplates } from "../templates/avatar-caption-cards.ts";
import { encodeMemeGif } from "../templates/gif.ts";
import { builtinMemeTemplates } from "../templates/index.ts";

const signal = new AbortController().signal;
const context = {
  signal,
  async imageAsset() { throw new Error("这个模板不需要底图。"); },
  async fontAsset() { return readFile(new URL("../../starrail/rogue-theme/SR.ttf", import.meta.url)); },
};
const [keepAway, littleAngel] = avatarCaptionMemeTemplates;

test("远离按原顺序分配八格，三张头像的剩余格归最后一张", async () => {
  expect(builtinMemeTemplates).toContain(keepAway);
  const images = await Promise.all(["#ff0000", "#00ff00", "#0000ff"].map(async color => {
    const canvas = new Canvas(20, 10);
    const draw = canvas.getContext("2d");
    draw.fillStyle = color;
    draw.fillRect(5, 0, 10, 10);
    return new File([new Uint8Array(await canvas.png)], "头像.png");
  }));
  const image = await loadImage(Buffer.from(await keepAway.render({ images, texts: [], args: {} }, context)));
  expect([image.width, image.height]).toEqual([400, 290]);
  const draw = new Canvas(image.width, image.height).getContext("2d");
  draw.drawImage(image, 0, 0);
  const channels = Array.from({ length: 8 }, (_, slot) => {
    const pixel = draw.getImageData(slot % 4 * 100 + 50, Math.floor(slot / 4) * 100 + 140, 1, 1).data;
    return [0, 1, 2].find(channel => pixel[channel]! > 240);
  });
  expect(channels).toEqual([0, 0, 1, 1, 2, 2, 2, 2]);
});

test("小天使保留 GIF 的帧数、平均帧延时和原图宽高比", async () => {
  expect(builtinMemeTemplates).toContain(littleAngel);
  const rgba = Uint8Array.from({ length: 20 * 12 * 4 }, (_, index) => index % 4 === 3 ? 255 : 0);
  const next = Uint8Array.from(rgba, (byte, index) => index % 4 === 0 ? 255 : byte);
  const gif = encodeMemeGif(20, 12, [{ rgba, delayMs: 70 }, { rgba: next, delayMs: 110 }], signal);
  const file = new File([new Uint8Array(gif)], "头像.gif");
  const bytes = await littleAngel.render({ images: [file], texts: ["用户"], args: {} }, context);
  const sequence = await readMemeImageSequence(new File([new Uint8Array(bytes)], "小天使.gif"), signal);
  expect([sequence.frames[0].width, sequence.frames[0].height, sequence.frames.length, sequence.averageDelayMs])
    .toEqual([600, 530, 2, 90]);
});
