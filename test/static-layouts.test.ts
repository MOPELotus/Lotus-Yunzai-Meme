import { expect, test } from "bun:test";
import { Canvas } from "skia-canvas";
import { parseGenerationArgs } from "../generation-args.ts";
import { readMemeImageSequence } from "../templates/animated-input.ts";
import { encodeMemeGif } from "../templates/gif.ts";
import { staticMemeTemplates } from "../templates/static-layouts.ts";

const signal = new AbortController().signal;

test("静态模板沿用固定旧库存参数，循环与套娃仍选择各自旧别名", () => {
  const [always, alwaysLike, support] = staticMemeTemplates;
  expect(always?.info.shortcuts).toEqual([{ key: "一直一直", args: ["--loop"] }]);
  const schema = always?.info.params_type.args_type;
  expect(parseGenerationArgs(schema, "--mode loop").values).toMatchObject({ mode: "loop" });
  expect(parseGenerationArgs(schema, "套娃").values).toMatchObject({ mode: "circle" });
  expect(parseGenerationArgs(schema, "循环").values).toMatchObject({ mode: "loop" });
  expect(alwaysLike?.info.params_type).toMatchObject({ min_images: 1, max_images: 6, min_texts: 0, max_texts: 6 });
  expect(support?.info.params_type).toMatchObject({ min_images: 1, max_images: 1, min_texts: 0, max_texts: 0 });
});

test("表情 GIF 涵盖透明像素、有序帧和原时长，可以由共享 Skia 输入正常解码", async () => {
  const clear = [0, 0, 0, 0], red = [240, 20, 30, 255], blue = [20, 40, 230, 255];
  const bytes = encodeMemeGif(4, 1, [
    { rgba: Uint8Array.from([...clear, ...red, ...red, ...blue]), delayMs: 60 },
    { rgba: Uint8Array.from([...blue, ...clear, ...red, ...blue]), delayMs: 100 },
  ], signal);
  const input = new File([new Uint8Array(bytes)], "test.gif", { type: "image/gif" });
  expect(Buffer.from(bytes.subarray(0, 6)).toString()).toBe("GIF89a");
  const result = await readMemeImageSequence(input, signal);
  expect(result.averageDelayMs).toBe(80);
  expect(result.frames).toHaveLength(2);
  const canvas = new Canvas(4, 1);
  const context = canvas.getContext("2d");
  for (const [index, image] of result.frames.entries()) {
    context.clearRect(0, 0, 4, 1);
    context.drawImage(image, 0, 0);
    expect([...context.getImageData(0, 0, 4, 1).data]).toEqual(index === 0 ?
      [...clear, ...red, ...red, ...blue] : [...blue, ...clear, ...red, ...blue]);
  }
});

test("表情 GIF 大色板复用、字典扩容与重置仍产生完整图像，超限和撤销立即拒绝", async () => {
  const width = 180, height = 100;
  let seed = 123;
  const rgba = new Uint8Array(width * height * 4);
  for (let index = 0; index < rgba.length; index += 4) {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    rgba[index] = seed >>> 24;
    rgba[index + 1] = seed >>> 16;
    rgba[index + 2] = seed >>> 8;
    rgba[index + 3] = 255;
  }
  const bytes = encodeMemeGif(width, height, [{ rgba, delayMs: 100 }, { rgba, delayMs: 100 }], signal);
  const result = await readMemeImageSequence(new File([new Uint8Array(bytes)], "color.gif"), signal);
  expect(result.frames.map(({ width, height }) => [width, height])).toEqual([[180, 100], [180, 100]]);
  const canvas = new Canvas(width, height);
  const context = canvas.getContext("2d");
  context.drawImage(result.frames[1]!, 0, 0);
  const actual = context.getImageData(0, 0, width, height).data;
  const meanChange = rgba.reduce((sum, channel, index) => sum + Math.abs(channel - actual[index]!), 0) / rgba.length;
  expect(meanChange).toBeLessThan(14);
  expect(() => encodeMemeGif(4097, 1, [{ rgba, delayMs: 100 }], signal)).toThrow(RangeError);
  expect(() => encodeMemeGif(width, height, [{ rgba, delayMs: 100 }], AbortSignal.abort())).toThrow();
});
