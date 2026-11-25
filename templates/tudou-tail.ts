import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("meme", messageCatalog.messages);
import { ImageData, loadImage, type CanvasRenderingContext2D, type Image } from "skia-canvas";
import { renderExactPng, renderRgba } from "../../../packages/skia/index.ts";
import type { MemeTemplate, MemeTemplateContext, MemeTemplateInput } from "../builtin-template.ts";
import { alignMemeLoop, readMemeFirstImage, readMemeImageSequence, type MemeImageSequence } from "./animated-input.ts";
import { encodeMemeGifStream, MemeGifByteLimitError, MemeGifDimensionLimitError } from "./gif.ts";
import { pasteMask } from "./masked-layout.ts";
import { renderPythonGif } from "./python-gif.ts";
import { jpg, previewImage, registerFont } from "./template-layout.ts";
import { tudouTailSpecs } from "./tudou-tail-specs.ts";

type RenderMode = Parameters<typeof renderRgba>[3];
type Size = readonly [width: number, height: number];
type Pose = readonly [x: number, y: number, width: number, height: number];
export interface TudouTailLayer {
  readonly source: number;
  readonly poses: readonly (Pose | null)[];
  readonly circle?: Size | "input";
  readonly circleCover?: boolean;
  readonly circleRotate?: number;
  readonly circleBorder?: number;
  readonly cover?: boolean;
  readonly coverThenCircle?: boolean;
  readonly rotate?: number;
  readonly expand?: boolean;
  readonly frameRotation?: number;
  readonly below?: boolean;
  readonly unmasked?: boolean;
}
export interface TudouTailSpec {
  readonly key: string;
  readonly keywords: readonly string[];
  readonly minImages: number;
  readonly maxImages: number;
  readonly viewport: Size;
  readonly frames: number;
  readonly delayMs?: number;
  readonly layers: readonly TudouTailLayer[];
  readonly format?: "jpeg" | "jpeg-or-gif";
  readonly artworkLast?: boolean;
  readonly repeatArtwork?: boolean;
  readonly caption?: boolean;
}
interface Frame {
  readonly index: number;
  readonly images: readonly Image[];
}
const maxSendBytes = 8 * 1024 * 1024;
const captionArgs = { args_model: { type: "object", properties: { user_infos: { type: "array" } } }, parser_options: [], args_examples: [] };

function clipRect(draw: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
  draw.beginPath();
  draw.rect(x, y, width, height);
  draw.clip();
}

function circle(draw: CanvasRenderingContext2D, radius: number) {
  draw.beginPath();
  draw.arc(radius, radius, radius, 0, 2 * Math.PI);
}

function drawFit(draw: CanvasRenderingContext2D, image: Image, width: number, height: number, cover: boolean) {
  if (!cover) {
    draw.drawImage(image, 0, 0, width, height);
    return;
  }
  const scale = Math.max(width / image.width, height / image.height);
  const w = Math.max(width, Math.trunc(image.width * scale));
  const h = Math.max(height, Math.trunc(image.height * scale));
  draw.drawImage(image, Math.trunc((width - w) / 2), Math.trunc((height - h) / 2), w, h);
}

function clockwise(angle: number) {
  return -((angle + 540) % 360 - 180) * Math.PI / 180;
}

function drawLayer(draw: CanvasRenderingContext2D, image: Image, [x, y, w, h]: Pose,
  layer: TudouTailLayer, index: number) {
  const angle = clockwise((layer.rotate ?? 0) - index * (layer.frameRotation ?? 0));
  const cos = Math.abs(Math.cos(angle)), sin = Math.abs(Math.sin(angle));
  const rotatedWidth = layer.expand ? 2 * Math.ceil((w + w * cos + h * sin) / 2) - w : w;
  const rotatedHeight = layer.expand ? 2 * Math.ceil((h + h * cos + w * sin) / 2) - h : h;
  const width = layer.coverThenCircle ? Math.min(w, h) : rotatedWidth;
  const height = layer.coverThenCircle ? width : rotatedHeight;
  draw.translate(x, y);
  draw.imageSmoothingQuality = "high";
  clipRect(draw, 0, 0, width, height);
  if (layer.coverThenCircle) {
    circle(draw, width / 2);
    draw.clip();
    draw.translate(Math.trunc((width - w) / 2), Math.trunc((height - h) / 2));
  }
  draw.translate((rotatedWidth - w) / 2, (rotatedHeight - h) / 2);
  if (angle) {
    draw.translate(w / 2, h / 2);
    draw.rotate(angle);
    draw.translate(-w / 2, -h / 2);
  }
  drawFit(draw, image, w, h, layer.cover || layer.coverThenCircle || false);
}

