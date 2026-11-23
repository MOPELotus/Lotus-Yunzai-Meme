import { renderRgba } from "@lotus-yunzai/skia";
import type { Image } from "skia-canvas";
import type { MemeTemplate } from "../builtin-template.ts";
import { alignMemeLoop, readMemeImageSequence } from "./animated-input.ts";
import { assertMemeGifDimensions, encodeMemeGif } from "./gif.ts";
import { previewImage } from "./template-layout.ts";

const poseCount = 8;
const delayMs = 10;

function displacedFrame(source: Uint8Array, sourceWidth: number, sourceHeight: number, width: number, height: number,
  amplitude: number, pose: number, signal: AbortSignal) {
  const frame = new Uint8Array(width * height * 4);
  const left = Math.trunc((sourceWidth - width) / 2);
  const top = Math.trunc((sourceHeight - height) / 2);
  const period = sourceWidth / 6;
  const wave = (position: number) => amplitude / 2 * Math.sin(2 * Math.PI / period * (position + pose * period / poseCount));
  const horizontal = Array.from({ length: width }, (_, x) => wave(x + left));
  for (let y = 0; y < height; y++) {
    signal.throwIfAborted();
    const row = y + top;
    const shiftedY = row + Math.trunc(wave(row) * row / sourceHeight);
    for (let x = 0; x < width; x++) {
      const column = x + left;
      const shiftedX = column + Math.trunc(horizontal[x]! * (sourceHeight - row) / sourceHeight);
      const inside = shiftedX >= 0 && shiftedX < sourceWidth && shiftedY >= 0 && shiftedY < sourceHeight;
      const original = (inside ? shiftedY * sourceWidth + shiftedX : row * sourceWidth + column) * 4;
      const target = (y * width + x) * 4;
      frame[target] = source[original]!;
      frame[target + 1] = source[original + 1]!;
      frame[target + 2] = source[original + 2]!;
      frame[target + 3] = source[original + 3]!;
    }
  }
  return frame;
}

export const waveMemeTemplate: MemeTemplate = {
  info: {
    key: "wave", keywords: ["波纹"],
    params_type: { min_images: 1, max_images: 1, min_texts: 0, max_texts: 0, args_type: null },
  },
  async render({ images }, { signal }) {
    const source = await readMemeImageSequence(images[0]!, signal);
    const first = source.frames[0];
    const sourceWidth = Math.min(720, Math.max(360, first.width));
    const sourceHeight = Math.trunc(first.height * sourceWidth / first.width);
    const amplitude = sourceWidth / 60;
    const width = Math.trunc(sourceWidth - amplitude);
    const height = Math.trunc(sourceHeight - amplitude);
    const timeline = alignMemeLoop(source, poseCount, delayMs);
    assertMemeGifDimensions(width, height, timeline.length);
    let lastImage: Image | undefined;
    let pixels: Buffer | undefined;
    const frames = [];
    for (const { overlay, image } of timeline) {
      signal.throwIfAborted();
      if (image !== lastImage || !pixels) {
        const { rgba } = await renderRgba(sourceWidth, sourceHeight, draw => {
          draw.imageSmoothingQuality = "high";
          draw.drawImage(image, 0, 0, sourceWidth, sourceHeight);
        });
        pixels = rgba;
        lastImage = image;
      }
      frames.push({ rgba: displacedFrame(pixels, sourceWidth, sourceHeight, width, height, amplitude, overlay, signal), delayMs });
    }
    return encodeMemeGif(width, height, frames, signal);
  },
  async preview(context) {
    return waveMemeTemplate.render({ images: [await previewImage(context.signal)], texts: [], args: {} }, context);
  },
};
