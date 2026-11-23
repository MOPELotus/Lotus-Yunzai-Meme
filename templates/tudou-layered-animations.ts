import { ImageData, loadImage, type CanvasRenderingContext2D, type Image } from "skia-canvas";
import { renderExactPng, renderRgba } from "../../../packages/skia/index.ts";
import type { MemeTemplate, MemeTemplateContext, MemeTemplateInput } from "../builtin-template.ts";
import { alignMemeLoop, readMemeFirstImage, readMemeImageSequence, type MemeImageSequence } from "./animated-input.ts";
import { encodeMemeGifStream, MemeGifByteLimitError, MemeGifDimensionLimitError } from "./gif.ts";
import { pasteMask } from "./masked-layout.ts";
import { renderPythonGif } from "./python-gif.ts";
import { jpg, previewImage } from "./template-layout.ts";
import { tudouCompositions, type Pose, type TudouAvatarLayer, type TudouComposition } from "./tudou-layered-specs.ts";
import { tudouOverlays } from "./tudou-overlay-specs.ts";
import { tudouExtendedOverlays } from "./tudou-extended-overlays.ts";

type RenderMode = Parameters<typeof renderRgba>[3];
type Frame = { readonly artwork: number; readonly avatars: readonly Image[] };
const maxGifBytes = 8 * 1024 * 1024;
const pathFor = (key: string, frame: number) => `python/meme_generator/memes/${key}/tudou/${frame}.png`;

function clipCircle(draw: CanvasRenderingContext2D, x: number, y: number, diameter: number) {
  draw.beginPath();
  draw.arc(x + diameter / 2, y + diameter / 2, diameter / 2, 0, 2 * Math.PI);
  draw.clip();
}

function drawLayer(draw: CanvasRenderingContext2D, avatar: Image, [x, y, width, height]: Pose, layer: TudouAvatarLayer) {
  draw.imageSmoothingQuality = "high";
  if (layer.mode === "resize-circle") {
    draw.drawImage(avatar, x, y, width, height);
  } else if (layer.mode === "circle-cover") {
    const source = Math.min(avatar.width, avatar.height);
    const size = Math.max(width, height);
    const left = x + Math.trunc((width - size) / 2), top = y + Math.trunc((height - size) / 2);
    draw.beginPath();
    draw.rect(x, y, width, height);
    draw.clip();
    clipCircle(draw, left, top, size);
    draw.drawImage(avatar, Math.trunc((avatar.width - source) / 2), Math.trunc((avatar.height - source) / 2), source, source,
      left, top, size, size);
  } else {
    // The old circle operates after aspect-preserving resize and crops to the shorter side.
    const size = Math.min(width, height), mid = size / 2;
    clipCircle(draw, x, y, size);
    if (layer.angle) {
      draw.translate(x + mid, y + mid);
      draw.rotate(-layer.angle * Math.PI / 180);
      draw.translate(-x - mid, -y - mid);
    }
    const ratio = Math.max(width / avatar.width, height / avatar.height);
    const scaledWidth = Math.trunc(avatar.width * ratio), scaledHeight = Math.trunc(avatar.height * ratio);
    draw.drawImage(avatar,
      x + Math.trunc((size - width) / 2) + Math.trunc((width - scaledWidth) / 2),
      y + Math.trunc((size - height) / 2) + Math.trunc((height - scaledHeight) / 2), scaledWidth, scaledHeight);
  }
}

function suppliedGifTimeline(sequences: readonly MemeImageSequence[]) {
  const animated = sequences.filter(seq => seq.frames.length > 1);
  const fastest = animated.reduce((best, seq) => seq.averageDelayMs < best.averageDelayMs ? seq : best);
  const other = animated.find(seq => seq !== fastest);
  const timeline = other ? alignMemeLoop(other, fastest.frames.length, fastest.averageDelayMs) :
    fastest.frames.map((image, overlay) => ({ image, overlay }));
  // Pillow writes whole centiseconds and truncates fractional frame delays.
  const delayMs = Math.floor(fastest.averageDelayMs / 10) * 10;
  return timeline.map(({ image, overlay }) => ({ delayMs, value: {
    artwork: 0,
    avatars: sequences.map(seq => seq === other ? image : seq === fastest ? fastest.frames[overlay]! : seq.frames[0]),
  } }));
}

