import { expect, test } from "bun:test";
import { Canvas } from "skia-canvas";
import { readMemeImageSequence } from "../templates/animated-input.ts";
import {
  assertMemeGifDimensions, assertMemeGifStreamDimensions, encodeMemeGif, encodeMemeGifStream, MemeGifByteLimitError,
} from "../templates/gif.ts";

test("流式编码和原编码共用调色板及帧时序，支持生产者复用画布缓冲", async () => {
  const width = 19, height = 13;
  const original = Array.from({ length: 4 }, (_, index) => {
    const rgba = new Uint8Array(width * height * 4);
    for (let pixel = 0; pixel < rgba.length; pixel += 4) {
      rgba.set([pixel ^ index, pixel >>> 3, index * 73 + pixel, pixel % 23 ? 255 : 100], pixel);
    }
    return { rgba, delayMs: 30 + index * 60 };
  });
  const signal = AbortSignal.timeout(1_000);
  async function* rendered() {
    const rgba = new Uint8Array(width * height * 4);
    for (const frame of original) {
      rgba.set(frame.rgba);
      yield { rgba, delayMs: frame.delayMs };
    }
  }
  const streamed = await encodeMemeGifStream(width, height, 5, rendered(), signal);
  expect(streamed).toEqual(encodeMemeGif(width, height, original, signal));
});

test("大图走独立预算，增加同步编码的上限仍不允许", () => {
  expect(() => assertMemeGifDimensions(810, 810, 68)).toThrow(RangeError);
  expect(() => assertMemeGifStreamDimensions(810, 810, 68)).not.toThrow();
  expect(() => assertMemeGifStreamDimensions(815, 500, 77)).not.toThrow();
  expect(() => assertMemeGifStreamDimensions(1000, 1000, 65)).toThrow(RangeError);
});

test("流式编码拒绝无效帧并在信号取消后停止读取生产者", async () => {
  const controller = new AbortController();
  let closed = false;
  async function* interrupted() {
    try {
      yield { rgba: new Uint8Array(4), delayMs: 100 };
      controller.abort(new Error("取消测试"));
      yield { rgba: new Uint8Array(4), delayMs: 100 };
      throw new Error("取消后不应继续读取");
    } finally {
      closed = true;
    }
  }
  const rendered = () => (async function* () {
    yield { rgba: new Uint8Array(4), delayMs: 100 };
    yield { rgba: new Uint8Array(4), delayMs: 100 };
  })();
  await expect(encodeMemeGifStream(1, 1, 2, interrupted(), controller.signal)).rejects.toThrow("取消测试");
  expect(closed).toBe(true);
  const signal = AbortSignal.timeout(1_000);
  await expect(encodeMemeGifStream(1, 1, 1, rendered(), signal)).rejects.toThrow(RangeError);
  await expect(encodeMemeGifStream(2, 2, 2, rendered(), signal)).rejects.toThrow("帧像素或时长无效");
});

test("流式编码严格限制发送字节数", async () => {
  const width = 1024, height = 1024, frames = 8;
  async function* rendered() {
    const rgba = new Uint8Array(width * height * 4);
    let noise = 17;
    for (let i = 0; i < frames; i++) {
      for (let pixel = 0; pixel < rgba.length; pixel += 4) {
        noise = (Math.imul(noise, 1664525) + 1013904223) | 0;
        rgba[pixel] = noise >>> 8;
        rgba[pixel + 1] = noise >>> 16;
        rgba[pixel + 2] = noise >>> 24;
        rgba[pixel + 3] = 255;
      }
      yield { rgba, delayMs: 30 };
    }
  }
  await expect(encodeMemeGifStream(width, height, frames, rendered(), AbortSignal.timeout(10_000)))
    .rejects.toThrow(MemeGifByteLimitError);

  let yielded = 0;
  async function* renderOnce() {
    for await (const frame of rendered()) {
      yielded++;
      yield frame;
    }
  }
  const signal = AbortSignal.timeout(12_000);
  const optedIn = await encodeMemeGifStream(width, height, frames, renderOnce(), signal, { paletteLimits: [216, 8] });
  expect(yielded).toBe(frames);
  expect(optedIn.byteLength).toBeLessThanOrEqual(8 * 1024 * 1024);
  expect(optedIn[10]! & 7).toBe(2); // The 216-color pass hit the same byte limit.
  const sequence = await readMemeImageSequence(new File([new Uint8Array(optedIn)], "sample.gif"), signal);
  expect(sequence.frames).toHaveLength(frames);
  expect(sequence.averageDelayMs).toBe(30);
  expect(sequence.frames[0]).toMatchObject({ width, height });
}, 24_000);

test("超限的全帧使用局部更新，且保持实际显示像素和透明区域", async () => {
  const width = 1024, height = 1024, count = 8;
  const rgba = new Uint8Array(width * height * 4);
  let noise = 29;
  for (let pixel = 0; pixel < rgba.length; pixel += 4) {
    noise = (Math.imul(noise, 1664525) + 1013904223) | 0;
    rgba.set([noise >>> 25, 100, 40, 255], pixel);
  }
  const frames = Array.from({ length: count }, (_, index) => {
    const pixels = rgba.slice();
    pixels.set([20, 100, 40, 0], index < 4 ? 40 : 4000);
    return { rgba: pixels, delayMs: 30 + 10 * index };
  });
  const signal = AbortSignal.timeout(15_000);
  const complete = encodeMemeGif(width, height, frames, signal);
  expect(complete.length).toBeGreaterThan(8 * 1024 * 1024);
  async function* rendered() { yield* frames; }
  const compact = await encodeMemeGifStream(width, height, count, rendered(), signal);
  expect(compact.length).toBeLessThan(8 * 1024 * 1024);
  const read = (bytes: Uint8Array) => readMemeImageSequence(new File([new Uint8Array(bytes)], "sample.gif"), signal);
  const baseline = await read(complete), result = await read(compact);
  expect(result.frames).toHaveLength(count);
  expect(result.averageDelayMs).toBe(baseline.averageDelayMs);
  const context = new Canvas(width, height).getContext("2d");
  const hashFrame = (image: (typeof result.frames)[number]) => {
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0);
    return Bun.hash(context.getImageData(0, 0, width, height).data);
  };
  expect(result.frames.map(hashFrame)).toEqual(baseline.frames.map(hashFrame));
}, 16_000);
