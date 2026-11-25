import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("meme", messageCatalog.messages);
// Layouts follow the fixed Python archive sources recorded in resources/builtin/sources.json.
import { ImageData, loadImage, type Image } from "skia-canvas";
import { renderExactPng } from "../../../packages/skia/index.ts";
import type { MemeTemplate, MemeTemplateContext } from "../builtin-template.ts";
import { readMemeFirstImage, readMemeImageSequence } from "./animated-input.ts";
import { drawAvatar } from "./avatar-slot.ts";
import { encodeMemeGifStream, MemeGifByteLimitError, MemeGifDimensionLimitError } from "./gif.ts";
import { renderMaskedRgba } from "./masked-layout.ts";
import { renderPythonGif } from "./python-gif.ts";
import { previewImage, rgbaFrameDimensions, type Draw } from "./template-layout.ts";
import { timedOverlayTimeline } from "./timed-overlays.ts";

type Point = readonly [x: number, y: number];
type Size = readonly [width: number, height: number];

interface Portrait {
  readonly source: number;
  readonly size: Size;
  readonly positions: readonly (Point | null)[];
  readonly angle?: number;
  readonly circle?: boolean;
  readonly fit?: "square" | "cover";
  readonly underArt?: boolean;
  readonly unmasked?: boolean;
}

interface FixedScene {
  readonly key: string;
  readonly keywords: readonly string[];
  readonly count: number;
  readonly artworkStart?: number;
  readonly frameCount: number;
  readonly delay: number;
  readonly portraits: readonly Portrait[];
}

const fixedScenes = [
  { key: "behind_do", keywords: ["后撅"], count: 2, frameCount: 10, delay: 70, portraits: [
    { source: 1, size: [116, 116], circle: true, fit: "cover", underArt: true,
      positions: [[174, 91], [174, 91], [173, 86], [171, 87], [170, 85], [170, 85], [167, 82], [170, 85], [170, 85], [172, 88]] },
    { source: 0, size: [110, 110], circle: true, fit: "cover", angle: 15,
      positions: [[72, 5], [72, 5], [71, 2], [70, 3], [66, 5], [66, 5], [66, 5], [61, 7], [61, 7], [69, 5]] },
  ] },
  { key: "big_do", keywords: ["大撅", "狠狠地撅"], count: 1, artworkStart: 1, frameCount: 10, delay: 50, portraits: [
    { source: 0, size: [60, 60], circle: true, fit: "square", angle: 65,
      positions: [[25, 21], [23, 20], [23, 19], [23, 19], [24, 20], [25, 22], [25, 22], [28, 24], [28, 25], [25, 23]] },
  ] },
  { key: "do", keywords: ["撅"], count: 2, frameCount: 3, delay: 50, portraits: [
    { source: 1, size: [112, 112], circle: true, fit: "cover", angle: 90, positions: [[2, 177], [12, 172], [6, 158]] },
    { source: 0, size: [122, 122], circle: true, fit: "cover", angle: 15, positions: [[116, -8], [109, 3], [130, -10]] },
  ] },
  { key: "little_do", keywords: ["小撅", "轻撅", "滑稽撅"], count: 2, frameCount: 7, delay: 50, portraits: [
    { source: 0, size: [21, 21], circle: true, fit: "square", positions: [[40, 4]] },
    { source: 1, size: [21, 21], circle: true, fit: "square", angle: 90, positions: [[6, 46]] },
  ] },
  { key: "masturbate", keywords: ["导", "打飞机"], count: 1, frameCount: 2, delay: 50, portraits: [
    { source: 0, size: [207, 178], circle: true, fit: "square", underArt: true, unmasked: true, positions: [[156, 17], null] },
    { source: 0, size: [194, 172], circle: true, fit: "square", underArt: true, unmasked: true, positions: [null, [159, 27]] },
  ] },
  { key: "nailoong_do", keywords: ["奶龙撅"], count: 1, artworkStart: 1, frameCount: 52, delay: 20, portraits: [
    { source: 0, size: [76, 76], angle: -45, underArt: true, positions: [
      [194, 87], [193, 86], [198, 78], [201, 73], [201, 71], [196, 68], [186, 76], [178, 89],
      [172, 103], [163, 113], [162, 113], [175, 107], [184, 98], [194, 90], [199, 84], [203, 80],
      [203, 80], [199, 82], [194, 91], [187, 102], [177, 119], [164, 140], [152, 142], [161, 141],
      [174, 132], [189, 121], [203, 109], [210, 101], [208, 93], [204, 90], [203, 90], [191, 97],
      [181, 105], [171, 118], [156, 135], [153, 138], [167, 134], [180, 122], [196, 113], [205, 107],
      [211, 96], [207, 93], [205, 92], [200, 98], [191, 107], [185, 124], [175, 136], [157, 140],
      [157, 140], [171, 136], [186, 128], [197, 117],
    ] },
  ] },
  { key: "oral_sex", keywords: ["口"], count: 2, frameCount: 2, delay: 50, portraits: [
    { source: 1, size: [48, 48], circle: true, fit: "cover", underArt: true, positions: [[67, 99], [71, 98]] },
    { source: 0, size: [58, 58], circle: true, fit: "cover", underArt: true, angle: 15, positions: [[30, 37], [36, 42]] },
  ] },
  { key: "spraypee", keywords: ["滋你"], count: 1, artworkStart: 1, frameCount: 30, delay: 40, portraits: [
    { source: 0, size: [185, 185], circle: true, underArt: true, positions: [[425, 261]] },
  ] },
] satisfies readonly FixedScene[];

