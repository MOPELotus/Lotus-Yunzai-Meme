import { loadImage, type CanvasRenderingContext2D, type Image } from "skia-canvas";
import { nativeImageRasterScale, renderPng } from "../../../packages/skia/index.ts";
import type { MemeTemplate, MemeTemplateContext, MemeTemplateInput } from "../builtin-template.ts";
import { readMemeImageSequence } from "./animated-input.ts";
import { assertMemeGifDimensions, encodeMemeGif } from "./gif.ts";
import { previewImage, rgbaFrame } from "./template-layout.ts";

const avatarSize = 245;
const avatarRadius = avatarSize / 2;
const params = { min_images: 1, max_images: 1, min_texts: 0, max_texts: 0, default_texts: [], args_type: null };

// Original artwork and offsets from anyliew/meme_emoji, each matched to the old catalog key.
const frames = [
  ["kaveh", ["卡维相框"], 36, 42],
  ["paimon", ["派蒙相框"], 40, 38],
  ["wind_slime", ["风史莱姆相框"], 38, 38],
  ["thunderbolt_slime", ["雷史莱姆相框", "雷电史莱姆相框"], 40, 38],
  ["kujou_sara", ["九条裟罗相框"], 36, 42],
  ["shikanoin_heizou", ["鹿野院平藏相框"], 36, 42],
  ["chasca", ["恰斯卡相框"], 40, 42],
] as const;

function drawFrame(avatar: Image, frame: Image, left: number, top: number) {
  return (canvas: CanvasRenderingContext2D) => {
    const side = Math.min(avatar.width, avatar.height);
    const sourceX = Math.floor((avatar.width - side) / 2);
    const sourceY = Math.floor((avatar.height - side) / 2);
    canvas.save();
    canvas.imageSmoothingQuality = "high";
    canvas.beginPath();
    canvas.arc(left + avatarRadius, top + avatarRadius, avatarRadius, 0, Math.PI * 2);
    canvas.clip();
    canvas.drawImage(avatar, sourceX, sourceY, side, side, left, top, avatarSize, avatarSize);
    canvas.restore();
    canvas.drawImage(frame, 0, 0);
  };
}

export const avatarFrameMemeTemplates: readonly MemeTemplate[] = frames.map(([name, keywords, left, top]) => {
  const key = `mihoyo_${name}_frame`;
  async function render(input: MemeTemplateInput, context: MemeTemplateContext) {
    if (input.images.length !== 1 || input.texts.length) throw new Error("相框需要一张图片。");
    const { signal } = context;
    signal.throwIfAborted();
    const [sequence, frame] = await Promise.all([
      readMemeImageSequence(input.images[0]!, signal),
      context.imageAsset(`anyliew/emoji/${key}/images/0.png`).then(loadImage),
    ]);
    const { width, height } = frame;
    if (sequence.frames.length === 1) {
      const result = await renderPng(width, height, drawFrame(sequence.frames[0], frame, left, top));
      signal.throwIfAborted();
      return result.png;
    }
    const scale = nativeImageRasterScale() / 4;
    const count = sequence.frames.length;
    const rasterWidth = Math.ceil(width * scale), rasterHeight = Math.ceil(height * scale);
    assertMemeGifDimensions(rasterWidth, rasterHeight, count);
    const rendered = [];
    for (const avatar of sequence.frames) {
      const { rgba } = await rgbaFrame(width, height, drawFrame(avatar, frame, left, top), signal);
      rendered.push({ rgba, delayMs: sequence.averageDelayMs });
    }
    return encodeMemeGif(rasterWidth, rasterHeight, rendered, signal);
  }

  return {
    info: { key, keywords, tags: ["米哈游", "原神"], params_type: params },
    render,
    async preview(context) {
      return render({ images: [await previewImage(context.signal)], texts: [], args: {} }, context);
    },
  };
});
