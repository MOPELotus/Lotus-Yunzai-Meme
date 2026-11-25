import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("meme", messageCatalog.messages);
import { loadImage, type Image } from "skia-canvas";
import { renderRgba } from "../../../packages/skia/index.ts";
import { encodeBandedPng } from "../../../packages/skia/banded-png.ts";
import type { MemeTemplate, MemeTemplateContext, MemeTemplateInput } from "../builtin-template.ts";
import { alignMemeLoop, readMemeImageSequence, type MemeImageSequence } from "./animated-input.ts";
import { renderPythonGif } from "./python-gif.ts";
import { readStraightPng } from "./straight-png.ts";
import { previewImage } from "./template-layout.ts";

type Mode = "chess" | "color" | "gray" | "separate";
type Pair = readonly [Image, Image?];
type Dimensions = readonly [width: number, height: number];

const scenes = [
  { key: "miragetank", keywords: ["幻影坦克"], mode: "chess" },
  { key: "miragetank_color", keywords: ["彩色幻影坦克", "彩幻"], mode: "color" },
  { key: "miragetank_gray", keywords: ["灰色幻影坦克", "灰幻"], mode: "gray" },
  { key: "miragetank_separate", keywords: ["幻影分离", "坦克分离"], mode: "separate" },
] as const;

const byte = (value: number) => Math.min(255, Math.max(0, Math.trunc(value)));
const luma = (pixels: Uint8Array, offset: number) =>
  (19_595 * pixels[offset]! + 38_470 * pixels[offset + 1]! + 7_471 * pixels[offset + 2]! + 32_768) >> 16;

function brightness(text: string | undefined) {
  const value = text?.trim() ?? "";
  if (/^[+]?inf(?:inity)?$/iu.test(value)) return 6;
  if (/^-inf(?:inity)?$/iu.test(value)) return 0.1;
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/iu.test(value)) return 2;
  return Math.min(6, Math.max(0.1, Number(value)));
}

function timeline(sequences: readonly MemeImageSequence[]) {
  const [cover, base] = sequences;
  if (!cover) throw new Error($t("templates.mirage-tank.text_78a2eee503"));
  if (!base || base.frames.length === 1) return cover.frames.map(image => ({ value: [image, base?.frames[0]] as Pair,
    delayMs: Math.floor(cover.averageDelayMs / 10) * 10 }));
  if (cover.frames.length === 1) return base.frames.map(image => ({ value: [cover.frames[0], image] as Pair,
    delayMs: Math.floor(base.averageDelayMs / 10) * 10 }));

  const coverIsFaster = cover.averageDelayMs <= base.averageDelayMs;
  const fast = coverIsFaster ? cover : base;
  const slow = coverIsFaster ? base : cover;
  return alignMemeLoop(slow, fast.frames.length, fast.averageDelayMs).map(({ overlay, image }) => ({
    value: (coverIsFaster ? [fast.frames[overlay], image] : [image, fast.frames[overlay]]) as Pair,
    delayMs: Math.floor(fast.averageDelayMs / 10) * 10,
  }));
}

async function raster(image: Image, width: number, height: number, fit = false) {
  const ratio = fit ? Math.min(width / image.width, height / image.height) : 1;
  const scaledWidth = fit ? Math.max(1, Math.trunc(image.width * ratio)) : width;
  const scaledHeight = fit ? Math.max(1, Math.trunc(image.height * ratio)) : height;
  const left = Math.floor((width - scaledWidth) / 2);
  const top = Math.floor((height - scaledHeight) / 2);
  return (await renderRgba(width, height, draw => {
    draw.imageSmoothingQuality = "high";
    draw.drawImage(image, left, top, scaledWidth, scaledHeight);
  })).rgba;
}

async function grayRaster(image: Image, source: Buffer, width: number, height: number) {
  const gray = Buffer.allocUnsafe(source.length);
  for (let pixel = 0; pixel < source.length; pixel += 4) {
    gray[pixel] = gray[pixel + 1] = gray[pixel + 2] = luma(source, pixel);
    gray[pixel + 3] = 255;
  }
  const grayPng = await encodeBandedPng(image.width, image.height, (async function* () { yield gray; })());
  return raster(await loadImage(grayPng), width, height, true);
}

function checker(cover: Uint8Array, base: Uint8Array, width: number, height: number, signal: AbortSignal) {
  const output = Buffer.allocUnsafe(width * height * 4);
  for (let row = 0, offset = 0; row < height; row++) {
    signal.throwIfAborted();
    for (let column = 0; column < width; column++, offset += 4) {
      const top = (row + column) % 2 === 0;
      output[offset] = output[offset + 1] = output[offset + 2] = top ? 255 : 0;
      output[offset + 3] = 255 - luma(top ? cover : base, offset);
    }
  }
  return output;
}

function gray(cover: Uint8Array, base: Uint8Array, width: number, height: number, signal: AbortSignal) {
  const output = Buffer.allocUnsafe(width * height * 4);
  for (let row = 0, offset = 0; row < height; row++) {
    signal.throwIfAborted();
    for (let column = 0; column < width; column++, offset += 4) {
      const paper = luma(cover, offset) * 0.5 + 128;
      const ink = luma(base, offset) * 0.5;
      const density = 1 - paper / 255 + ink / 255;
      output[offset] = output[offset + 1] = output[offset + 2] = byte(Math.abs(density) > 1e-6 ? ink / density : 255);
      output[offset + 3] = byte(density * 255);
    }
  }
  return output;
}