function artAt(image: Image, x = 0, y = 0): Draw {
  return draw => draw.drawImage(image, x, y);
}

function avatarAt(image: Image, [x, y]: Point, [width, height]: Size,
  { angle = 0, circle, fit, expand = false }: {
    readonly angle?: number;
    readonly circle?: boolean;
    readonly fit?: "square" | "cover";
    readonly expand?: boolean;
  } = {}): Draw {
  const radians = -angle * Math.PI / 180;
  const radiusWidth = width / 2, radiusHeight = height / 2;
  const cosine = Math.abs(Math.cos(radians)), sine = Math.abs(Math.sin(radians));
  const spanWidth = width * cosine + height * sine, spanHeight = width * sine + height * cosine;
  const outX = expand ? Math.floor(radiusWidth - spanWidth / 2) : 0;
  const outY = expand ? Math.floor(radiusHeight - spanHeight / 2) : 0;
  return draw => {
    draw.save();
    draw.translate(x + radiusWidth - outX, y + radiusHeight - outY);
    draw.rotate(radians);
    draw.beginPath();
    if (circle) draw.ellipse(0, 0, radiusWidth, radiusHeight, 0, 0, 2 * Math.PI);
    else draw.rect(-radiusWidth, -radiusHeight, width, height);
    draw.clip();
    if (fit) drawAvatar(draw, image, { slot: [-radiusWidth, -radiusHeight, width, height], fit: fit === "square" ? "square" : undefined }, false);
    else {
      draw.imageSmoothingQuality = "high";
      draw.drawImage(image, -radiusWidth, -radiusHeight, width, height);
    }
    draw.restore();
  };
}

const empty: Draw = () => {};

function scaleDraw(drawFrame: Draw, scaleX: number, scaleY: number): Draw {
  return draw => {
    draw.scale(scaleX, scaleY);
    drawFrame(draw);
  };
}

function oldGifVisibility(pixels: Uint8Array) {
  // The original Pillow palette retained every color with nonzero resulting alpha.
  for (let index = 3; index < pixels.length; index += 4) pixels[index] = pixels[index] ? 255 : 0;
  return pixels;
}

function asset(key: string, index: number, context: MemeTemplateContext) {
  return context.imageAsset(`python/meme_generator/memes/${key}/archive/${index}.png`).then(loadImage);
}

async function sourceFrames(key: string, size: number, context: MemeTemplateContext, start = 0) {
  return Promise.all(Array.from({ length: size }, (_, index) => asset(key, start + index, context)));
}

async function sample(count: number, context: MemeTemplateContext) {
  const avatar = await previewImage(context.signal);
  return { images: Array<File>(count).fill(avatar), texts: [], args: {} };
}

function fixedTemplate(scene: FixedScene): MemeTemplate {
  const { key, keywords, count, frameCount, delay, artworkStart, portraits } = scene;
  const template: MemeTemplate = {
    info: { key, keywords, params_type: { min_images: count, max_images: count, min_texts: 0, max_texts: 0, default_texts: [], args_type: null } },
    async render({ images }, context) {
      const { signal } = context;
      const [artwork, avatars] = await Promise.all([
        sourceFrames(key, frameCount, context, artworkStart),
        Promise.all(images.map(image => readMemeFirstImage(image, signal))),
      ]);
      const { width, height } = artwork[0]!;
      const raster = rgbaFrameDimensions(width, height);
      const frames = artwork.map((art, index) => ({ value: { art, index }, delayMs: delay }));
      async function renderFrame({ art, index }: { art: Image; index: number }, outputWidth: number, outputHeight: number) {
        const scale = (layer: Draw) => scaleDraw(layer, raster.scale * outputWidth / raster.width, raster.scale * outputHeight / raster.height);
        const under: Draw[] = [], over: Draw[] = [];
        let unmasked: Draw | undefined;
        for (const entry of portraits) {
          const position = entry.positions.length === 1 ? entry.positions[0] : entry.positions[index];
          if (!position) continue;
          const paint = scale(avatarAt(avatars[entry.source]!, position, entry.size, entry));
          if (entry.unmasked) unmasked = paint;
          else (entry.underArt ? under : over).push(paint);
        }
        const scenery = scale(artAt(art));
        const base = unmasked ?? (under.length ? empty : scenery);
        const masks = unmasked || under.length ? [...under, scenery, ...over] : over;
        return oldGifVisibility(await renderMaskedRgba(outputWidth, outputHeight, base, masks, signal));
      }
      async function* coalescedFrames() {
        let previous: { rgba: Buffer; delayMs: number } | undefined;
        for (const { value, delayMs } of frames) {
          const pixels = await renderFrame(value, raster.width, raster.height);
          const rgba = Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength);
          if (previous?.rgba.equals(rgba)) previous.delayMs += delayMs;
          else {
            if (previous) yield previous;
            previous = { rgba, delayMs };
          }
        }
        if (previous) yield previous;
      }
      try {
        return await encodeMemeGifStream(raster.width, raster.height, frames.length, coalescedFrames(), signal);
      } catch (error) {
        if (!(error instanceof MemeGifByteLimitError || error instanceof MemeGifDimensionLimitError)) throw error;
      }
      return renderPythonGif({ ...raster, signal, frames, renderFrame });
    },
    async preview(context) { return template.render(await sample(count, context), context); },
  };
  return template;
}

