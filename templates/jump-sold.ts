import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("meme", messageCatalog.messages);
import { randomInt } from "node:crypto";
import { loadImage, type Image } from "skia-canvas";
import type { MemeTemplate, MemeTemplateContext, MemeTemplateInput } from "../builtin-template.ts";
import { readMemeFirstImage, readMemeImageSequence } from "./animated-input.ts";
import { renderMaskedRaster, renderMaskedRgba } from "./masked-layout.ts";
import { renderPythonGif } from "./python-gif.ts";
import { jpg, previewImage, type Draw } from "./template-layout.ts";

const singleImage = { min_images: 1, max_images: 1, min_texts: 0, max_texts: 0, default_texts: [], args_type: null };
type Point = readonly [x: number, y: number];

// Original poses from MemeCrafters v0.1.14 and anyliew/meme_emoji at 33bf418a.
const jumpPositions: readonly Point[] = [[15, 50], [13, 43], [15, 23], [14, 4], [16, -3], [16, -4], [14, 4], [15, 31]];
const spiderPositions = [
  174, 174, 174, 169, 165, 160, 154, 150, 144, 141, 137, 133, 130, 119, 115, 113, 108, 103, 103, 97, 91, 85, 87, 79,
  74, 79, 75, 75, 78, 79, 77, 77, 70, 81, 93, 94, 104, 110, 119, 123, 131, 134, 143, 154, 158, 161, 163, 169, 174, 173, 174, 173,
];

interface Animation {
  readonly key: string;
  readonly keywords: readonly string[];
  readonly delayMs: number;
  readonly size: Point;
  readonly layout: "circle-above" | "rectangle-below";
  readonly positions: () => readonly Point[];
  framePath(index: number): string;
}

const animations: readonly Animation[] = [
  {
    key: "jump", keywords: ["跳"], delayMs: 50, size: [40, 40], layout: "circle-above",
    positions: () => jumpPositions, framePath: index => `jump/${index}.png`,
  },
  {
    key: "spider", keywords: ["蜘蛛", "蜘蛛爬"], delayMs: 40, size: [80, 80], layout: "circle-above",
    positions: () => spiderPositions.map(x => [x, 24 + randomInt(-1, 2)]),
    framePath: index => `python/meme_generator/memes/spider/images/${index}.png`,
  },
  {
    key: "peas", keywords: ["我嘞个豆", "豆"], delayMs: 60, size: [83, 70], layout: "rectangle-below",
    positions: () => Array<Point>(33).fill([30, 47]), framePath: index => `anyliew/emoji/peas/images/${index + 1}.png`,
  },
];

function requireOnePhoto({ images, texts }: MemeTemplateInput) {
  if (images.length !== 1 || texts.length) throw new Error($t("templates.jump-sold.text_2646e324ad"));
  return images[0]!;
}

function drawAvatar(image: Image, [x, y]: Point, [width, height]: Point, circle: boolean): Draw {
  return draw => {
    draw.imageSmoothingQuality = "high";
    if (!circle) {
      draw.drawImage(image, x, y, width, height);
      return;
    }
    const side = Math.min(image.width, image.height);
    draw.beginPath();
    draw.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
    draw.clip();
    draw.drawImage(image, Math.floor((image.width - side) / 2), Math.floor((image.height - side) / 2), side, side,
      x, y, width, height);
  };
}

function rescale(paint: Draw, x: number, y: number): Draw {
  return draw => { draw.scale(x, y); paint(draw); };
}

function preserveGifAlpha(rgba: Uint8Array) {
  // The original RGBA-to-GIF conversion only reserves a transparent palette entry for alpha zero.
  for (let index = 3; index < rgba.length; index += 4) rgba[index] = rgba[index] ? 255 : 0;
  return rgba;
}

function fixedAnimation(spec: Animation): MemeTemplate {
  async function render(input: MemeTemplateInput, context: MemeTemplateContext) {
    const { signal } = context;
    const image = requireOnePhoto(input);
    const readArt = (index: number) => context.imageAsset(spec.framePath(index)).then(loadImage);
    const [avatar, first] = await Promise.all([readMemeFirstImage(image, signal), readArt(0)]);
    const { width, height } = first;
    const frames = spec.positions().map((position, index) => ({ value: { position, index }, delayMs: spec.delayMs }));
    return renderPythonGif({
      width, height, frames, signal,
      async renderFrame({ position, index }, outWidth, outHeight) {
        const art = index === 0 ? first : await readArt(index);
        if (art.width !== width || art.height !== height) throw new Error($t("templates.jump-sold.text_bc92350be8", { "key": spec.key }));
        const scaled = (paint: Draw) => rescale(paint, outWidth / width, outHeight / height);
        const drawArt = scaled(draw => draw.drawImage(art, 0, 0));
        const circleAbove = spec.layout === "circle-above";
        const head = scaled(drawAvatar(avatar, position, spec.size, circleAbove));
        const rgba = circleAbove
          ? await renderMaskedRgba(outWidth, outHeight, drawArt, [head], signal)
          : await renderMaskedRgba(outWidth, outHeight, () => {}, [head, drawArt], signal);
        return preserveGifAlpha(rgba);
      },
    });
  }
  return {
    info: { key: spec.key, keywords: spec.keywords, params_type: singleImage }, render,
    async preview(context) {
      return render({ images: [await previewImage(context.signal)], texts: [], args: {} }, context);
    },
  };
}

const soldOut: MemeTemplate = {
  info: { key: "sold_out", keywords: ["卖掉了"], params_type: singleImage },
  async render(input, context) {
    const { signal } = context;
    const [sequence, icon] = await Promise.all([
      readMemeImageSequence(requireOnePhoto(input), signal), context.imageAsset("sold_out/0.png").then(loadImage),
    ]);
    const first = sequence.frames[0];
    const scale = 600 / Math.min(first.width, first.height);
    const width = Math.max(600, Math.trunc(first.width * scale));
    const height = Math.max(600, Math.trunc(first.height * scale));
    const veil: Draw = draw => { draw.fillStyle = "#00000040"; draw.fillRect(0, 0, width, height); };
    // The original uses the icon height for both offsets.
    const iconLayer: Draw = draw => draw.drawImage(icon, Math.floor((width - icon.height) / 2), Math.floor((height - icon.height) / 2));
    const base = (image: Image): Draw => draw => {
      draw.imageSmoothingQuality = "high";
      draw.drawImage(image, 0, 0, width, height);
    };
    if (sequence.frames.length === 1) {
      const png = await renderMaskedRaster(width, height, base(first), [veil, iconLayer], signal, { whiteBackground: true });
      const composite = await loadImage(png);
      return jpg(width, height, draw => draw.drawImage(composite, 0, 0), signal);
    }
    return renderPythonGif({
      width, height, signal, frames: sequence.frames.map(value => ({ value, delayMs: sequence.averageDelayMs })),
      async renderFrame(image, outWidth, outHeight) {
        const scaled = (paint: Draw) => rescale(paint, outWidth / width, outHeight / height);
        return preserveGifAlpha(await renderMaskedRgba(outWidth, outHeight, scaled(base(image)), [scaled(veil), scaled(iconLayer)], signal));
      },
    });
  },
  async preview(context) {
    return soldOut.render({ images: [await previewImage(context.signal)], texts: [], args: {} }, context);
  },
};

export const jumpSoldMemeTemplates = [...animations.map(fixedAnimation), soldOut];
