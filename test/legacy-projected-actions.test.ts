import { expect, test } from "bun:test";
import { Canvas, type Image } from "skia-canvas";
import { readMemeImageSequence } from "../templates/animated-input.ts";
import { legacyProjectedActionTemplates } from "../templates/legacy-projected-actions.ts";

const signal = new AbortController().signal;

function pixel(image: Image, x: number, y: number) {
  const canvas = new Canvas(image.width, image.height);
  const draw = canvas.getContext("2d");
  draw.drawImage(image, 0, 0);
  return [...draw.getImageData(x, y, 1, 1).data];
}

async function render(key: string, width: number, height: number) {
  const source = new Canvas(150, 100);
  const draw = source.getContext("2d");
  draw.fillStyle = "#dc180c";
  draw.fillRect(0, 0, 75, 100);
  draw.fillStyle = "#1c20d4";
  draw.fillRect(75, 0, 75, 100);
  const blank = await new Canvas(width, height).png;
  const template = legacyProjectedActionTemplates.find(item => item.info.key === key)!;
  const paths: string[] = [];
  const gif = await template.render({ images: [new File([new Uint8Array(await source.png)], "source.png")], texts: [], args: {} }, {
    signal,
    async imageAsset(path) { paths.push(path); return blank; },
    async fontAsset() { throw new Error("旧模板无文字"); },
  });
  return { gif: await readMemeImageSequence(new File([new Uint8Array(gif)], "result.gif"), signal), paths };
}

test("咖波画从六张旧底图展开 22 帧，第一轮底图没有头像", async () => {
  const { gif, paths } = await render("capoo_draw", 320, 280);
  expect([gif.frames.length, gif.averageDelayMs]).toEqual([22, 100]);
  expect(paths).toEqual(Array.from({ length: 6 }, (_, index) => `capoo_draw/${index}.png`));
  expect(pixel(gif.frames[9]!, 100, 70)[3]).toBe(0);
  expect(pixel(gif.frames[10]!, 100, 70)[3]).toBe(255);
});

test("咖波撕按原位置把头像左右半幅分开贴入最后两帧", async () => {
  const { gif, paths } = await render("capoo_rip", 366, 284);
  expect([gif.frames.length, gif.averageDelayMs, paths.length]).toEqual([15, 100, 8]);
  const last = gif.frames.at(-1)!;
  expect(pixel(last, 128, 205)).toEqual([220, 24, 12, 255]);
  expect(pixel(last, 230, 204)).toEqual([28, 32, 212, 255]);
});
