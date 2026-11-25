import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("meme", messageCatalog.messages);
// Original motion and artwork from MemeCrafters/meme-generator at 619fa105.
import { ImageData, loadImage, type Image } from "skia-canvas";
import { renderExactPng, renderRgba } from "../../../packages/skia/index.ts";
import type { MemeTemplate, MemeTemplateContext, MemeTemplateInput } from "../builtin-template.ts";
import { readMemeImageSequence, type MemeImageSequence } from "./animated-input.ts";
import { pasteMask } from "./masked-layout.ts";
import { renderPythonGif } from "./python-gif.ts";
import { previewImage, rgbaFrameDimensions } from "./template-layout.ts";

const flickSize = 240;
const flickResource = "python/meme_generator/memes/flick/images";
type Effect = "flick" | "fade_away";
type Size = readonly [width: number, height: number];

function pythonRound(value: number) {
  const lower = Math.floor(value);
  return value - lower === 0.5 ? lower + Math.abs(lower % 2) : Math.round(value);
}

function fadeSize({ width, height }: Image): Size {
  const area = width * height;
  if (area < 40_000) return [width, height];
  const side = Math.sqrt(area);
  return [Math.max(1, pythonRound(200 * width / side)), Math.max(1, Math.floor(200 * height / side))];
}

function prepareInput(image: Image, [width, height]: Size, square: boolean) {
  return renderRgba(width, height, draw => {
    draw.imageSmoothingQuality = "high";
    if (!square) {
      draw.drawImage(image, 0, 0, width, height);
      return;
    }
    const side = Math.min(image.width, image.height);
    draw.drawImage(image, Math.trunc((image.width - side) / 2), Math.trunc((image.height - side) / 2),
      side, side, 0, 0, width, height);
  }).then(({ rgba }) => rgba);
}

function flickDistortion(source: Buffer, frame: number) {
  const raster = Buffer.allocUnsafe(source.length);
  const half = flickSize / 2;
  const time = frame - 3;
  const motion = Math.sin(2 * Math.PI * time / 5) * Math.exp(-0.1 * time);
  const offset = Math.fround(half * motion);
  const angle = Math.fround(0.5 * motion);
  for (let y = 0; y < flickSize; y++) {
    const dy = y + 0.5 - half;
    const factor = 1 - (y + 0.5) / flickSize;
    const cosine = Math.cos(angle * factor), sine = Math.sin(angle * factor);
    for (let x = 0; x < flickSize; x++) {
      const dx = x + 0.5 - half;
      const sampleX = Math.max(0, Math.min(flickSize - 1, dx * cosine - dy * sine + half + factor * offset - 0.5));
      const sampleY = Math.max(0, Math.min(flickSize - 1, dx * sine + dy * cosine + half - 0.5));
      const left = Math.floor(sampleX), top = Math.floor(sampleY);
      const right = Math.min(left + 1, flickSize - 1), bottom = Math.min(top + 1, flickSize - 1);
      const fx = sampleX - left, fy = sampleY - top;
      const tl = (top * flickSize + left) * 4, tr = (top * flickSize + right) * 4;
      const bl = (bottom * flickSize + left) * 4, br = (bottom * flickSize + right) * 4;
      const wtl = (1 - fx) * (1 - fy) * source[tl + 3]!, wtr = fx * (1 - fy) * source[tr + 3]!;
      const wbl = (1 - fx) * fy * source[bl + 3]!, wbr = fx * fy * source[br + 3]!;
      const alpha = wtl + wtr + wbl + wbr;
      const target = (y * flickSize + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        raster[target + channel] = alpha ? Math.round((source[tl + channel]! * wtl + source[tr + channel]! * wtr +
          source[bl + channel]! * wbl + source[br + channel]! * wbr) / alpha) : 0;
      }
      raster[target + 3] = Math.round(alpha);
    }
  }
  return raster;
}

async function readHands(context: MemeTemplateContext) {
  return Promise.all(Array.from({ length: 10 }, async (_, index) => {
    const asset = await context.imageAsset(`${flickResource}/${index}.png`);
    const image = await loadImage(asset);
    return prepareInput(image, [flickSize, flickSize], false);
  }));
}

function flickFrame(source: Buffer, frame: number, hands: readonly Buffer[]) {
  if (frame < 3) return source;
  const raster = frame < 12 ? Buffer.from(source) : flickDistortion(source, frame);
  if (frame <= 12) pasteMask(raster, hands[frame - 3]!);
  return raster;
}

interface Dust {
  x: number;
  y: number;
  vx: number;
  vy: number;
  readonly dx: number;
  readonly dy: number;
  radius: number;
}

// Pillow's filled ellipses are inclusive at their integer end coordinates.
const dustRows = [[], [0, 1, 0], [1, 2, 2, 2, 1], [1, 2, 3, 3, 3, 2, 1]];

function addDust(raster: Buffer, [width, height]: Size, dots: Dust[], step: number) {
  let retained = 0;
  for (const dot of dots) {
    const acceleration = 0.02 * step / dot.radius;
    dot.vx += acceleration * dot.dx;
    dot.vy += acceleration * dot.dy;
    dot.x += pythonRound(dot.vx);
    dot.y += pythonRound(dot.vy);
    if (Math.random() < 0.25) dot.radius--;
    const r = dot.radius;
    if (r <= 0 || dot.x + r < 0 || dot.x - r > width || dot.y + r < 0 || dot.y - r > height) continue;
    dots[retained++] = dot;
    for (let y = Math.max(0, dot.y - r); y <= Math.min(height - 1, dot.y + r); y++) {
      const extent = dustRows[r]![y - dot.y + r]!;
      for (let x = Math.max(0, dot.x - extent); x <= Math.min(width - 1, dot.x + extent); x++) {
        const pixel = (y * width + x) * 4;
        raster.writeUInt32BE(255, pixel);
      }
    }
  }
  dots.length = retained;
}

