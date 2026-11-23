import { expect, test } from "bun:test";
import { Canvas, type Image } from "skia-canvas";
import type { MemeTemplateContext } from "../builtin-template.ts";
import { readMemeImageSequence } from "../templates/animated-input.ts";
import { classicAvatarMemeTemplates } from "../templates/classic-avatar-animations.ts";

const signal = new AbortController().signal;

async function generate(key: string, width: number, height: number) {
  const source = new Canvas(30, 20);
  const draw = source.getContext("2d");
  draw.fillStyle = "#00d000";
  draw.fillRect(5, 0, 20, 20);
  const image = new File([new Uint8Array(await source.png)], "avatar.png");
  const frame = new Canvas(width, height);
  const art = frame.getContext("2d");
  art.fillStyle = "#0000cb";
  art.fillRect(122, 103, 7, 8);
  const png = await frame.png;
  const paths: string[] = [];
  const context: MemeTemplateContext = {
    signal,
    async imageAsset(path) { paths.push(path); return png; },
    async fontAsset() { throw new Error("旧模板无字体"); },
  };
  const template = classicAvatarMemeTemplates.find(value => value.info.key === key)!;
  const encoded = await template.render({ images: [image], texts: [], args: {} }, context);
  expect([...encoded.slice(0, 6)]).toEqual([71, 73, 70, 56, 57, 97]);
  const sequence = await readMemeImageSequence(new File([new Uint8Array(encoded)], "result.gif"), signal);
  return { sequence, paths };
}

async function pixel(image: Image, x: number, y: number) {
  const canvas = new Canvas(image.width, image.height);
  const draw = canvas.getContext("2d");
  draw.drawImage(image, 0, 0);
  return [...draw.getImageData(x, y, 1, 1).data];
}

test("追列车按原 120 帧动线与 50ms cadence 加载零填充的同源原画", async () => {
  const { sequence, paths } = await generate("chase_train", 196, 106);
  expect([sequence.frames.length, sequence.averageDelayMs]).toEqual([120, 50]);
  expect(paths).toEqual(Array.from({ length: 120 }, (_, index) => `chase_train/${String(index).padStart(3, "0")}.png`));
  expect(await pixel(sequence.frames[0], 140, 60)).toEqual([0, 208, 0, 255]);
  expect(await pixel(sequence.frames[67]!, 43, 40)).toEqual([0, 208, 0, 255]);
  expect((await pixel(sequence.frames[67]!, 140, 60))[3]).toBe(0);
});

test("诈尸保留原透视、顶层遮挡及最后五帧无头像，膜拜保留负顶边裁切", async () => {
  const { sequence, paths } = await generate("rise_dead", 360, 240);
  expect([sequence.frames.length, sequence.averageDelayMs, paths[0], paths.at(-1)]).toEqual([34, 150, "rise_dead/00.png", "rise_dead/33.png"]);
  expect(await pixel(sequence.frames[0], 130, 110)).toEqual([0, 208, 0, 255]);
  expect(await pixel(sequence.frames[0], 127, 106)).toEqual([0, 0, 203, 255]);
  expect((await pixel(sequence.frames[29]!, 130, 110))[3]).toBe(0);
  const bow = await generate("worship", 300, 169);
  expect([bow.sequence.frames.length, bow.sequence.averageDelayMs, bow.paths[0], bow.paths.at(-1)])
    .toEqual([10, 40, "worship/0.png", "worship/9.png"]);
  expect(await pixel(bow.sequence.frames[0], 20, 0)).toEqual([0, 208, 0, 255]);
  expect((await pixel(bow.sequence.frames[0], 130, 0))[3]).toBe(0);
});
