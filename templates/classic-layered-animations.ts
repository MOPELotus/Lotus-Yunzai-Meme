import { renderExactPng } from "../../../packages/skia/index.ts";
import { loadImage, type Image } from "skia-canvas";
import type { MemeTemplate, MemeTemplateContext, MemeTemplateInput } from "../builtin-template.ts";
import { alignMemeLoop, readMemeFirstImage, readMemeImageSequence } from "./animated-input.ts";
import { classicLayeredSpecs, type ClassicLayeredSpec, type Fit, type Projection, type Rectangle } from "./classic-layered-specs.ts";
import { encodeMemeGifStream, MemeGifByteLimitError } from "./gif.ts";
import { renderMaskedRgba } from "./masked-layout.ts";
import { screenProjection } from "./projective-transform.ts";
import { renderPythonGif } from "./python-gif.ts";
import { paper, previewImage, type Draw } from "./template-layout.ts";

const circleHelp = "是否将图片变为圆形";
const circleArgs = {
  args_model: { properties: { circle: { type: "boolean", default: false, description: circleHelp } } },
  args_examples: [{ circle: false }, { circle: true }],
  parser_options: [{ names: ["--circle", "圆"], dest: "circle", args: [], default: false,
    action: { type: 0, value: true }, help_text: circleHelp }],
};

function rectanglePhoto(image: Image, [x, y, width, height, angle = 0]: Rectangle, fit: Fit, circle: boolean): Draw {
  const side = Math.min(image.width, image.height);
  const sx = Math.floor((image.width - side) / 2), sy = Math.floor((image.height - side) / 2);
  const ratio = Math.max(width / image.width, height / image.height);
  const iw = Math.max(width, Math.trunc(image.width * ratio));
  const ih = Math.max(height, Math.trunc(image.height * ratio));
  return draw => {
    draw.imageSmoothingQuality = "high";
    draw.beginPath();
    if (circle) draw.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
    else draw.rect(x, y, width, height);
    draw.clip();
    if (angle) {
      draw.translate(x + width / 2, y + height / 2);
      draw.rotate(-angle * Math.PI / 180);
      draw.translate(-(x + width / 2), -(y + height / 2));
    }
    if (fit === "square") draw.drawImage(image, sx, sy, side, side, x, y, width, height);
    else if (fit === "cover") draw.drawImage(image, x + Math.trunc((width - iw) / 2), y + Math.trunc((height - ih) / 2), iw, ih);
    else draw.drawImage(image, x, y, width, height);
  };
}

function projectedPhoto(image: Image, { position: [x, y], quad }: Projection): Draw {
  const xs = quad.map(([xp]) => xp), ys = quad.map(([, yp]) => yp);
  const width = Math.max(...xs) - Math.min(...xs), height = Math.max(...ys) - Math.min(...ys);
  const matrix = screenProjection(image.width, image.height, quad);
  return draw => {
    draw.translate(x, y);
    draw.beginPath();
    draw.rect(0, 0, width, height);
    draw.clip();
    draw.transform(matrix);
    draw.imageSmoothingQuality = "high";
    draw.drawImage(image, 0, 0);
  };
}

async function readArtwork(key: string, count: number, context: MemeTemplateContext) {
  const images: Image[] = [];
  const digits = String(count - 1).length;
  for (let from = 0; from < count; from += 8) {
    context.signal.throwIfAborted();
    const batch = await Promise.all(Array.from({ length: Math.min(8, count - from) }, (_, offset) => {
      const name = String(from + offset).padStart(digits, "0");
      return context.imageAsset(`${key}/${name}.png`).then(loadImage);
    }));
    images.push(...batch);
  }
  const { width, height } = images[0]!;
  if (images.some(art => art.width !== width || art.height !== height)) throw new Error(`表情模板 ${key} 的帧尺寸不一致。`);
  return { images, width, height };
}

function template(spec: ClassicLayeredSpec): MemeTemplate {
  const { key, cadence, frames, fit = "square", layering, initialSize, circle, animatedInput } = spec;
  async function render({ images, texts, args }: MemeTemplateInput, context: MemeTemplateContext) {
    if (images.length !== 1 || texts.length) throw new Error("该表情需要一张图片。");
    const { signal } = context;
    const [source, artwork] = await Promise.all([
      animatedInput ? readMemeImageSequence(images[0]!, signal) : readMemeFirstImage(images[0]!, signal).then(image => ({
        frames: [image] as const, averageDelayMs: 0,
      })),
      readArtwork(key, frames.length, context),
    ]);
    const { width, height } = artwork;
    const timeline = alignMemeLoop(source, frames.length, cadence);
    const useCircle = circle === "always" || (circle === "option" && args.circle === true);
    const prepared = new WeakMap<Image, Promise<Image>>();
    function resizedPhoto(image: Image) {
      if (!initialSize) return image;
      const pending = prepared.get(image);
      if (pending) return pending;
      const [w, h] = initialSize;
      const next = renderExactPng(w, h, rectanglePhoto(image, [0, 0, w, h], fit, false)).then(({ png }) => loadImage(png));
      prepared.set(image, next);
      return next;
    }
    async function renderFrame({ image, overlay }: typeof timeline[number], outWidth: number, outHeight: number) {
      const scale = (paint: Draw): Draw => draw => { draw.scale(outWidth / width, outHeight / height); paint(draw); };
      const art = scale(draw => draw.drawImage(artwork.images[overlay]!, 0, 0));
      const photo = await resizedPhoto(image);
      const avatars = frames[overlay]!.map(layer => scale("quad" in layer
        ? projectedPhoto(photo, layer) : rectanglePhoto(photo, layer, initialSize ? "stretch" : fit, useCircle)));
      const base = layering === "above" ? art : layering === "paper" ? scale(draw => paper(draw, width, height)) : avatars[0]!;
      const masks = layering === "above" ? avatars : layering === "paper" ? [...avatars, art] : [art];
      const rgba = await renderMaskedRgba(outWidth, outHeight, base, masks, signal);
      for (let i = 3; i < rgba.length; i += 4) rgba[i] = rgba[i] ? 255 : 0;
      return rgba;
    }
    if (key === "stickman_dancing") {
      // Preserve its 109 original 500×500 frames without holding every RGBA raster in memory.
      async function* originalFrames() {
        for (const value of timeline) yield { rgba: await renderFrame(value, width, height), delayMs: cadence };
      }
      try {
        const original = await encodeMemeGifStream(width, height, timeline.length, originalFrames(), signal);
        if (original.byteLength <= 8 * 1024 * 1024) return original;
      } catch (error) {
        if (!(error instanceof MemeGifByteLimitError)) throw error;
      }
    }
    return renderPythonGif({ width, height, signal, frames: timeline.map(value => ({ value, delayMs: cadence })), renderFrame });
  }
  return {
    info: {
      key, keywords: spec.keywords, tags: spec.tags,
      params_type: { min_images: 1, max_images: 1, min_texts: 0, max_texts: 0, default_texts: [], args_type: circle === "option" ? circleArgs : null },
    },
    render,
    async preview(context) {
      return render({ images: [await previewImage(context.signal)], texts: [], args: {} }, context);
    },
  };
}

export const classicLayeredMemeTemplates = classicLayeredSpecs.map(template);
