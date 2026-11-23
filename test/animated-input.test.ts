import { expect, test } from "bun:test";
import { alignMemeLoop, readMemeImageSequence } from "../templates/animated-input.ts";
import { assertMemeGifDimensions, encodeMemeGif } from "../templates/gif.ts";

const signal = new AbortController().signal;
const controlMarker = Buffer.from([0x21, 0xf9, 0x04]);

function animatedGif(delays: readonly number[]) {
  return Buffer.from(encodeMemeGif(1, 1, delays.map((delayMs, index) => ({
    rgba: index % 2 ? Uint8Array.of(0, 0, 255, 255) : Uint8Array.of(255, 0, 0, 255),
    delayMs,
  })), signal));
}

function readGif(bytes: Buffer, timing?: "pillow" | "skia") {
  return readMemeImageSequence(new File([Buffer.from(bytes)], "animation.gif", { type: "image/gif" }), signal, timing);
}

test("原版长动图可保留 435 帧，仍受总像素和帧数预算限制", async () => {
  const frames = 435;
  expect((await readGif(animatedGif(Array(frames).fill(30)))).frames).toHaveLength(frames);
  expect(() => assertMemeGifDimensions(224, 224, frames)).not.toThrow();
  expect(() => assertMemeGifDimensions(250, 250, frames)).toThrow(RangeError);
  expect(() => assertMemeGifDimensions(1, 1, 1_001)).toThrow(RangeError);
});

test("旧 GIF 输入按实际记录保留 10ms，缺时长才使用旧默认", async () => {
  const fast = animatedGif([10, 10]);
  expect((await readGif(fast)).averageDelayMs).toBe(10);
  expect((await readGif(fast, "skia")).averageDelayMs).toBe(20);
  const spaced = animatedGif([10, 100]);
  const first = spaced.indexOf(controlMarker);
  const second = spaced.indexOf(controlMarker, first + 8);
  expect(first).toBeGreaterThan(12);
  expect(second).toBeGreaterThan(first);
  const missing = Buffer.concat([spaced.subarray(0, first), spaced.subarray(first + 8)]);
  expect((await readGif(missing)).averageDelayMs).toBe(60);
  expect((await readGif(missing, "skia")).averageDelayMs).toBe(50);
});

test("显式零时长参与平均，整段零时长始终可对齐", async () => {
  const gif = animatedGif([10, 10]);
  const first = gif.indexOf(controlMarker);
  const second = gif.indexOf(controlMarker, first + 8);
  gif.writeUInt16LE(0, first + 4);
  expect((await readGif(gif)).averageDelayMs).toBe(5);
  gif.writeUInt16LE(0, second + 4);
  const zeros = await readGif(gif);
  expect(zeros.averageDelayMs).toBe(20);
  expect(alignMemeLoop(zeros, 5, 60)).toHaveLength(5);
  await expect(readGif(gif.subarray(0, gif.length - 1))).rejects.toThrow("表情输入图片");
});

test("旧 100 帧上限只限制补循环，已编码 101 帧仍可解码", async () => {
  const decoded = await readGif(animatedGif(Array.from({ length: 101 }, () => 200)));
  expect(decoded.frames).toHaveLength(101);
  expect(decoded.averageDelayMs).toBe(200);
  expect(alignMemeLoop(decoded, 5, 60)).toHaveLength(100);
  expect(alignMemeLoop(decoded, 5, 60, 200)).toHaveLength(200);
});
