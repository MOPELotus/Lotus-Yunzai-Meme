// Screen coordinates follow MemeCrafters/meme-generator v0.1.14.
// https://github.com/MemeCrafters/meme-generator/tree/619fa10518fc2eca4fa1053af37f0a00a839f062/meme_generator/memes
import { loadImage, type CanvasRenderingContext2D, type Image } from "skia-canvas";
import { renderPng } from "../../../packages/skia/index.ts";
import type { MemeTemplate, MemeTemplateContext, MemeTemplateInput } from "../builtin-template.ts";
import { readMemeFirstImage, type MemeImageSequence } from "./animated-input.ts";
import { assertMemeGifDimensions, MemeGifByteLimitError } from "./gif.ts";
import { renderMaskedRaster } from "./masked-layout.ts";
import { screenProjection, type ProjectiveQuad } from "./projective-transform.ts";
import { jpg, previewImage, rgbaFrameDimensions } from "./template-layout.ts";
import { readTransformSource, renderTransformSequence } from "./transforms.ts";

type Point = readonly [x: number, y: number];
const maxSendBytes = 8 * 1024 * 1024;

interface ScreenTemplate {
  readonly key: string;
  readonly keywords: readonly string[];
  readonly tags?: readonly string[];
  readonly screen: readonly [width: number, height: number];
  readonly corners: ProjectiveQuad;
  readonly position: Point;
  readonly png?: boolean;
  readonly firstFrameOnly?: boolean;
  readonly square?: boolean;
}

const screens: readonly ScreenTemplate[] = [
  { key: "dog_of_vtb", keywords: ["管人痴"], screen: [600, 450], corners: [[0, 0], [579, 0], [584, 430], [5, 440]], position: [97, 32] },
  { key: "prpr", keywords: ["舔", "舔屏", "prpr"], screen: [330, 330], corners: [[0, 19], [236, 0], [287, 264], [66, 351]], position: [56, 284] },
  { key: "smash", keywords: ["砸"], screen: [800, 500], corners: [[1, 237], [826, 1], [832, 508], [160, 732]], position: [-136, -81] },
  { key: "cover_face", keywords: ["捂脸"], screen: [450, 450], corners: [[15, 15], [448, 0], [445, 456], [0, 465]],
    position: [120, 150], firstFrameOnly: true, square: true },
  { key: "haruhi_raise", keywords: ["凉宫春日举"], tags: ["凉宫春日"], screen: [250, 180],
    corners: [[0, 51], [204, 0], [211, 147], [17, 217]], position: [429, 79], png: true },
  { key: "konata_watch", keywords: ["泉此方看"], tags: ["泉此方", "幸运星"], screen: [270, 200],
    corners: [[0, 1], [275, 0], [273, 202], [2, 216]], position: [50, 188], png: true },
];

function projectedAvatar(definition: ScreenTemplate) {
  const { screen: [width, height], corners, position: [x, y] } = definition;
  const matrix = screenProjection(width, height, corners);
  const xs = corners.map(([left]) => left), ys = corners.map(([, top]) => top);
  const projectedWidth = Math.max(...xs) - Math.min(...xs);
  const projectedHeight = Math.max(...ys) - Math.min(...ys);
  return (draw: CanvasRenderingContext2D, image: Image) => {
    draw.save();
    // The old warp clips its output at the original zero-based bounds, even when xMin/yMin are nonzero.
    draw.beginPath();
    draw.rect(x, y, projectedWidth, projectedHeight);
    draw.clip();
    draw.translate(x, y);
    draw.setTransform(draw.getTransform().multiply(matrix));
    draw.beginPath();
    draw.rect(0, 0, width, height);
    draw.clip();
    draw.imageSmoothingQuality = "high";
    if (definition.square) {
      const square = Math.min(image.width, image.height);
      draw.drawImage(image, Math.floor((image.width - square) / 2), Math.floor((image.height - square) / 2), square, square,
        0, 0, width, height);
    } else {
      const ratio = Math.max(width / image.width, height / image.height);
      const scaledWidth = Math.max(width, Math.trunc(image.width * ratio));
      const scaledHeight = Math.max(height, Math.trunc(image.height * ratio));
      draw.drawImage(image, Math.trunc((width - scaledWidth) / 2), Math.trunc((height - scaledHeight) / 2), scaledWidth, scaledHeight);
    }
    draw.restore();
  };
}

function fitAnimation(source: MemeImageSequence, width: number, height: number) {
  const count = Math.min(source.frames.length, 200);
  const step = source.frames.length / count;
  const selected: MemeImageSequence = step === 1 ? source : {
    frames: [source.frames[0], ...Array.from({ length: count - 1 }, (_, index) => source.frames[Math.floor((index + 1) * step)]!)],
    averageDelayMs: source.averageDelayMs * step,
  };
  for (;;) {
    const raster = rgbaFrameDimensions(width, height);
    try {
      assertMemeGifDimensions(raster.width, raster.height, count);
      return { width, height, sequence: selected };
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      // Keep the old GIF shrink factor and leave ordinary images at their original size.
      width = smallerSide(width);
      height = smallerSide(height);
    }
  }
}

function smallerSide(value: number) {
  return Math.max(1, Math.floor(value * 0.9));
}

async function renderScreenAnimation(source: MemeImageSequence, art: Image, drawAvatar: ReturnType<typeof projectedAvatar>, signal: AbortSignal) {
  let { width, height, sequence } = fitAnimation(source, art.width, art.height);
  for (;;) {
    signal.throwIfAborted();
    try {
      const gif = await renderTransformSequence(sequence, width, height, (canvas, image) => {
        canvas.scale(width / art.width, height / art.height);
        drawAvatar(canvas, image);
        canvas.drawImage(art, 0, 0);
      }, signal);
      if (gif.byteLength <= maxSendBytes) return gif;
    } catch (error) {
      if (!(error instanceof MemeGifByteLimitError)) throw error;
    }
    width = smallerSide(width);
    height = smallerSide(height);
  }
}

function screenTemplate(definition: ScreenTemplate): MemeTemplate {
  const { key, keywords, tags, firstFrameOnly, png } = definition;
  const drawAvatar = projectedAvatar(definition);
  async function render(input: MemeTemplateInput, context: MemeTemplateContext) {
    if (input.images.length !== 1 || input.texts.length) throw new Error("该表情需要一张图片，且不接收文字。");
    const { signal } = context;
    const [art, source] = await Promise.all([
      context.imageAsset(`${key}/0.png`).then(loadImage),
      firstFrameOnly
        ? readMemeFirstImage(input.images[0]!, signal).then(image => ({ frames: [image] as const, averageDelayMs: 0 }))
        : readTransformSource(input, signal),
    ]);
    if (source.frames.length === 1) {
      const { width, height } = art;
      const masked = await renderMaskedRaster(width, height, canvas => drawAvatar(canvas, source.frames[0]),
        [canvas => canvas.drawImage(art, 0, 0)], signal, { whiteBackground: !png });
      const image = await loadImage(masked);
      if (!png) return jpg(width, height, canvas => canvas.drawImage(image, 0, 0), signal);
      return (await renderPng(width, height, canvas => canvas.drawImage(image, 0, 0))).png;
    }
    return renderScreenAnimation(source, art, drawAvatar, signal);
  }
  return {
    info: { key, keywords, tags, params_type: { min_images: 1, max_images: 1, min_texts: 0, max_texts: 0 } },
    render,
    async preview(context) {
      return render({ images: [await previewImage(context.signal)], texts: [], args: {} }, context);
    },
  };
}

export const perspectiveMemeTemplates = screens.map(screenTemplate);
