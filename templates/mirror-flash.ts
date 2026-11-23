// Template layouts follow MemeCrafters/meme-generator v0.1.14.
// https://github.com/MemeCrafters/meme-generator/tree/f5ee44f6a3e134b9ac54032f97eab788d6454e3c/meme_generator/memes
import { renderExactPng, renderRgba } from "@lotus-yunzai/skia";
import { Canvas, ImageData, loadImage, type CanvasRenderingContext2D } from "skia-canvas";
import type { MemeTemplate } from "../builtin-template.ts";
import { readMemeFirstImage } from "./animated-input.ts";
import { assertMemeGifDimensions, encodeMemeGif } from "./gif.ts";
import { registerFont } from "./template-layout.ts";
import { transformPreviewInput } from "./transforms.ts";

const oneImage = { min_images: 1, max_images: 1, min_texts: 0, args_type: null } as const;
const mirrorSize = 500;
const coefficients = [0.01, 0.03, 0.05, 0.08, 0.12, 0.17, 0.23, 0.3, 0.4, 0.6];
const borders = [25, 52, 67, 83, 97, 108, 118, 128, 138, 148];

function croppedDistortion(source: Uint8Array, coefficient: number, border: number, signal: AbortSignal) {
  const size = mirrorSize - border * 2;
  const pixels = new Uint8ClampedArray(size * size * 4);
  const center = mirrorSize / 2;
  const focal = 100;
  // OpenCV's remap samples the source at 1/32-pixel precision with a constant zero border.
  for (let y = 0; y < size; y++) {
    signal.throwIfAborted();
    const dy = y + border - center;
    for (let x = 0; x < size; x++) {
      const dx = x + border - center;
      const scale = 1 + coefficient * (dx * dx + dy * dy) / (focal * focal);
      const sx = Math.round((center + dx * scale) * 32) / 32;
      const sy = Math.round((center + dy * scale) * 32) / 32;
      const left = Math.floor(sx), top = Math.floor(sy);
      const colWeight = sx - left, rowWeight = sy - top;
      const target = (y * size + x) * 4;
      for (let channel = 0; channel < 4; channel++) {
        let value = 0;
        for (let row = 0; row < 2; row++) for (let col = 0; col < 2; col++) {
          const inputX = left + col, inputY = top + row;
          if (inputX < 0 || inputX >= mirrorSize || inputY < 0 || inputY >= mirrorSize) continue;
          const weight = (row ? rowWeight : 1 - rowWeight) * (col ? colWeight : 1 - colWeight);
          value += source[(inputY * mirrorSize + inputX) * 4 + channel]! * weight;
        }
        pixels[target + channel] = Math.round(value);
      }
    }
  }
  return new ImageData(pixels, size, size);
}

const funnyMirror: MemeTemplate = {
  info: { key: "funny_mirror", keywords: ["哈哈镜"], params_type: { ...oneImage, max_texts: 0 } },
  async render({ images }, { signal }) {
    const image = await readMemeFirstImage(images[0]!, signal);
    const crop = Math.min(image.width, image.height);
    const x = Math.floor((image.width - crop) / 2), y = Math.floor((image.height - crop) / 2);
    assertMemeGifDimensions(mirrorSize, mirrorSize, (coefficients.length + 1) * 2);
    const original = await renderRgba(mirrorSize, mirrorSize, draw => {
      draw.imageSmoothingQuality = "high";
      draw.drawImage(image, x, y, crop, crop, 0, 0, mirrorSize, mirrorSize);
    });
    const frames = [{ rgba: original.rgba, delayMs: 50 }];
    for (const [index, coefficient] of coefficients.entries()) {
      const distorted = croppedDistortion(original.rgba, coefficient, borders[index]!, signal);
      const cropCanvas = new Canvas(distorted.width, distorted.height);
      cropCanvas.getContext("2d").putImageData(distorted, 0, 0);
      const { rgba } = await renderRgba(mirrorSize, mirrorSize, draw => {
        draw.imageSmoothingQuality = "high";
        draw.drawCanvas(cropCanvas, 0, 0, mirrorSize, mirrorSize);
      });
      frames.push({ rgba, delayMs: 50 });
    }
    return encodeMemeGif(mirrorSize, mirrorSize, [...frames, ...frames.toReversed()], signal);
  },
  async preview(context) {
    return funnyMirror.render(await transformPreviewInput(context), context);
  },
};

