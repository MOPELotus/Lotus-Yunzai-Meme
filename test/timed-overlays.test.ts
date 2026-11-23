import { expect, test } from "bun:test";
import { Canvas, type Image } from "skia-canvas";
import { readMemeImageSequence } from "../templates/animated-input.ts";
import { encodeMemeGif } from "../templates/gif.ts";
import { timedOverlayMemeTemplates, timedOverlayTimeline } from "../templates/timed-overlays.ts";

const signal = new AbortController().signal;
const file = (bytes: Uint8Array, name: string) => new File([new Uint8Array(bytes)], name);

function gray(grayValue: number) {
  return Uint8Array.from({ length: 20 * 20 * 4 }, (_, i) => i % 4 === 3 ? 255 : grayValue);
}

function animated(delayMs: number) {
  return file(encodeMemeGif(20, 20, [{ rgba: gray(48), delayMs }, { rgba: gray(208), delayMs }], signal), "avatar.gif");
}

async function render(key: string, width: number, height: number, input: File) {
  const template = timedOverlayMemeTemplates.find(item => item.info.key === key)!;
  const art = new Canvas(width, height);
  const draw = art.getContext("2d");
  draw.fillStyle = "#d00000";
  draw.fillRect(47, 40, 16, 12);
  const asset = await art.png;
  const paths: string[] = [];
  const output = await template.render({ images: [input], texts: [], args: {} }, {
    signal,
    async fontAsset() { throw new Error("旧模板无字体"); },
    async imageAsset(path) { paths.push(path); return asset; },
  });
  return { result: await readMemeImageSequence(file(output, "output.gif"), signal), paths };
}

function pixel(image: Image, x: number, y: number) {
  const canvas = new Canvas(image.width, image.height);
  const draw = canvas.getContext("2d");
  draw.drawImage(image, 0, 0);
  return [...draw.getImageData(x, y, 1, 1).data];
}

test("首帧延长、尾帧延长和禁止延长保留旧目标动作与源图切换时刻", async () => {
  const source = await readMemeImageSequence(animated(3600), signal);
  const first = timedOverlayTimeline(source, 29, 200, "extend-first");
  expect([first.length, first[7]!.value.overlay, first[13]!.value.overlay, first.at(-1)!.value.overlay]).toEqual([36, 0, 6, 28]);
  expect(first[17]!.value.image).toBe(source.frames[0]);
  expect(first[18]!.value.image).toBe(source.frames[1]!);
  const last = timedOverlayTimeline(source, 60, 60, "extend-last");
  expect([last.length, last[59]!.value.overlay, last.at(-1)!.value.overlay]).toEqual([120, 59, 59]);
  expect(last[60]!.value.image).toBe(source.frames[1]!);
  const none = timedOverlayTimeline(source, 16, 40, "no-extend");
  expect([none.length, none.at(-1)!.value.overlay, none.at(-1)!.value.image]).toEqual([16, 15, source.frames[0]]);
});

test("撕衣服在尾段沿用原图延时与颜色，不再读入模板艺术层", async () => {
  const { result, paths } = await render("rip_clothes", 480, 270, animated(1400));
  expect([result.frames.length, result.averageDelayMs, paths[0], paths.at(-1)]).toEqual([28, 100, "rip_clothes/00.png", "rip_clothes/15.png"]);
  expect(pixel(result.frames[0], 50, 45)).toEqual([208, 0, 0, 255]);
  expect(pixel(result.frames[0], 100, 100)).toEqual([48, 48, 48, 255]);
  expect(pixel(result.frames.at(-1)!, 50, 45)).toEqual([208, 208, 208, 255]);
});

test("洗衣机先在输入矩形内旋转，再拉伸至固定方框", async () => {
  const input = new Canvas(80, 40);
  const draw = input.getContext("2d");
  draw.fillStyle = "#00d000";
  draw.fillRect(0, 0, 80, 40);
  const { result, paths } = await render("washer", 200, 200, file(await input.png, "avatar.png"));
  expect([result.frames.length, result.averageDelayMs, paths]).toEqual([12, 100, ["washer/0.png"]]);
  expect(pixel(result.frames[0], 70, 93)).toEqual([0, 208, 0, 255]);
  expect(pixel(result.frames[3]!, 70, 93)[3]).toBe(0);
  expect(pixel(result.frames[3]!, 100, 93)).toEqual([0, 208, 0, 255]);
});
