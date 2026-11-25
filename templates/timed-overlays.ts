import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("meme", messageCatalog.messages);
// Poses and timings from MemeCrafters/meme-generator v0.1.14.
// https://github.com/MemeCrafters/meme-generator/tree/619fa10518fc2eca4fa1053af37f0a00a839f062/meme_generator/memes
import { renderExactPng } from "../../../packages/skia/index.ts";
import { loadImage, type Image } from "skia-canvas";
import type { MemeTemplate, MemeTemplateContext, MemeTemplateInput } from "../builtin-template.ts";
import { alignMemeLoop, readMemeFirstImage, readMemeImageSequence, type MemeImageSequence } from "./animated-input.ts";
import { drawAvatar } from "./avatar-slot.ts";
import { assertMemeGifDimensions, encodeMemeGifStream, MemeGifByteLimitError, MemeGifDimensionLimitError } from "./gif.ts";
import { renderMaskedRgba } from "./masked-layout.ts";
import { screenProjection, type ProjectiveQuad } from "./projective-transform.ts";
import { renderPythonGif } from "./python-gif.ts";
import { previewImage, type Draw } from "./template-layout.ts";

type Point = readonly [x: number, y: number];
type Box = readonly [x: number, y: number, width: number, height: number];
type Projection = readonly [quad: ProjectiveQuad, position: Point];
type Alignment = "first-frame" | "extend-first" | "extend-last" | "extend-loop" | "no-extend";
type FramePhoto = (photo: Image, args: MemeTemplateInput["args"]) => readonly Draw[];

interface Spec {
  readonly key: string;
  readonly keywords: readonly string[];
  readonly tags?: readonly string[];
  readonly cadence: number;
  readonly alignment?: Alignment;
  readonly above?: boolean;
  readonly circleOption?: boolean;
  readonly frameCount: number;
  readonly artCount?: number;
  readonly preparation?: Point;
  artIndex?(frame: number): number | undefined;
  photo(frame: number): FramePhoto | undefined;
}

const hit: readonly Projection[] = [
  [[[1, 10], [138, 1], [140, 119], [7, 154]], [32, 37]],
  [[[1, 10], [138, 1], [140, 121], [7, 154]], [32, 37]],
  [[[1, 10], [138, 1], [139, 125], [10, 159]], [32, 37]],
  [[[1, 12], [136, 1], [137, 125], [8, 159]], [34, 37]],
  [[[1, 9], [137, 1], [139, 122], [9, 154]], [35, 41]],
  [[[1, 8], [144, 1], [144, 123], [12, 155]], [30, 45]],
  [[[1, 8], [140, 1], [141, 121], [10, 155]], [29, 49]],
  [[[1, 9], [140, 1], [139, 118], [10, 153]], [27, 53]],
  [[[1, 7], [144, 1], [145, 117], [13, 153]], [19, 57]],
  [[[1, 7], [144, 1], [143, 116], [13, 153]], [19, 57]],
  [[[1, 8], [139, 1], [141, 119], [12, 154]], [19, 55]],
  [[[1, 13], [140, 1], [143, 117], [12, 156]], [16, 57]],
  [[[1, 10], [138, 1], [142, 117], [11, 149]], [14, 61]],
  [[[1, 10], [141, 1], [148, 125], [13, 153]], [11, 57]],
  [[[1, 12], [141, 1], [147, 130], [16, 150]], [11, 60]],
  [[[1, 15], [165, 1], [175, 135], [1, 171]], [-6, 46]],
];

const play: readonly Box[] = [
  ...Array<Box>(36).fill([194, 204, 121, 108]),
  [192, 203, 125, 111], [182, 200, 141, 126], [161, 188, 178, 159], [129, 171, 235, 209], [98, 155, 290, 258],
  [98, 155, 290, 258], [58, 133, 361, 321], [45, 126, 384, 342], [45, 126, 384, 342], [35, 121, 402, 358],
  [27, 117, 415, 370], [17, 111, 433, 386], [14, 110, 439, 391], [14, 110, 439, 391], [11, 108, 444, 395], [10, 108, 446, 397],
  ...Array<Box>(8).fill([7, 106, 451, 402]),
];

