import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("meme", messageCatalog.messages);
// Original Python layout from MemeCrafters/meme-generator (619fa105).
import { loadImage } from "skia-canvas";
import type { MemeTemplate } from "../builtin-template.ts";
import { readMemeImageSequence } from "./animated-input.ts";
import { renderPythonCanvasGif } from "./python-gif.ts";
import { paper, previewImage, rgbaFrameDimensions } from "./template-layout.ts";

const avatarFrames = 18;
const frameCount = 30;
const delayMs = 80;

function roundPixel(value: number) {
  const lower = Math.floor(value);
  return value - lower === 0.5 ? lower + lower % 2 : Math.round(value);
}

export const flush: MemeTemplate = {
  info: {
    key: "flush",
    keywords: ["红温"],
    params_type: { min_images: 1, max_images: 1, min_texts: 0, max_texts: 0, default_texts: [], args_type: null },
  },
  async render({ images }, context) {
    const { signal } = context;
    const input = await readMemeImageSequence(images[0]!, signal);
    const { width, height } = input.frames[0];
    const side = Math.min(width, height);
    const size = Math.min(side, 282);
    const art = await Promise.all(Array.from({ length: frameCount - avatarFrames }, async (_, index) =>
      loadImage(await context.imageAsset(`python/meme_generator/memes/flush/images/${index}.png`))));
    const sourceX = Math.floor((width - side) / 2);
    const sourceY = Math.floor((height - side) / 2);
    const ratio = side / size;
    const frameDuration = input.averageDelayMs / 1000;
    const cycleDuration = input.frames.length * frameDuration;
    let sourceIndex = 0;
    let cycleStart = 0;
    const frames = Array.from({ length: frameCount }, (_, index) => {
      const drawAvatar = index < avatarFrames;
      // The original advances a seconds-based input cursor across GIF loops.
      while (drawAvatar && input.frames.length > 1 && index * (delayMs / 1000) - cycleStart >= (sourceIndex + 1) * frameDuration) {
        sourceIndex++;
        if (sourceIndex === input.frames.length) {
          sourceIndex = 0;
          cycleStart += cycleDuration;
        }
      }
      return { value: { index, sourceIndex, jitter: drawAvatar ? 0.2 * (2 * Math.random() - 1) : 0 }, delayMs };
    });
    const raster = rgbaFrameDimensions(size, size);
    return renderPythonCanvasGif({
      width: raster.width,
      height: raster.height,
      scale: raster.scale,
      frames,
      signal,
      drawFrame({ index, sourceIndex, jitter }, draw) {
        draw.imageSmoothingQuality = "high";
        if (index >= avatarFrames) {
          draw.drawImage(art[index - avatarFrames]!, 0, 0, size, size);
          return;
        }
        const zoom = size * 0.01 * index;
        const start = roundPixel(zoom * (1 + jitter));
        const end = roundPixel(size - zoom * (1 - jitter));
        const extent = (end - start) * ratio;
        const avatar = input.frames[sourceIndex]!;
        paper(draw, size, size);
        draw.drawImage(avatar, sourceX + start * ratio, sourceY + start * ratio, extent, extent, 0, 0, size, size);
        draw.fillStyle = `rgba(255, 0, 0, ${8 * index / 255})`;
        draw.fillRect(0, 0, size, size);
      },
    });
  },
  async preview(context) {
    return flush.render({ images: [await previewImage(context.signal)], texts: [], args: {} }, context);
  },
};