function color(cover: Uint8Array, base: Uint8Array, width: number, height: number, signal: AbortSignal) {
  const output = Buffer.allocUnsafe(width * height * 4);
  for (let row = 0, offset = 0; row < height; row++) {
    signal.throwIfAborted();
    for (let column = 0; column < width; column++, offset += 4) {
      const mask = base[offset + 3]! / 255;
      // The old centered RGBA layer pastes through its own alpha before dimming.
      const r = Math.floor(Math.round(base[offset]! * mask) * 0.18) / 255;
      const g = Math.floor(Math.round(base[offset + 1]! * mask) * 0.18) / 255;
      const b = Math.floor(Math.round(base[offset + 2]! * mask) * 0.18) / 255;
      const wr = cover[offset]! / 255, wg = cover[offset + 1]! / 255, wb = cover[offset + 2]! / 255;
      const upperGray = 0.334 * wr + 0.333 * wg + 0.333 * wb;
      const lowerGray = 0.334 * r + 0.333 * g + 0.333 * b;
      const lowerR = r * 0.7 + lowerGray * (1 - 0.7);
      const lowerG = g * 0.7 + lowerGray * (1 - 0.7);
      const lowerB = b * 0.7 + lowerGray * (1 - 0.7);
      const density = 0.222 * (1 - (wr * 0.5 + upperGray * 0.5) + lowerR)
        + 0.707 * (1 - (wg * 0.5 + upperGray * 0.5) + lowerG)
        + 0.071 * (1 - (wb * 0.5 + upperGray * 0.5) + lowerB);
      output[offset] = byte(Math.abs(density) > 1e-6 ? lowerR / density * 255 : 255);
      output[offset + 1] = byte(Math.abs(density) > 1e-6 ? lowerG / density * 255 : 255);
      output[offset + 2] = byte(Math.abs(density) > 1e-6 ? lowerB / density * 255 : 255);
      output[offset + 3] = byte(density * 255);
    }
  }
  return output;
}

function separate(tank: Uint8Array, width: number, height: number, half: number, factor: number, signal: AbortSignal) {
  const output = Buffer.alloc(width * height * 4, 255);
  for (let row = 0; row < height; row++) {
    signal.throwIfAborted();
    for (let x = 0; x < half; x++) {
      const offset = (row * half + x) * 4;
      const left = (row * width + x) * 4;
      const right = left + half * 4;
      const alpha = tank[offset + 3]! / 255;
      for (let channel = 0; channel < 3; channel++) {
        const ink = tank[offset + channel]! * alpha;
        output[left + channel] = Math.round(ink + 255 * (1 - alpha));
        output[right + channel] = byte(Math.round(ink) * factor);
      }
    }
  }
  return output;
}

async function pixels(mode: Mode, [cover, base]: Pair, [width, height]: Dimensions, factor: number,
  original: ReadonlyMap<Image, Buffer>, signal: AbortSignal,
) {
  signal.throwIfAborted();
  if (mode === "separate") {
    const half = Math.max(1, Math.floor(width / 2));
    return separate(await raster(cover, half, height), width, height, half, factor, signal);
  }
  if (!base) throw new Error($t("templates.mirage-tank.text_f9ddbf155e"));
  function raw(image: Image) {
    return image.width === width && image.height === height ? original.get(image) : undefined;
  }
  const [top, bottom] = await Promise.all([
    raw(cover) ?? raster(cover, width, height),
    raw(base) ?? (mode === "gray" && original.has(base)
      ? grayRaster(base, original.get(base)!, width, height)
      : raster(base, width, height, mode !== "chess")),
  ]);
  if (mode === "chess") return checker(top, bottom, width, height, signal);
  if (mode === "gray") return gray(top, bottom, width, height, signal);
  return color(top, bottom, width, height, signal);
}

function template({ key, keywords, mode }: typeof scenes[number]): MemeTemplate {
  const separateViews = mode === "separate";
  const imageCount = separateViews ? 1 : 2;
  async function render(input: MemeTemplateInput, { signal }: MemeTemplateContext) {
    if (input.images.length !== imageCount || input.texts.length > Number(separateViews)) {
      throw new Error($t("templates.mirage-tank.text_4ee0590e10"));
    }
    const sequences = await Promise.all(input.images.map(file => readMemeImageSequence(file, signal)));
    const frames = timeline(sequences);
    const cover = frames[0]!.value[0];
    const width = cover.width * (separateViews ? 2 : 1), height = cover.height;
    const factor = brightness(input.texts[0]);
    const original = new Map<Image, Buffer>();
    if (!separateViews) await Promise.all(sequences.map(async ({ frames }, index) => {
      if (frames.length !== 1) return;
      const image = frames[0];
      const file = input.images[index]!;
      const bytes = Buffer.from(await file.arrayBuffer());
      signal.throwIfAborted();
      const rgba = readStraightPng(bytes, image.width, image.height);
      if (rgba) original.set(image, rgba);
    }));

    if (frames.length === 1) {
      const rgba = await pixels(mode, frames[0]!.value, [width, height], factor, original, signal);
      return encodeBandedPng(width, height, (async function* () { yield rgba; })());
    }
    return renderPythonGif({ width, height, frames, signal,
      async renderFrame(pair, w, h) {
        const rgba = await pixels(mode, pair, [w, h], factor, original, signal);
        // Pillow reserves GIF palette transparency only for pixels with zero alpha.
        for (let alpha = 3; alpha < rgba.length; alpha += 4) {
          if (rgba[alpha]) rgba[alpha] = 255;
        }
        return rgba;
      },
    });
  }
  return {
    info: { key, keywords, params_type: { min_images: imageCount, max_images: imageCount,
      min_texts: 0, max_texts: Number(separateViews), args_type: null } },
    render,
    async preview(context) {
      const preview = await previewImage(context.signal);
      return render({ images: Array<File>(imageCount).fill(preview), texts: [], args: {} }, context);
    },
  };
}

export const mirageTankTemplates = scenes.map(template);