function inputTimeline(sequences: readonly MemeImageSequence[]) {
  const animated = sequences.filter(source => source.frames.length > 1);
  const fastest = animated.reduce((first, source) => source.averageDelayMs < first.averageDelayMs ? source : first);
  const second = animated.find(source => source !== fastest);
  const images = second
    ? alignMemeLoop(second, fastest.frames.length, fastest.averageDelayMs)
    : fastest.frames.map((image, overlay) => ({ image, overlay }));
  const delayMs = Math.floor(fastest.averageDelayMs / 10) * 10;
  return images.map(({ image, overlay }) => ({ delayMs, value: {
    index: 0,
    images: sequences.map(source => source === second ? image : source === fastest ? fastest.frames[overlay]! : source.frames[0]),
  } }));
}

function template(spec: TudouTailSpec, mode: RenderMode): MemeTemplate {
  const { key, minImages, maxImages, viewport: [width, height] } = spec;

  async function render(input: MemeTemplateInput, context: MemeTemplateContext) {
    const { images, texts, args } = input, { signal } = context;
    if (images.length < minImages || images.length > maxImages || texts.length > Number(!!spec.caption)) {
      throw new Error($t("templates.tudou-tail.text_bbde429693", { "minImages": minImages, "maxImages": maxImages }));
    }
    const sources = await Promise.all(images.map(image => spec.format === "jpeg-or-gif" ?
      readMemeImageSequence(image, signal) :
      readMemeFirstImage(image, signal).then(frame => ({ frames: [frame] as const, averageDelayMs: 0 }))));
    const first = sources.map(source => source.frames[0]);
    const artwork = new Map<number, Promise<Image>>();
    const circles = new WeakMap<TudouTailLayer, WeakMap<Image, Promise<Image>>>();
    let font: string | undefined;
    let caption = "";
    if (spec.caption) {
      font = await registerFont(context);
      const nickname: unknown = Array.isArray(args.user_infos) ? args.user_infos[0]?.name : undefined;
      caption = texts[0]?.trim() ? texts[0] : (typeof nickname === "string" && nickname) || $t("templates.tudou-tail.text_be6af86c17");
    }

    function asset(index: number) {
      const id = spec.repeatArtwork ? 0 : index;
      let item = artwork.get(id);
      if (!item) {
        item = context.imageAsset(`python/meme_generator/memes/${key}/tudou/${id}.png`).then(loadImage);
        artwork.set(id, item);
      }
      return item;
    }

    function head(image: Image, layer: TudouTailLayer) {
      if (!layer.circle) return image;
      let entries = circles.get(layer);
      if (!entries) {
        entries = new WeakMap();
        circles.set(layer, entries);
      }
      let converted = entries.get(image);
      if (!converted) {
        const [w, h] = layer.circle === "input" ? [image.width, image.height] : layer.circle;
        const side = Math.min(w, h), border = layer.circleBorder ?? 0;
        const diameter = side + border * 2;
        converted = renderExactPng(diameter, diameter, draw => {
          if (border) {
            circle(draw, diameter / 2);
            draw.fill();
            draw.translate(border, border);
          }
          circle(draw, side / 2);
          draw.clip();
          draw.imageSmoothingQuality = "high";
          if (layer.circleRotate) {
            draw.translate(side / 2, side / 2);
            draw.rotate(clockwise(layer.circleRotate));
            draw.translate(-side / 2, -side / 2);
          }
          draw.translate(Math.trunc((side - w) / 2), Math.trunc((side - h) / 2));
          drawFit(draw, image, w, h, layer.circleCover || false);
        }, mode).then(({ png }) => loadImage(png));
        entries.set(image, converted);
      }
      return converted;
    }

    async function paint(frame: Frame, outWidth: number, outHeight: number) {
      const art = await asset(frame.index);
      const raster = async (draw: (ctx: CanvasRenderingContext2D) => void) => (await renderRgba(outWidth, outHeight, ctx => {
        ctx.scale(outWidth / width, outHeight / height);
        clipRect(ctx, 0, 0, art.width, art.height);
        draw(ctx);
      }, mode)).rgba;
      const backdrop = () => raster(draw => draw.drawImage(art, 0, 0));
      let pixels = spec.artworkLast ? Buffer.alloc(outWidth * outHeight * 4) : await backdrop();
      for (const layer of spec.layers) {
        signal.throwIfAborted();
        const pose = layer.poses[frame.index];
        if (!pose) continue;
        const avatar = await head(frame.images[layer.source] ?? frame.images[0]!, layer);
        const layerPixels = await raster(draw => drawLayer(draw, avatar, pose, layer, frame.index));
        if (layer.below) {
          pasteMask(layerPixels, pixels);
          pixels = layerPixels;
        } else if (layer.unmasked) pixels = layerPixels;
        else pasteMask(pixels, layerPixels);
      }
      if (spec.artworkLast) pasteMask(pixels, await backdrop());
      if (font) {
        const text = await raster(draw => {
          draw.font = `28px ${font}`;
          draw.textAlign = "center";
          draw.textBaseline = "middle";
          draw.fillText(caption, 243, 246.5);
        });
        pasteMask(pixels, text);
      }
      return pixels;
    }

    if (spec.format === "jpeg" || (spec.format === "jpeg-or-gif" && sources.every(source => source.frames.length === 1))) {
      const rgba = await paint({ index: 0, images: first }, width, height);
      const white = Buffer.alloc(rgba.length, 255);
      pasteMask(white, rgba);
      for (let index = 3; index < white.length; index += 4) white[index] = 255;
      const data = new ImageData(new Uint8ClampedArray(white), width, height);
      return jpg(width, height, draw => draw.putImageData(data, 0, 0), signal);
    }
    const frames = spec.format === "jpeg-or-gif" ? inputTimeline(sources) :
      Array.from({ length: spec.frames }, (_, index) => ({ value: { index, images: first }, delayMs: spec.delayMs! }));
    async function renderFrame(frame: Frame, w: number, h: number) {
      const pixels = await paint(frame, w, h);
      for (let index = 3; index < pixels.length; index += 4) if (pixels[index]) pixels[index] = 255;
      return pixels;
    }
    async function* sourceFrames() {
      let last: { rgba: Buffer; delayMs: number } | undefined;
      for (const { value, delayMs } of frames) {
        const rgba = await renderFrame(value, width, height);
        if (last?.rgba.equals(rgba)) last.delayMs += delayMs;
        else {
          if (last) yield last;
          last = { rgba, delayMs };
        }
      }
      if (last) yield last;
    }
    try {
      const gif = await encodeMemeGifStream(width, height, frames.length, sourceFrames(), signal);
      if (gif.byteLength <= maxSendBytes) return gif;
    } catch (error) {
      if (!(error instanceof MemeGifByteLimitError || error instanceof MemeGifDimensionLimitError)) throw error;
    }
    return renderPythonGif({ width, height, frames, signal, renderFrame });
  }

  return {
    info: { key, keywords: spec.keywords, params_type: {
      min_images: minImages, max_images: maxImages, min_texts: 0, max_texts: spec.caption ? 1 : 0,
      default_texts: [], args_type: spec.caption ? captionArgs : null,
    } },
    render,
    async preview(context) {
      const avatar = await previewImage(context.signal);
      return render({ images: Array<File>(minImages).fill(avatar), texts: [], args: {} }, context);
    },
  };
}

export function createTudouTailTemplates(mode?: RenderMode) {
  return tudouTailSpecs.map(spec => template(spec, mode));
}
export const tudouTailTemplates = createTudouTailTemplates();
