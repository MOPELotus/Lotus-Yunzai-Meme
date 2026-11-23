import { expect, test } from "bun:test";
import { renderExactPng, renderRgba } from "@lotus-yunzai/skia";
import type { MemeTemplateContext } from "../builtin-template.ts";
import { readMemeImageSequence } from "../templates/animated-input.ts";
import { encodeMemeGif } from "../templates/gif.ts";
import { legacySceneMemeTemplates } from "../templates/legacy-scene.ts";

const signal = new AbortController().signal;

function template(key: string) {
  const match = legacySceneMemeTemplates.find(({ info }) => info.key === key);
  if (!match) throw new Error(`fixture template unavailable: ${key}`);
  return match;
}

function assets(files: Record<string, Buffer>): MemeTemplateContext {
  return {
    signal,
    async imageAsset(path) {
      if (!files[path]) throw new Error(`missing fixture resource ${path}`);
      return files[path];
    },
    async fontAsset() { throw new Error("fixture does not need fonts"); },
  };
}

async function pixels(bytes: Uint8Array, type: "image/gif" | "image/jpeg") {
  const sequence = await readMemeImageSequence(new File([new Uint8Array(bytes)], "result", { type }), signal);
  const rendered = [];
  for (const frame of sequence.frames) {
    const { rgba } = await renderRgba(frame.width, frame.height, draw => draw.drawImage(frame, 0, 0));
    rendered.push({
      width: frame.width, height: frame.height,
      pixel(x: number, y: number) {
        const offset = 4 * (y * frame.width + x);
        return [...rgba.subarray(offset, offset + 4)];
      },
    });
  }
  return { frames: rendered, delay: sequence.averageDelayMs };
}

test("小画家保留原来朝上裁剪、画框前景和静态 JPG", async () => {
  const input = await renderExactPng(24, 48, draw => {
    draw.fillStyle = "#0000ff";
    draw.fillRect(0, 0, 24, 24);
    draw.fillStyle = "#00ff00";
    draw.fillRect(0, 24, 24, 24);
  });
  const artwork = await renderExactPng(637, 635, draw => {
    draw.fillStyle = "#ff0000";
    draw.fillRect(125, 91, 20, 20);
  });
  const result = await template("painter").render({
    images: [new File([new Uint8Array(input.png)], "input.png")], texts: [], args: {},
  }, assets({ "painter/0.png": artwork.png }));
  expect([...result.subarray(0, 2)]).toEqual([255, 216]);
  const { frames: [frame] } = await pixels(result, "image/jpeg");
  expect([frame!.width, frame!.height]).toEqual([637, 635]);
  expect(frame!.pixel(135, 100)[0]).toBeGreaterThan(200);
  expect(frame!.pixel(235, 291)[2]).toBeGreaterThan(200);
  expect(frame!.pixel(235, 341)[1]).toBeGreaterThan(200);
  expect(frame!.pixel(40, 180)).toEqual([255, 255, 255, 255]);
});

test("添乱保留动图节奏，横幅的透明区域覆盖头像", async () => {
  const common = assets({ "add_chaos/0.png": (await renderExactPng(240, 80, draw => {
    draw.fillStyle = "#ff0000";
    draw.fillRect(0, 0, 60, 80);
  })).png });
  const frames = [];
  for (const fill of ["#00ff00", "#0000ff"]) {
    const { rgba } = await renderRgba(12, 12, draw => {
      draw.fillStyle = fill;
      draw.fillRect(0, 0, 12, 12);
    });
    frames.push({ rgba, delayMs: 70 });
  }
  const animated = new File([new Uint8Array(encodeMemeGif(12, 12, frames, signal))], "input.gif", { type: "image/gif" });
  const result = await template("add_chaos").render({ images: [animated], texts: [], args: {} }, common);
  const rendered = await pixels(result, "image/gif");
  expect(rendered.frames.map(({ width, height }) => [width, height])).toEqual([[240, 240], [240, 240]]);
  expect(rendered.delay).toBe(70);
  expect(rendered.frames[0]!.pixel(40, 30)).toEqual([255, 0, 0, 255]);
  expect(rendered.frames[0]!.pixel(140, 30)).toEqual([0, 0, 0, 0]);
  expect(rendered.frames[0]!.pixel(140, 160)).toEqual([0, 255, 0, 255]);
  expect(rendered.frames[1]!.pixel(140, 160)).toEqual([0, 0, 255, 255]);
});
