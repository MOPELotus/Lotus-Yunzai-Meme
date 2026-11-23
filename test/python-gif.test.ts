import { expect, test } from "bun:test";
import { renderRgba } from "../../../packages/skia/index.ts";
import { readMemeImageSequence } from "../templates/animated-input.ts";
import { encodeMemeGif } from "../templates/gif.ts";
import { renderPythonGif } from "../templates/python-gif.ts";
import { waveMemeTemplate } from "../templates/wave.ts";

const signal = new AbortController().signal;

function solid(width: number, height: number, color: number) {
  return Buffer.alloc(width * height * 4, Uint8Array.of(color, color, color, 255));
}

function sourceFrames(count: number) {
  return Array.from({ length: count }, (_, value) => ({ value, delayMs: value % 2 ? 30 : 80 }));
}

function read(bytes: Uint8Array) {
  return readMemeImageSequence(new File([new Uint8Array(bytes)], "result.gif"), signal);
}

test("原输出符合预算时，超过百帧的原图继续逐字节保留", async () => {
  const frames = sourceFrames(137);
  const width = 3, height = 5;
  const output = await renderPythonGif({
    frames, width, height, signal,
    async renderFrame(value, width, height) { return solid(width, height, value); },
  });
  expect(output).toEqual(encodeMemeGif(width, height,
    frames.map(({ value, delayMs }) => ({ rgba: solid(width, height, value), delayMs })), signal));
  const result = await read(output);
  expect(result.frames).toHaveLength(137);
});

test("超过渲染预算时按原下标取样并逐次缩小，选中帧保留原时间点", async () => {
  const frames = sourceFrames(125);
  const drawn: { value: number; width: number; height: number }[] = [];
  const output = await renderPythonGif({
    frames, width: 4_200, height: 2, signal,
    async renderFrame(value, width, height) {
      drawn.push({ value, width, height });
      const { rgba, engine } = await renderRgba(width, height, canvas => {
        canvas.fillStyle = `rgb(${value}, ${value}, ${value})`;
        canvas.fillRect(0, 0, width, height);
      });
      if (Bun.env.LOTUS_SKIA_MODE === "gpu") {
        expect(engine.renderer).toBe("GPU");
        expect(engine.device).toContain("RTX A4000");
      }
      return rgba;
    },
  });
  expect(drawn).toEqual(Array.from({ length: 100 }, (_, index) => ({
    value: Math.floor(index * 125 / 100), width: 3780, height: 1,
  })));
  const result = await read(output);
  expect(result.frames).toHaveLength(100);
  expect(result.averageDelayMs * 100).toBeCloseTo(frames.reduce((sum, frame) => sum + frame.delayMs, 0));
});

test("GIF 输出超过发送上限才缩小，帧数和时长都保留", async () => {
  const frames = sourceFrames(65);
  const draws: [number, number][] = [];
  const fixtures = new Map<number, Buffer>();
  const output = await renderPythonGif({
    frames, width: 370, height: 296, signal,
    async renderFrame(value, width, height) {
      if (value === 0) draws.push([width, height]);
      if (!fixtures.has(width)) {
        const rgba = Buffer.alloc(width * height * 4);
        let random = 104729;
        for (let offset = 0; offset < rgba.length; offset += 4) {
          random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
          const color = random >>> 24;
          rgba.set([color, color ^ 173, color ^ 95, 255], offset);
        }
        fixtures.set(width, rgba);
      }
      return fixtures.get(width)!;
    },
  });
  expect(draws).toEqual([[370, 296], [333, 266]]);
  expect(output.byteLength).toBeLessThanOrEqual(8 * 1024 * 1024);
  const result = await read(output);
  expect(result.frames).toHaveLength(65);
  expect(result.averageDelayMs * 65).toBeCloseTo(frames.reduce((sum, frame) => sum + frame.delayMs, 0));
}, 15_000);

test("渲染器自身的 RangeError 会原样报告，取消后不再画下一帧", async () => {
  const controller = new AbortController();
  const frames = sourceFrames(2);
  await expect(renderPythonGif({
    width: 1, height: 1, frames, signal,
    async renderFrame() { throw new RangeError("目标模板的头部坐标无效"); },
  })).rejects.toThrow("目标模板的头部坐标无效");
  let draws = 0;
  await expect(renderPythonGif({
    width: 1, height: 1, frames, signal: controller.signal,
    async renderFrame() {
      draws++;
      controller.abort(new Error("取消帧合成"));
      return solid(1, 1, 100);
    },
  })).rejects.toThrow("取消帧合成");
  expect(draws).toBe(1);
});

test("波纹超高输入先缩小取样画布，仍输出八帧 10ms", async () => {
  const source = encodeMemeGif(7, 330, [{ rgba: solid(7, 330, 120), delayMs: 20 }], signal);
  const result = await waveMemeTemplate.render({
    images: [new File([new Uint8Array(source)], "tall.gif")], texts: [], args: {},
  }, {
    signal,
    async imageAsset() { throw new Error("波纹不使用固定素材"); },
    async fontAsset() { throw new Error("波纹不使用字体"); },
  });
  const sequence = await read(result);
  expect(sequence.frames).toHaveLength(8);
  expect(sequence.averageDelayMs).toBe(10);
  expect(sequence.frames[0].height).toBeLessThanOrEqual(4096);
  expect(sequence.frames[0].height).toBeGreaterThan(3000);
  expect(sequence.frames[0].width).toBeLessThan(354);
});
