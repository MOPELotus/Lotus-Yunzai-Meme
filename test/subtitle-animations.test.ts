import { expect, test } from "bun:test";
import { Canvas, type Image } from "skia-canvas";
import { createBundledMemeResources } from "../backend-builtin-assets.ts";
import { readMemeImageSequence } from "../templates/animated-input.ts";
import { assertMemeGifStreamDimensions, encodeMemeGif, MemeGifDimensionLimitError } from "../templates/gif.ts";
import { scrollingDialogueMemeTemplates } from "../templates/scrolling-dialogue.ts";
import { subtitleMemeTemplates } from "../templates/subtitle-animations.ts";

const signal = new AbortController().signal;
const assets = createBundledMemeResources(signal);

function bottomContainsWhite(frame: Image) {
  const canvas = new Canvas(frame.width, frame.height);
  const draw = canvas.getContext("2d");
  draw.drawImage(frame, 0, 0);
  const pixels = draw.getImageData(0, frame.height - 30, frame.width, 30).data;
  return pixels.some((current, index) => index % 4 === 0 && current > 220 && pixels[index + 1]! > 220 && pixels[index + 2]! > 220);
}

test("王境泽保留原字幕切换的空白帧和最后源帧的均匀时长", async () => {
  const width = 295, height = 184;
  const rgba = Uint8Array.from({ length: width * height * 4 }, (_, i) => i % 4 === 3 ? 255 : 16);
  const input = encodeMemeGif(width, height, Array.from({ length: 52 }, () => ({ rgba, delayMs: 120 })), signal);
  const template = subtitleMemeTemplates.find(item => item.info.key === "wangjingze")!;
  const output = await template.render({ images: [], texts: ["第一句", "第二句", "第三句", "第四句"], args: {} }, {
    signal, fontAsset: assets.fontAsset, async imageAsset(key) {
      expect(key).toBe("gif_subtitle/wangjingze.gif");
      return Buffer.from(input);
    },
  });
  const { frames, averageDelayMs } = await readMemeImageSequence(new File([new Uint8Array(output)], "result.gif"), signal);
  expect([frames.length, averageDelayMs]).toEqual([52, 130]);
  expect(bottomContainsWhite(frames[0])).toBe(true);
  expect(bottomContainsWhite(frames[10]!)).toBe(false);
  expect(bottomContainsWhite(frames[12]!)).toBe(true);
  expect(bottomContainsWhite(frames[48]!)).toBe(false);
});

test("复读原 1079×1192 的 50 帧符合 64 Mi 像素流式预算，并保留精确上限", () => {
  expect(() => assertMemeGifStreamDimensions(1079, 1192, 50)).not.toThrow();
  expect(() => assertMemeGifStreamDimensions(1024, 1024, 64)).not.toThrow();
  expect(() => assertMemeGifStreamDimensions(1024, 1024, 65)).toThrow(MemeGifDimensionLimitError);
});

test("滚屏末帧仍铺满四个对话框，超过原段落高度时拒绝", async () => {
  const template = scrollingDialogueMemeTemplates.find(item => item.info.key === "scroll")!;
  const corner = await new Canvas(70, 75).png;
  const paths: string[] = [];
  const render = (text: string) => template.render({ images: [], texts: [text], args: {} }, {
    signal, fontAsset: assets.fontAsset, async imageAsset(path) { paths.push(path); return corner; },
  });
  const output = await render("第一行\n第二行");
  expect(paths).toEqual(["scroll/corner1.png", "scroll/corner2.png", "scroll/corner3.png", "scroll/corner4.png"]);
  const { frames, averageDelayMs } = await readMemeImageSequence(new File([new Uint8Array(output)], "scroll.gif"), signal);
  expect([frames.length, averageDelayMs]).toEqual([30, 50]);
  const last = frames.at(-1)!;
  const canvas = new Canvas(last.width, last.height);
  const draw = canvas.getContext("2d");
  draw.drawImage(last, 0, 0);
  expect(draw.getImageData(0, last.height - 1, 1, 1).data[3]).toBe(255);
  await expect(render("太多行\n".repeat(10))).rejects.toThrow("文字过长");
});
