import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("meme", messageCatalog.messages);
import { renderRgba } from "@lotus-yunzai/skia";
import type { Image } from "skia-canvas";
import type { MemeTemplate } from "../builtin-template.ts";
import { alignMemeLoop, readMemeImageSequence } from "./animated-input.ts";
import { renderPythonGif } from "./python-gif.ts";
import { previewImage } from "./template-layout.ts";

const poseCount = 8;
const delayMs = 10;

interface WaveSize {
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly width: number;
  readonly height: number;
}

function displacedFrame(source: Buffer, { sourceWidth, sourceHeight, width, height }: WaveSize,
  raster: WaveSize, pose: number, signal: AbortSignal) {
  const frame = new Uint8Array(raster.width * raster.height * 4);
  const left = Math.trunc((sourceWidth - width) / 2);
  const top = Math.trunc((sourceHeight - height) / 2);
  const period = sourceWidth / 6;
  const amplitude = sourceWidth / 60;
  const wave = (position: number) => amplitude / 2 * Math.sin(2 * Math.PI / period * (position + pose * period / poseCount));
  const horizontal = Array.from({ length: raster.width }, (_, x) => {
    const column = Math.floor((x + 0.5) * width / raster.width) + left;
    return { column, displacement: wave(column) };
  });
  for (let y = 0; y < raster.height; y++) {
    signal.throwIfAborted();
    const row = Math.floor((y + 0.5) * height / raster.height) + top;
    const shiftedY = row + Math.trunc(wave(row) * row / sourceHeight);
    for (let x = 0; x < raster.width; x++) {
      const { column, displacement } = horizontal[x]!;
      const shiftedX = column + Math.trunc(displacement * (sourceHeight - row) / sourceHeight);
      const inside = shiftedX >= 0 && shiftedX < sourceWidth && shiftedY >= 0 && shiftedY < sourceHeight;
      const sampleY = Math.floor(((inside ? shiftedY : row) + 0.5) * raster.sourceHeight / sourceHeight);
      const sampleX = Math.floor(((inside ? shiftedX : column) + 0.5) * raster.sourceWidth / sourceWidth);
      const original = (sampleY * raster.sourceWidth + sampleX) * 4;
      const target = (y * raster.width + x) * 4;
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
    const nominal = { width, height, sourceWidth, sourceHeight };
    const timeline = alignMemeLoop(source, poseCount, delayMs);
    let cached: { image: Image; width: number; height: number; rgba: Buffer } | undefined;
    return renderPythonGif({
      width, height, signal,
      frames: timeline.map(value => ({ value, delayMs })),
      async renderFrame({ overlay, image }, width, height) {
        const sampleWidth = Math.ceil(sourceWidth * width / nominal.width);
        const sampleHeight = Math.ceil(sourceHeight * height / nominal.height);
        if (cached?.image !== image || cached.width !== sampleWidth || cached.height !== sampleHeight) {
          const { rgba } = await renderRgba(sampleWidth, sampleHeight, draw => {
            draw.imageSmoothingQuality = "high";
            draw.drawImage(image, 0, 0, sampleWidth, sampleHeight);
          });
          cached = { image, width: sampleWidth, height: sampleHeight, rgba };
        }
        return displacedFrame(cached.rgba, nominal, { width, height, sourceWidth: sampleWidth, sourceHeight: sampleHeight },
          overlay, signal);
      },
    });
  },
  async preview(context) {
    return waveMemeTemplate.render({ images: [await previewImage(context.signal)], texts: [], args: {} }, context);
  },
};
