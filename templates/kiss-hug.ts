import { loadImage, type CanvasRenderingContext2D, type Image } from "skia-canvas";
import { renderExactPng, renderRgba } from "../../../packages/skia/index.ts";
import type { MemeTemplate, MemeTemplateContext } from "../builtin-template.ts";
import { readMemeFirstImage } from "./animated-input.ts";
import { encodeMemeGif } from "./gif.ts";

// MemeCrafters/meme-generator-rs v0.2.3, meme_generator_memes/src/memes/{kiss,hug}.rs.
// In each pose, the first point belongs to the target, the second to the sender.
const kissPoses = [
  [58, 90, 92, 64], [62, 95, 135, 40], [42, 100, 84, 105], [50, 100, 80, 110],
  [56, 100, 155, 82], [18, 120, 60, 96], [28, 110, 50, 80], [54, 100, 98, 55],
  [46, 100, 35, 65], [60, 100, 38, 100], [35, 115, 70, 80], [20, 120, 84, 65],
  [40, 96, 75, 65],
] as const;
const hugPoses = [
  [108, 15, 78, 120, 48], [107, 14, 115, 130, 18], [104, 16, 115, 130, 0],
  [102, 14, 110, 100, -38], [104, 15, 80, 100, -31], [108, 15, 75, 115, 43],
  [108, 15, 105, 127, 22], [103, 16, 105, 127, 0], [102, 15, 110, 98, -34],
  [104, 14, 80, 105, -35],
] as const;

const delayMs = 50;

async function face(image: Image, size: number, circle: boolean) {
  const square = Math.min(image.width, image.height);
  const crop = await renderExactPng(square, square, (draw) => {
    if (circle) {
      draw.beginPath();
      draw.arc(square / 2, square / 2, square / 2, 0, Math.PI * 2);
      draw.clip();
    }
    draw.drawImage(image, -Math.round((image.width - square) / 2), -Math.round((image.height - square) / 2));
  });
  const cropped = await loadImage(crop.png);
  const resized = await renderExactPng(size, size, (draw) => {
    draw.imageSmoothingQuality = "medium";
    draw.drawImage(cropped, 0, 0, size, size);
  });
  return loadImage(resized.png);
}

async function rotate(image: Image, degrees: number) {
  if (!degrees) return image;
  const radians = degrees * Math.PI / 180;
  const bounds = image.width * (Math.abs(Math.cos(radians)) + Math.abs(Math.sin(radians)));
  const rotated = await renderExactPng(Math.trunc(bounds), Math.trunc(bounds), (draw) => {
    draw.imageSmoothingQuality = "medium";
    draw.translate(bounds / 2, bounds / 2);
    draw.rotate(radians);
    draw.drawImage(image, -image.width / 2, -image.height / 2);
  });
  return loadImage(rotated.png);
}

async function animation(size: number, assets: readonly string[], context: MemeTemplateContext,
  drawFrame: (draw: CanvasRenderingContext2D, backdrop: Image, frame: number) => void | Promise<void>) {
  const backdrops = await Promise.all(assets.map(async (asset) => {
    const image = await loadImage(await context.imageAsset(asset));
    if (image.width !== size || image.height !== size) throw new Error(`表情帧素材尺寸无效：${asset}`);
    return image;
  }));
  const frames = [];
  for (const [index, backdrop] of backdrops.entries()) {
    context.signal.throwIfAborted();
    const { rgba } = await renderRgba(size, size, (draw) => drawFrame(draw, backdrop, index));
    frames.push({ rgba, delayMs });
  }
  return encodeMemeGif(size, size, frames, context.signal);
}

async function animateKiss(sender: Image, target: Image, context: MemeTemplateContext) {
  const [senderFace, targetFace] = await Promise.all([face(sender, 40, true), face(target, 50, true)]);
  const assets = kissPoses.map((_, index) => `kiss/${String(index).padStart(2, "0")}.png`);
  return animation(200, assets, context, (draw, backdrop, index) => {
    const [targetX, targetY, senderX, senderY] = kissPoses[index]!;
    draw.drawImage(backdrop, 0, 0);
    draw.drawImage(targetFace, targetX, targetY);
    draw.drawImage(senderFace, senderX, senderY);
  });
}

async function animateHug(sender: Image, target: Image, context: MemeTemplateContext) {
  const [senderFace, targetFace] = await Promise.all([face(sender, 120, false), face(target, 105, false)]);
  const assets = hugPoses.map((_, index) => `hug/${index}.png`);
  return animation(300, assets, context, async (draw, backdrop, index) => {
    const [targetX, targetY, senderX, senderY, angle] = hugPoses[index]!;
    draw.fillStyle = "#fff";
    draw.fillRect(0, 0, 300, 300);
    draw.drawImage(targetFace, targetX, targetY);
    draw.drawImage(await rotate(senderFace, angle), senderX, senderY);
    draw.drawImage(backdrop, 0, 0);
  });
}

function avatarTemplate(key: string, keywords: readonly string[], animate: typeof animateKiss): MemeTemplate {
  return {
    info: { key, keywords, params_type: { min_images: 2, max_images: 2, min_texts: 0, max_texts: 0 } },
    async render({ images, texts }, context) {
      if (images.length !== 2 || texts.length) throw new Error(`${keywords[1]}需要两张图片，且不接收文字。`);
      const [sender, target] = await Promise.all(images.map(file => readMemeFirstImage(file, context.signal)));
      return animate(sender!, target!, context);
    },
    async preview(context) {
      context.signal.throwIfAborted();
      const { png } = await renderExactPng(500, 500, (draw) => {
        draw.fillStyle = "#fff";
        draw.fillRect(0, 0, 500, 500);
        draw.fillStyle = "#ccc";
        for (let y = 0; y < 20; y++) {
          for (let x = y % 2; x < 20; x += 2) draw.fillRect(x * 25, y * 25, 25, 25);
        }
      });
      const image = await loadImage(png);
      return animate(image, image, context);
    },
  };
}

export const kiss = avatarTemplate("kiss", ["亲", "亲亲"], animateKiss);
export const hug = avatarTemplate("hug", ["抱", "抱抱"], animateHug);