const nahida: readonly Box[] = [
  [123, 356, 158, 124], [123, 356, 158, 124], [123, 355, 158, 125], [122, 352, 159, 128], [122, 350, 159, 130],
  [122, 348, 159, 132], [122, 345, 159, 135], [121, 343, 160, 137], [121, 342, 160, 138], [121, 341, 160, 139],
  [121, 341, 160, 139], [121, 342, 160, 138], [121, 344, 160, 136], [121, 346, 160, 134], [122, 349, 159, 131],
  [122, 351, 159, 129], [122, 353, 159, 127], [123, 355, 158, 125],
];

const tight: readonly Box[] = [
  [39, 169, 267, 141], [40, 167, 264, 143], [38, 174, 270, 135], [40, 167, 264, 143], [38, 174, 270, 135],
  [40, 167, 264, 143], [38, 174, 270, 135], [40, 167, 264, 143], [38, 174, 270, 135], [28, 176, 293, 134],
  [5, 215, 333, 96], [10, 210, 321, 102], [3, 210, 330, 104], [4, 210, 328, 102],
  ...Array<Box>(5).fill([4, 212, 328, 100]), [29, 195, 285, 120],
];

const kirby: readonly Point[] = [
  [318, 163], [319, 173], [320, 183], [317, 193], [312, 199], [297, 212], [289, 218], [280, 224], [278, 223], [278, 220],
  [280, 215], [280, 213], [280, 210], [280, 206], [280, 201], [280, 192], [280, 188], [280, 184], [280, 179],
];
const arona: readonly Point[] = [
  [270, 295], [154, 291], [154, 291], [89, 211], [41, 195], [28, 192], [16, 200], [-10, 206],
  [-40, 210], [-80, 214], [324, 245], [324, 256], [331, 251], [331, 251], [318, 260], [318, 260],
];
const extraArona: readonly Point[] = [[324, 15], [324, 106], [324, 161], [324, 192]];

function cover(box: Box): FramePhoto {
  return photo => [draw => drawAvatar(draw, photo, { slot: box }, false)];
}

function stretch([x, y, width, height]: Box): FramePhoto {
  return photo => [draw => {
    draw.imageSmoothingQuality = "high";
    draw.drawImage(photo, x, y, width, height);
  }];
}

function circle(photo: Image, [x, y]: Point, size: number): Draw {
  return draw => {
    draw.beginPath();
    draw.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    draw.clip();
    drawAvatar(draw, photo, { slot: [x, y, size, size] }, false);
  };
}

function projected([quad, [x, y]]: Projection): FramePhoto {
  const xs = quad.map(([left]) => left), ys = quad.map(([, top]) => top);
  const width = Math.max(...xs) - Math.min(...xs), height = Math.max(...ys) - Math.min(...ys);
  return photo => [draw => {
    draw.translate(x, y);
    draw.beginPath();
    draw.rect(0, 0, width, height);
    draw.clip();
    draw.setTransform(draw.getTransform().multiply(screenProjection(photo.width, photo.height, quad)));
    draw.imageSmoothingQuality = "high";
    draw.drawImage(photo, 0, 0);
  }];
}

function spinning([x, y, width, height]: Box, radians: number): FramePhoto {
  return photo => [draw => {
    draw.beginPath();
    draw.rect(x, y, width, height);
    draw.clip();
    // Rotate inside the original rectangular canvas before resizing it to the square slot.
    draw.translate(x + width / 2, y + height / 2);
    draw.scale(width / photo.width, height / photo.height);
    draw.rotate(radians);
    draw.imageSmoothingQuality = "high";
    draw.drawImage(photo, -photo.width / 2, -photo.height / 2);
  }];
}

