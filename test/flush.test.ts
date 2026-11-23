import { expect, test } from "bun:test";
import { Canvas } from "skia-canvas";
import { flushAssets } from "../backend-flush-assets.ts";
import { readMemeImageSequence } from "../templates/animated-input.ts";
import { flush } from "../templates/flush.ts";
import { encodeMemeGif } from "../templates/gif.ts";

test("红温按原版变红、缩放和图层顺序保留 30 帧，输入动图只占原时长", async () => {
  const signal = new AbortController().signal;
  const width = 40;
  const height = 30;
  const blue = Uint8Array.from({ length: width * height * 4 }, (_, index) => index % 4 >= 2 ? 255 : 0);
  const green = Uint8Array.from(blue, (_, index) => index % 4 === 0 || index % 4 === 2 ? 0 : 255);
  const red = Uint8Array.from(blue, (_, index) => index % 4 === 0 || index % 4 === 3 ? 255 : 0);
  const source = encodeMemeGif(width, height, [
    { rgba: blue, delayMs: 80 }, { rgba: green, delayMs: 120 }, { rgba: red, delayMs: 160 },
  ], signal);
  const requested: string[] = [];
  const context = {
    signal,
    async imageAsset(path: string) {
      const index = requested.push(path) - 1;
      const canvas = new Canvas(5, 5);
      const draw = canvas.getContext("2d");
      draw.fillStyle = `rgb(${120 + index}, 30, 20)`;
      draw.fillRect(0, 0, 5, 5);
      return canvas.png;
    },
    async fontAsset() { throw new Error("旧模板无需字体。"); },
  };
  const bytes = await flush.render({
    images: [new File([new Uint8Array(source)], "avatar.gif")], texts: [], args: {},
  }, context);
  const still = new Canvas(40, 30);
  const staticResult = await flush.render({
    images: [new File([new Uint8Array(await still.png)], "avatar.png")], texts: [], args: {},
  }, context);
  expect(Buffer.from(staticResult.subarray(0, 6)).toString()).toBe("GIF89a");
  const artPaths = flushAssets.map(([, { path }]) => `python/${path}`);
  expect(requested).toEqual([...artPaths, ...artPaths]);
  const result = await readMemeImageSequence(new File([new Uint8Array(bytes)], "红温.gif"), signal);
  expect([result.frames[0].width, result.frames[0].height, result.frames.length, result.averageDelayMs])
    .toEqual([30, 30, 30, 80]);
  const draw = new Canvas(30, 30).getContext("2d");
  function center(index: number) {
    draw.clearRect(0, 0, 30, 30);
    draw.drawImage(result.frames[index]!, 0, 0);
    return [...draw.getImageData(15, 15, 1, 1).data];
  }
  expect(center(0)).toEqual([0, 0, 255, 255]);
  expect(center(2)[1]).toBeGreaterThan(220);
  expect(center(15)[2]).toBeGreaterThan(130);
  expect(center(16)[1]).toBeGreaterThan(120);
  expect(center(17)[0]).toBeGreaterThan(125);
  expect(center(18)).toEqual([120, 30, 20, 255]);
  expect(center(29)).toEqual([131, 30, 20, 255]);
});