function template(spec: TudouComposition, mode: RenderMode): MemeTemplate {
  const { key, frames, avatars: avatarCount, viewport: [width, height] } = spec;
  async function render(input: MemeTemplateInput, context: MemeTemplateContext) {
    if (input.images.length !== avatarCount || input.texts.length) throw new Error(`该表情需要 ${avatarCount} 张图片。`);
    const { signal } = context;
    const artwork = new Map<number, Promise<Image>>();
    const prepared = new Map<TudouAvatarLayer, WeakMap<Image, Promise<Image>>>();
    function readArt(frame: number) {
      let result = artwork.get(frame);
      if (!result) {
        result = context.imageAsset(pathFor(key, frame)).then(loadImage);
        artwork.set(frame, result);
      }
      return result;
    }
    function prepareCircle(avatar: Image, layer: TudouAvatarLayer) {
      let cached = prepared.get(layer);
      if (!cached) {
        cached = new WeakMap();
        prepared.set(layer, cached);
      }
      let image = cached.get(avatar);
      if (!image) {
        const [width, height] = layer.initialCircle === "input" ? [avatar.width, avatar.height] : layer.initialCircle ?? [110, 110];
        const diameter = Math.min(width, height);
        const left = Math.trunc((diameter - width) / 2), top = Math.trunc((diameter - height) / 2);
        image = renderExactPng(diameter, diameter, draw => {
          clipCircle(draw, 0, 0, diameter);
          draw.imageSmoothingQuality = "high";
          if (layer.squareFirst) {
            const side = Math.min(avatar.width, avatar.height);
            draw.drawImage(avatar, Math.trunc((avatar.width - side) / 2), Math.trunc((avatar.height - side) / 2), side, side,
              left, top, width, height);
          } else draw.drawImage(avatar, left, top, width, height);
        }, mode).then(({ png }) => loadImage(png));
        cached.set(avatar, image);
      }
      return image;
    }

    async function paint(frame: Frame, outWidth: number, outHeight: number) {
      const art = await readArt(frame.artwork);
      if (art.width !== width || art.height !== height) throw new Error(`表情模板 ${key} 的原画尺寸不符。`);
      const raster = async (draw: (ctx: CanvasRenderingContext2D) => void) => (await renderRgba(outWidth, outHeight, ctx => {
        ctx.scale(outWidth / width, outHeight / height);
        draw(ctx);
      }, mode)).rgba;
      const drawArt = (draw: CanvasRenderingContext2D) => draw.drawImage(art, 0, 0);
      let rgba = spec.artworkLast ? Buffer.alloc(outWidth * outHeight * 4) : await raster(drawArt);
      for (const layer of spec.layers) {
        signal.throwIfAborted();
        if (layer.visible && !layer.visible.some(([first, last]) => frame.artwork >= first && frame.artwork <= last)) continue;
        const avatar = frame.avatars[layer.source]!;
        const image = layer.mode === "resize-circle" ? await prepareCircle(avatar, layer) : avatar;
        const pose = (typeof layer.poses[0] === "number" ? layer.poses : layer.poses[frame.artwork]) as Pose;
        const pixels = await raster(draw => drawLayer(draw, image, pose, layer));
        if (layer.below) {
          pasteMask(pixels, rgba);
          rgba = pixels;
        } else pasteMask(rgba, pixels);
      }
      if (spec.artworkLast) pasteMask(rgba, await raster(drawArt));
      return rgba;
    }

    const sources = await Promise.all(input.images.map(file => spec.still ? readMemeImageSequence(file, signal) :
      readMemeFirstImage(file, signal).then(image => ({ frames: [image] as const, averageDelayMs: 0 }))));
    const first = sources.map(source => source.frames[0]);
    if (spec.still && sources.every(source => source.frames.length === 1)) {
      const rgba = await paint({ artwork: 0, avatars: first }, width, height);
      if (spec.still === "jpeg") {
        const paper = Buffer.alloc(rgba.length, 255);
        pasteMask(paper, rgba);
        for (let i = 3; i < paper.length; i += 4) paper[i] = 255;
        const pixels = new ImageData(new Uint8ClampedArray(paper), width, height);
        return jpg(width, height, draw => draw.putImageData(pixels, 0, 0), signal);
      }
      const pixels = new ImageData(new Uint8ClampedArray(rgba), width, height);
      return (await renderExactPng(width, height, draw => draw.putImageData(pixels, 0, 0), mode)).png;
    }

    const timeline = spec.still ? suppliedGifTimeline(sources) : Array.from({ length: frames }, (_, index) => ({
      value: { artwork: index, avatars: first }, delayMs: spec.delayMs,
    }));
    async function renderFrame(value: Frame, w: number, h: number) {
      const rgba = await paint(value, w, h);
      // The old GIF palette reserves only fully transparent pixels.
      for (let i = 3; i < rgba.length; i += 4) if (rgba[i]) rgba[i] = 255;
      return rgba;
    }
    async function* originals() {
      let last: { rgba: Buffer; delayMs: number } | undefined;
      for (const { value, delayMs } of timeline) {
        signal.throwIfAborted();
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
      const gif = await encodeMemeGifStream(width, height, timeline.length, originals(), signal);
      if (gif.byteLength <= maxGifBytes) return gif;
    } catch (error) {
      if (!(error instanceof MemeGifByteLimitError || error instanceof MemeGifDimensionLimitError)) throw error;
    }
    return renderPythonGif({ width, height, signal, frames: timeline, renderFrame });
  }

  return {
    info: { key, keywords: spec.keywords, tags: spec.tags, params_type: {
      min_images: avatarCount, max_images: avatarCount, min_texts: 0, max_texts: 0, default_texts: [], args_type: null,
    } },
    render,
    async preview(context) {
      const avatar = await previewImage(context.signal);
      return render({ images: Array<File>(avatarCount).fill(avatar), texts: [], args: {} }, context);
    },
  };
}

export function createTudouLayeredTemplates(mode?: RenderMode) {
  return tudouCompositions.map(spec => template(spec, mode));
}

export const tudouLayeredTemplates = createTudouLayeredTemplates();

export function createTudouOverlayTemplates(mode?: RenderMode) {
  return tudouOverlays.map(spec => template(spec, mode));
}

export const tudouOverlayTemplates = createTudouOverlayTemplates();

export function createTudouExtendedOverlayTemplates(mode?: RenderMode) {
  return tudouExtendedOverlays.map(spec => template(spec, mode));
}

export const tudouExtendedOverlayTemplates = createTudouExtendedOverlayTemplates();