const specs: readonly Spec[] = [
  { key: "hit_screen", keywords: ["打穿", "打穿屏幕"], cadence: 200, frameCount: 29, alignment: "extend-first", preparation: [140, 120],
    photo: index => index >= 6 && index < 22 ? projected(hit[index - 6]!) : undefined },
  { key: "play_together", keywords: ["一起玩"], tags: ["碧蓝档案", "蔚蓝档案"], cadence: 60, frameCount: 60, alignment: "extend-last",
    photo: index => cover(play[index]!) },
  { key: "rip_clothes", keywords: ["撕衣服"], cadence: 100, frameCount: 20, artCount: 16, alignment: "extend-last",
    artIndex: index => index < 16 ? index : undefined, photo: () => cover([0, 0, 480, 270]) },
  { key: "nahida_bite", keywords: ["纳西妲啃", "草神啃"], tags: ["草神", "米哈游", "原神", "纳西妲"], cadence: 100, frameCount: 38,
    preparation: [160, 140], photo: index => stretch(nahida[index % nahida.length]!) },
  { key: "tightly", keywords: ["紧贴", "紧紧贴着"], cadence: 80, frameCount: 20, preparation: [640, 400],
    photo: index => stretch(tight[index]!) },
  { key: "listen_music", keywords: ["听音乐"], cadence: 50, frameCount: 36, artCount: 1,
    artIndex: () => 0, photo: index => spinning([100, 100, 215, 215], index * Math.PI / 18) },
  { key: "washer", keywords: ["洗衣机"], cadence: 100, frameCount: 12, artCount: 1,
    artIndex: () => 0, photo: index => spinning([63, 56, 74, 74], index * Math.PI / 6) },
  { key: "kirby_hammer", keywords: ["卡比锤", "卡比重锤"], tags: ["星之卡比"], cadence: 50, frameCount: 62,
    alignment: "extend-loop", above: true, circleOption: true,
    photo(index) {
      if (index > 39) return undefined;
      const point = kirby[Math.min(index, 18)]!;
      return (photo, args) => {
        if (args.circle === true) return [circle(photo, point, 80)];
        const w = Math.max(80, Math.trunc(photo.width * 80 / photo.height));
        const [x, y] = point;
        return cover([x + 40 - Math.floor(w / 2), y, w, 80])(photo, args);
      };
    } },
  { key: "arona_throw", keywords: ["阿罗娜扔"], tags: ["阿罗娜", "碧蓝档案", "蔚蓝档案"], cadence: 40, frameCount: 16,
    alignment: "no-extend", above: true,
    photo: index => photo => [arona[index]!, ...(extraArona[index - 6] ? [extraArona[index - 6]!] : [])].map(point => circle(photo, point, 120)) },
];

const circleHelp = $t("templates.timed-overlays.text_bd6b1d72aa");
const circleArgs = {
  args_model: { properties: { circle: { type: "boolean", default: false, description: circleHelp } } },
  args_examples: [{ circle: false }, { circle: true }],
  parser_options: [{ names: ["--circle", $t("templates.timed-overlays.text_82d06faea1")], dest: "circle", args: [], default: false, action: { type: 0, value: true }, help_text: circleHelp }],
};

export function timedOverlayTimeline(source: MemeImageSequence, count: number, step: number, policy: Alignment) {
  if (policy === "extend-loop") return alignMemeLoop(source, count, step).map(value => ({ value, delayMs: step }));
  const sourceDuration = source.frames.length * source.averageDelayMs;
  const difference = sourceDuration - count * step;
  const padding = (policy === "extend-first" || policy === "extend-last") && difference >= step ? Math.ceil(difference / step) : 0;
  const length = count + padding;
  // The shared GIF budget handles normal timelines. Bound expansion before allocating an adversarial one.
  const output = length <= 1_000 ? length : 100;
  const start = policy === "extend-first" ? padding : 0;
  return Array.from({ length: output }, (_, i) => {
    const frame = Math.floor(i * length / output);
    const next = Math.floor((i + 1) * length / output);
    const overlay = Math.min(count - 1, Math.max(0, frame - start));
    const current = source.frames.length === 1 ? 0 : Math.floor((frame * step % sourceDuration) / source.averageDelayMs);
    return { value: { overlay, image: source.frames[current]! }, delayMs: (next - frame) * step };
  });
}