const flashWidth = 500;
const captionHeight = 65;
const defaultFlashCaption = "闪瞎你们的狗眼";

function fitFlashCaption(text: string, font: string) {
  const measure = new Canvas(1, 1).getContext("2d");
  const lines = text.split(/\r?\n/u);
  for (let size = 50; size >= 20; size--) {
    const description = `${size}px ${font}`;
    measure.font = description;
    const lineHeight = size * 1.2;
    if (lineHeight * lines.length <= captionHeight && lines.every(line => measure.measureText(line).width <= flashWidth - 20)) {
      return { description, lines, lineHeight };
    }
  }
  throw new Error("文字过长，无法放进表情模板。");
}

function drawFlashCaption(draw: CanvasRenderingContext2D, caption: ReturnType<typeof fitFlashCaption>, y: number, inverted: boolean) {
  draw.fillStyle = inverted ? "#fff" : "#000";
  draw.fillRect(0, y, flashWidth, captionHeight);
  draw.fillStyle = inverted ? "#000" : "#fff";
  draw.textAlign = "center";
  draw.textBaseline = "middle";
  const { description, lines, lineHeight } = caption;
  draw.font = description;
  lines.forEach((line, index) => draw.fillText(line, flashWidth / 2, y + captionHeight / 2 + (index - (lines.length - 1) / 2) * lineHeight));
}

const flashBlind: MemeTemplate = {
  info: { key: "flash_blind", keywords: ["闪瞎"], params_type: { ...oneImage, max_texts: 1, default_texts: [defaultFlashCaption] } },
  async render({ images, texts }, context) {
    const { signal } = context;
    const image = await readMemeFirstImage(images[0]!, signal);
    const height = Math.floor(image.height * flashWidth / image.width);
    const zoomHeight = Math.floor(height * 0.9);
    assertMemeGifDimensions(flashWidth, height, 4);
    if (zoomHeight < 1) throw new RangeError("图片高度太小，无法生成表情。");
    const caption = texts[0] ? fitFlashCaption(texts[0], await registerFont(context)) : undefined;
    const normalized = await renderExactPng(flashWidth, height, draw => {
      draw.fillStyle = "#000";
      draw.fillRect(0, 0, flashWidth, height);
      draw.imageSmoothingQuality = "high";
      draw.drawImage(image, 0, 0, flashWidth, height);
    });
    const resized = await loadImage(normalized.png);
    const frames = [];
    for (const phase of ["original", "negative", "zoom"] as const) {
      signal.throwIfAborted();
      const { rgba } = await renderRgba(flashWidth, height, draw => {
        draw.imageSmoothingQuality = "high";
        if (phase === "zoom") {
          draw.drawImage(resized, 25, Math.floor((height - zoomHeight) / 2), 450, zoomHeight, 0, 0, flashWidth, height);
        } else {
          draw.drawImage(resized, 0, 0);
        }
        if (phase === "negative") {
          const pixels = draw.getImageData(0, 0, flashWidth, height);
          for (let i = 0; i < pixels.data.length; i++) if (i % 4 !== 3) pixels.data[i] = 255 - pixels.data[i]!;
          draw.putImageData(pixels, 0, 0);
        }
        if (caption) drawFlashCaption(draw, caption, height - captionHeight, phase === "negative");
      });
      frames.push({ rgba, delayMs: 30 });
    }
    return encodeMemeGif(flashWidth, height, [...frames, frames[1]!], signal);
  },
  async preview(context) {
    const input = await transformPreviewInput(context);
    return flashBlind.render({ ...input, texts: [defaultFlashCaption] }, context);
  },
};

export const mirrorFlashMemeTemplates = [funnyMirror, flashBlind] as const;
