import { Canvas, loadImage, type CanvasRenderingContext2D, type Image } from "skia-canvas";
import type { MemeTemplate, MemeTemplateContext } from "../builtin-template.ts";
import { readMemeImageSequence } from "./animated-input.ts";
import { encodeMemeGif } from "./gif.ts";

// Layouts and timing from meme-generator-rs v0.2.3, pat.rs and rub.rs.
const patFrames = [
  0, 1, 2, 3, 1, 2, 3, 0, 1, 2, 3, 0, 0, 1, 2, 3, 0, 0, 0, 0, 4, 5, 5, 5, 6, 7, 8, 9,
] as const;
const rubTarget = [
  [39, 91, 75, 75], [49, 101, 75, 75], [67, 98, 75, 75],
  [55, 86, 75, 75], [61, 109, 75, 75], [65, 101, 75, 75],
] as const;
const rubSource = [
  [102, 95, 70, 80], [108, 60, 50, 100], [97, 18, 65, 95],
  [65, 5, 75, 75, 20], [95, 57, 100, 55, 70], [109, 107, 65, 75],
] as const;

type Pose = readonly [left: number, top: number, width: number, height: number, rotation?: number];

function drawSquare(draw: CanvasRenderingContext2D, image: Image, left: number, top: number, width: number, height: number) {
  const size = Math.min(image.width, image.height);
  const x = Math.round((image.width - size) / 2);
  const y = Math.round((image.height - size) / 2);
  draw.drawImage(image, x, y, size, size, left, top, width, height);
}

function drawHead(draw: CanvasRenderingContext2D, image: Image, [left, top, width, height, rotation = 0]: Pose) {
  draw.save();
  try {
    if (rotation) {
      const radians = rotation * Math.PI / 180;
      const sine = Math.abs(Math.sin(radians)), cosine = Math.abs(Math.cos(radians));
      const boundsWidth = width * cosine + height * sine;
      const boundsHeight = width * sine + height * cosine;
      draw.beginPath();
      draw.rect(left, top, Math.trunc(boundsWidth), Math.trunc(boundsHeight));
      draw.clip();
      draw.translate(left + boundsWidth / 2, top + boundsHeight / 2);
      draw.rotate(radians);
      left = -width / 2;
      top = -height / 2;
    }
    draw.beginPath();
    draw.ellipse(left + width / 2, top + height / 2, width / 2, height / 2, 0, 0, 2 * Math.PI);
    draw.clip();
    drawSquare(draw, image, left, top, width, height);
  } finally {
    draw.restore();
  }
}

async function compose(context: MemeTemplateContext, key: "pat" | "rub", width: number, height: number,
  assetCount: number, order: readonly number[], delayMs: number,
  paint: (draw: CanvasRenderingContext2D, asset: Image, pose: number) => void) {
  const { signal } = context;
  signal.throwIfAborted();
  const assets = await Promise.all(Array.from({ length: assetCount }, async (_, i) => {
    const asset = await loadImage(await context.imageAsset(`${key}/${i}.png`));
    if (asset.width !== width || asset.height !== height) throw new Error("表情帧素材尺寸无效。");
    return asset;
  }));
  const canvas = new Canvas(width, height);
  const draw = canvas.getContext("2d");
  const frames = [];
  for (const [index, pose] of order.entries()) {
    signal.throwIfAborted();
    draw.clearRect(0, 0, width, height);
    paint(draw, assets[pose]!, pose);
    const rgba = await canvas.toBuffer("raw", { colorType: "rgba", premultiplied: false });
    // GIF stores centiseconds; round timestamps so the full 85 ms cadence stays in sync.
    const start = Math.round(index * delayMs / 10);
    const end = Math.round((index + 1) * delayMs / 10);
    frames.push({ rgba, delayMs: 10 * (end - start) });
  }
  return encodeMemeGif(width, height, frames, signal);
}

function patPicture(image: Image, context: MemeTemplateContext) {
  return compose(context, "pat", 235, 196, 10, patFrames, 85, (draw, overlay, pose) => {
    draw.fillStyle = "#fff";
    draw.fillRect(0, 0, 235, 196);
    if (pose === 2) drawSquare(draw, image, 8, 79, 112, 96);
    else drawSquare(draw, image, 11, 73, 106, 100);
    draw.drawImage(overlay, 0, 0);
  });
}

function rubPicture(first: Image, second: Image, context: MemeTemplateContext) {
  return compose(context, "rub", 240, 240, 6, [0, 1, 2, 3, 4, 5], 50, (draw, overlay, pose) => {
    draw.drawImage(overlay, 0, 0);
    drawHead(draw, second, rubTarget[pose]!);
    drawHead(draw, first, rubSource[pose]!);
  });
}

async function checkerboard(signal: AbortSignal) {
  signal.throwIfAborted();
  const canvas = new Canvas(500, 500);
  const draw = canvas.getContext("2d");
  draw.fillStyle = "#fff";
  draw.fillRect(0, 0, 500, 500);
  draw.fillStyle = "#ccc";
  for (let y = 0; y < 20; y++) {
    for (let x = y % 2; x < 20; x += 2) draw.fillRect(x * 25, y * 25, 25, 25);
  }
  return loadImage(await canvas.png);
}

export const pat: MemeTemplate = {
  info: {
    key: "pat", keywords: ["拍"],
    params_type: { min_images: 1, max_images: 1, min_texts: 0, max_texts: 0, args_type: null },
  },
  async render({ images }, context) {
    if (images.length !== 1) throw new Error("拍需要一张图片。");
    const { frames } = await readMemeImageSequence(images[0]!, context.signal);
    return patPicture(frames[0], context);
  },
  async preview(context) {
    return patPicture(await checkerboard(context.signal), context);
  },
};

export const rub: MemeTemplate = {
  info: {
    key: "rub", keywords: ["贴", "贴贴", "蹭", "蹭蹭"],
    params_type: { min_images: 2, max_images: 2, min_texts: 0, max_texts: 0, args_type: null },
  },
  async render({ images }, context) {
    if (images.length !== 2) throw new Error("贴贴需要两张图片。");
    const [first, second] = await Promise.all([
      readMemeImageSequence(images[0]!, context.signal), readMemeImageSequence(images[1]!, context.signal),
    ]);
    return rubPicture(first.frames[0], second.frames[0], context);
  },
  async preview(context) {
    const avatar = await checkerboard(context.signal);
    return rubPicture(avatar, avatar, context);
  },
};