async function readArt(key: string, count: number, context: MemeTemplateContext) {
  const images: Image[] = [];
  const digits = String(count - 1).length;
  for (let from = 0; from < count; from += 8) {
    context.signal.throwIfAborted();
    images.push(...await Promise.all(Array.from({ length: Math.min(count - from, 8) }, (_, offset) => {
      const name = String(from + offset).padStart(digits, "0");
      return context.imageAsset(`${key}/${name}.png`).then(loadImage);
    })));
  }
  const { width, height } = images[0]!;
  if (images.some(image => image.width !== width || image.height !== height)) throw new Error($t("templates.timed-overlays.text_bc92350be8", { "key": key }));
  return { images, width, height };
}

function template(spec: Spec): MemeTemplate {
  const { key, cadence, frameCount, artCount = frameCount, artIndex, alignment = "first-frame", preparation } = spec;
  async function render({ images, texts, args }: MemeTemplateInput, context: MemeTemplateContext) {
    if (images.length !== 1 || texts.length) throw new Error($t("templates.timed-overlays.text_2646e324ad"));
    const { signal } = context;
    const [source, art] = await Promise.all([
      alignment === "first-frame" ? readMemeFirstImage(images[0]!, signal).then(image => ({ frames: [image] as const, averageDelayMs: 0 }))
        : readMemeImageSequence(images[0]!, signal),
      readArt(key, artCount, context),
    ]);
    const { width, height } = art;
    const frames = timedOverlayTimeline(source, frameCount, cadence, alignment);
    const prepared = new WeakMap<Image, Promise<Image>>();
    function photoFor(image: Image) {
      if (!preparation) return image;
      const cached = prepared.get(image);
      if (cached) return cached;
      const [w, h] = preparation;
      const task = renderExactPng(w, h, cover([0, 0, w, h])(image, args)[0]!).then(({ png }) => loadImage(png));
      prepared.set(image, task);
      return task;
    }
    async function renderFrame({ overlay, image }: typeof frames[number]["value"], outWidth: number, outHeight: number) {
      const index = artIndex ? artIndex(overlay) : overlay;
      const current = index === undefined ? undefined : art.images[index];
      const scale = (paint: Draw): Draw => draw => { draw.scale(outWidth / width, outHeight / height); paint(draw); };
      const artwork = current && scale(draw => draw.drawImage(current, 0, 0));
      const definition = spec.photo(overlay);
      const photos = definition ? definition(await photoFor(image), args).map(scale) : [];
      const base = (spec.above ? artwork : photos[0]) ?? artwork ?? (() => {});
      const layers = spec.above ? photos : artwork && photos.length ? [artwork] : [];
      const rgba = await renderMaskedRgba(outWidth, outHeight, base, layers, signal);
      for (let i = 3; i < rgba.length; i += 4) rgba[i] = rgba[i] ? 255 : 0;
      return rgba;
    }

    let requiresStreaming = false;
    try {
      assertMemeGifDimensions(width, height, frames.length);
    } catch (error) {
      if (!(error instanceof MemeGifDimensionLimitError)) throw error;
      requiresStreaming = true;
    }
    if (requiresStreaming) {
      async function* originals() {
        for (const { value, delayMs } of frames) yield { rgba: await renderFrame(value, width, height), delayMs };
      }
      try {
        return await encodeMemeGifStream(width, height, frames.length, originals(), signal);
      } catch (error) {
        if (!(error instanceof MemeGifDimensionLimitError || error instanceof MemeGifByteLimitError)) throw error;
      }
    }
    return renderPythonGif({ width, height, frames, signal, renderFrame });
  }
  return {
    info: { key, keywords: spec.keywords, tags: spec.tags, params_type: {
      min_images: 1, max_images: 1, min_texts: 0, max_texts: 0, default_texts: [], args_type: spec.circleOption ? circleArgs : null,
    } }, render,
    async preview(context) {
      return render({ images: [await previewImage(context.signal)], texts: [], args: {} }, context);
    },
  };
}

export const timedOverlayMemeTemplates = specs.map(template);