function fadeRenderer(size: Size) {
  const [width, height] = size;
  const originX = Math.floor(width * 2 / 3), originY = Math.floor(height * 3 / 2);
  const step = Math.hypot(originX, originY) / 24;
  const dust: Dust[] = [];
  return (source: Buffer, frame: number) => {
    if (frame <= 9) return source;
    const raster = frame < 28 ? Buffer.from(source) : Buffer.alloc(source.length);
    if (frame < 28) {
      const firstRow = Math.max(0, height - pythonRound(step * (frame + 11)));
      for (let x = 0; x < width; x++) {
        for (let y = firstRow; y < height; y++) {
          const pixel = (y * width + x) * 4;
          if (!source[pixel + 3]) continue;
          const distance = Math.hypot(x - originX, y - originY);
          if (distance <= step * (frame - 5)) {
            raster.writeUInt32BE(0, pixel);
          } else if (distance <= step * (frame - 4)) {
            raster.writeUInt32BE(255, pixel);
            if (Math.random() <= 0.06) dust.push({ x, y, vx: 0, vy: 0, dx: (x - originX) / distance,
              dy: (y - originY * 1.5) / distance, radius: 1 + Math.floor(3 * Math.random()) });
          } else if (distance <= step * (frame + 2)) {
            const factor = Math.min(1, Math.max(0, (distance - step * (frame - 11)) / (step * 12))) *
              (0.9 + 0.2 * Math.random());
            const gray = pythonRound((source[pixel]! + source[pixel + 1]! + source[pixel + 2]!) * factor / 3);
            raster.fill(gray, pixel, pixel + 3);
          }
        }
      }
    }
    addDust(raster, size, dust, step);
    return raster;
  };
}

function inputTimeline({ frames, averageDelayMs }: MemeImageSequence, count: number, step: number) {
  if (frames.length === 1) return Array<Image>(count).fill(frames[0]);
  // The Python no-extend path advances on the original seconds-based bounds.
  const duration = averageDelayMs / 1000;
  const interval = step / 1000;
  let frame = 0, start = 0;
  return Array.from({ length: count }, (_, tick) => {
    const time = tick * interval;
    while ((frame + 1) * duration <= time - start) {
      frame++;
      if (frame === frames.length) {
        frame = 0;
        start += frames.length * duration;
      }
    }
    return frames[frame]!;
  });
}

// Pillow saves the alpha-zero palette color as transparent and keeps partial-alpha colors visible.
function pillowGifAlpha(rgba: Buffer) {
  let opaque: Buffer | undefined;
  for (let alpha = 3; alpha < rgba.length; alpha += 4) {
    if (!rgba[alpha] || rgba[alpha] === 255) continue;
    opaque ??= Buffer.from(rgba);
    opaque[alpha] = 255;
  }
  return opaque ?? rgba;
}

async function resizeFrame(frame: Buffer, [width, height]: Size, outWidth: number, outHeight: number) {
  if (width === outWidth && height === outHeight) return frame;
  const pixels = new ImageData(new Uint8ClampedArray(frame), width, height);
  const { png } = await renderExactPng(width, height, draw => draw.putImageData(pixels, 0, 0));
  const image = await loadImage(png);
  const resized = await renderRgba(outWidth, outHeight, draw => draw.drawImage(image, 0, 0, outWidth, outHeight));
  return pillowGifAlpha(resized.rgba);
}

function pixelEffect(key: Effect, keywords: readonly string[]): MemeTemplate {
  const flick = key === "flick";
  async function render({ images, texts }: MemeTemplateInput, context: MemeTemplateContext) {
    if (images.length !== 1 || texts.length !== 0) throw new Error($t("templates.legacy-pixel-effects.text_2646e324ad"));
    const { signal } = context;
    const [input, hands] = await Promise.all([readMemeImageSequence(images[0]!, signal),
      flick ? readHands(context) : []]);
    const size: Size = flick ? [flickSize, flickSize] : fadeSize(input.frames[0]);
    const count = flick ? 30 : 35, delay = flick ? 50 : 80;
    const drawFade = fadeRenderer(size);
    const prepared = new WeakMap<Image, Promise<Buffer>>();
    const frames: { value: Buffer; delayMs: number }[] = [];
    for (const [frame, image] of inputTimeline(input, count, delay).entries()) {
      signal.throwIfAborted();
      let source = prepared.get(image);
      if (!source) {
        source = prepareInput(image, size, flick);
        prepared.set(image, source);
      }
      const rgba = await source;
      const value = pillowGifAlpha(flick ? flickFrame(rgba, frame, hands) : drawFade(rgba, frame));
      const previous = frames.at(-1);
      if (previous?.value.equals(value)) previous.delayMs += delay;
      else frames.push({ value, delayMs: delay });
    }
    const { width, height } = rgbaFrameDimensions(...size);
    return renderPythonGif({ width, height, frames, signal, renderFrame: (value, w, h) => resizeFrame(value, size, w, h) });
  }
  return {
    info: { key, keywords, params_type: { min_images: 1, max_images: 1, min_texts: 0,
      max_texts: 0, default_texts: [], args_type: null } },
    render,
    async preview(context) {
      return render({ images: [await previewImage(context.signal)], texts: [], args: {} }, context);
    },
  };
}

export const legacyPixelEffectTemplates = [pixelEffect("fade_away", ["灰飞烟灭"]), pixelEffect("flick", ["弹", "脑瓜崩"])];