function roundEven(value: number) {
  const lower = Math.floor(value);
  return value - lower === 0.5 && lower % 2 === 0 ? lower : Math.round(value);
}

function loopingTemplate(key: string, keywords: readonly string[], frameCount: number, delay: number): MemeTemplate {
  const template: MemeTemplate = {
    info: { key, keywords, params_type: { min_images: 1, max_images: 1, min_texts: 0, max_texts: 0, default_texts: [], args_type: null } },
    async render({ images }, context) {
      const { signal } = context;
      const [art, source] = await Promise.all([sourceFrames(key, frameCount, context), readMemeImageSequence(images[0]!, signal)]);
      const overlay = art[0]!, first = source.frames[0];
      const ratio = Math.max(overlay.width / first.width, overlay.height / first.height);
      const width = key === "shoot" ? 160 : roundEven(first.width * ratio);
      const height = key === "shoot" ? 97 : roundEven(first.height * ratio);
      const x = key === "shoot" ? 0 : Math.floor((width - overlay.width) / 2);
      const y = key === "shoot" ? 0 : height - overlay.height;
      const raster = rgbaFrameDimensions(width, height);
      return renderPythonGif({
        ...raster, signal, frames: timedOverlayTimeline(source, frameCount, delay, "extend-loop"),
        async renderFrame({ image, overlay: index }, outputWidth, outputHeight) {
          const scale = (layer: Draw) => scaleDraw(layer, raster.scale * outputWidth / raster.width, raster.scale * outputHeight / raster.height);
          const source = scale(draw => drawAvatar(draw, image, { slot: [0, 0, width, height] }, false));
          return oldGifVisibility(await renderMaskedRgba(outputWidth, outputHeight, source, [scale(artAt(art[index]!, x, y))], signal));
        },
      });
    },
    async preview(context) { return template.render(await sample(1, context), context); },
  };
  return template;
}

const stillOrAnimated: MemeTemplate = {
  info: { key: "moistening_water", keywords: ["滋水"], params_type: { min_images: 1, max_images: 1, min_texts: 0, max_texts: 1, default_texts: [], args_type: null } },
  async render({ images }, context) {
    const { signal } = context;
    const [art, source] = await Promise.all([asset("moistening_water", 0, context), readMemeImageSequence(images[0]!, signal)]);
    const raster = rgbaFrameDimensions(art.width, art.height);
    const paint = (image: Image, width: number, height: number) => {
      const scale = (layer: Draw) => scaleDraw(layer, raster.scale * width / raster.width, raster.scale * height / raster.height);
      const photo = avatarAt(image, [485, 290], [165, 125], { angle: -25, expand: true });
      return renderMaskedRgba(width, height, empty, [scale(photo), scale(artAt(art))], signal);
    };
    if (source.frames.length === 1) {
      const { width, height } = raster;
      const rgba = await paint(source.frames[0], width, height);
      return (await renderExactPng(width, height, draw => draw.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0))).png;
    }
    const delayMs = Math.floor(source.averageDelayMs / 10) * 10;
    return renderPythonGif({
      ...raster, signal, frames: source.frames.map(value => ({ value, delayMs })),
      async renderFrame(value, width, height) { return oldGifVisibility(await paint(value, width, height)); },
    });
  },
  async preview(context) { return stillOrAnimated.render(await sample(1, context), context); },
};

export const legacyArchiveOverlayTemplates = [
  ...fixedScenes.map(fixedTemplate),
  loopingTemplate("jerk_off", ["打胶"], 8, 100),
  loopingTemplate("shoot", ["射", "🐍"], 13, 150),
  stillOrAnimated,
];
