// Fixed poses and timing from MemeCrafters/meme-generator v0.1.14.
import { renderExactPng, renderRgba } from "../../../packages/skia/index.ts";
import { ImageData, loadImage, type Image } from "skia-canvas";
import type { MemeTemplate, MemeTemplateContext, MemeTemplateInput } from "../builtin-template.ts";
import { readMemeFirstImage, readMemeImageSequence } from "./animated-input.ts";
import { drawAvatar } from "./avatar-slot.ts";
import { assertMemeGifDimensions, encodeMemeGifStream, MemeGifByteLimitError, MemeGifDimensionLimitError } from "./gif.ts";
import { renderMaskedRgba } from "./masked-layout.ts";
import { screenProjection, type ProjectiveQuad } from "./projective-transform.ts";
import { renderPythonGif } from "./python-gif.ts";
import { previewImage, type Draw } from "./template-layout.ts";
import { timedOverlayTimeline } from "./timed-overlays.ts";

type Point = readonly [x: number, y: number];
type Pose = readonly [position: Point, quad: ProjectiveQuad];

const drawPoses: readonly Pose[] = [
  [[30, 16], [[27, 0], [207, 12], [179, 142], [0, 117]]],
  [[34, 17], [[28, 0], [207, 13], [180, 137], [0, 117]]],
];
const ripFull: readonly Pose[] = [
  [[61, 196], [[140, 68], [0, 59], [33, 0], [165, 8]]],
  [[63, 196], [[136, 68], [0, 59], [29, 0], [158, 13]]],
  [[62, 195], [[137, 72], [0, 58], [27, 0], [167, 11]]],
  [[95, 152], [[0, 8], [155, 0], [163, 107], [13, 112]]],
  [[108, 129], [[0, 6], [128, 0], [136, 113], [10, 117]]],
  [[84, 160], [[0, 6], [184, 0], [190, 90], [10, 97]]],
];
const ripSplit: readonly (readonly [Pose, Pose])[] = [
  [
    [[78, 158], [[0, 3], [86, 0], [97, 106], [16, 106]]],
    [[195, 156], [[0, 4], [82, 0], [85, 106], [15, 110]]],
  ],
  [
    [[89, 156], [[0, 0], [80, 0], [94, 100], [14, 100]]],
    [[192, 151], [[0, 7], [79, 3], [82, 107], [11, 112]]],
  ],
];
const candy: readonly Pose[] = [
  [[172, 124], [[72, 0], [72, 75], [0, 75], [0, 0]]],
  [[172, 124], [[72, 0], [72, 75], [0, 75], [0, 0]]],
  [[173, 122], [[74, 0], [74, 77], [0, 77], [0, 0]]],
  [[177, 124], [[72, 0], [72, 76], [0, 76], [0, 0]]],
  [[184, 120], [[62, 0], [67, 74], [5, 78], [0, 4]]],
  [[195, 120], [[64, 0], [64, 75], [0, 75], [0, 0]]],
  [[212, 120], [[58, 0], [58, 74], [0, 74], [0, 0]]],
  [[238, 120], [[63, 6], [55, 80], [0, 74], [8, 0]]],
  [[216, 130], [[86, 31], [40, 90], [0, 59], [46, 0]]],
  [[195, 152], [[91, 38], [30, 86], [0, 48], [61, 0]]],
  [[160, 156], [[89, 35], [25, 80], [0, 45], [64, 0]]],
  [[118, 134], [[87, 28], [32, 92], [0, 64], [55, 0]]],
  [[88, 109], [[73, 16], [36, 98], [0, 82], [37, 0]]],
  [[71, 89], [[54, 5], [44, 98], [0, 93], [10, 0]]],
  [[56, 74], [[34, 0], [45, 94], [11, 98], [0, 4]]],
  [[39, 62], [[33, 0], [59, 97], [26, 106], [0, 9]]],
  [[24, 54], [[44, 0], [80, 98], [36, 114], [0, 16]]],
  [[-1, 46], [[85, 0], [116, 100], [31, 126], [0, 26]]],
  [[-1, 46], [[85, 0], [116, 100], [31, 126], [0, 26]]],
  [[24, 54], [[44, 0], [80, 98], [36, 114], [0, 16]]],
  [[24, 54], [[44, 0], [80, 98], [36, 114], [0, 16]]],
  [[-1, 46], [[85, 0], [116, 100], [31, 126], [0, 26]]],
  [[-1, 46], [[85, 0], [116, 100], [31, 126], [0, 26]]],
  [[20, 45], [[44, 0], [77, 98], [33, 113], [0, 15]]],
  [[20, 45], [[44, 0], [77, 98], [33, 113], [0, 15]]],
  [[-1, 36], [[85, 0], [116, 100], [31, 126], [0, 26]]],
  [[-1, 34], [[85, 0], [116, 100], [31, 126], [0, 26]]],
  [[20, 35], [[44, 0], [77, 98], [33, 113], [0, 15]]],
  [[20, 35], [[44, 0], [77, 98], [33, 113], [0, 15]]],
  [[-1, 28], [[85, 0], [116, 100], [31, 126], [0, 26]]],
  [[-1, 28], [[85, 0], [116, 100], [31, 126], [0, 26]]],
  [[10, 30], [[42, 0], [75, 96], [33, 110], [0, 14]]],
  [[14, 32], [[34, 0], [67, 96], [33, 108], [0, 12]]],
  [[14, 37], [[38, 0], [69, 90], [31, 103], [0, 13]]],
  [[8, 59], [[42, 0], [73, 91], [31, 105], [0, 14]]],
  [[37, 111], [[48, 0], [76, 84], [28, 100], [0, 16]]],
  [[76, 125], [[55, 0], [80, 84], [25, 100], [0, 16]]],
  [[105, 129], [[56, 0], [79, 79], [23, 95], [0, 16]]],
  [[124, 128], [[59, 0], [82, 76], [23, 94], [0, 18]]],
  [[139, 125], [[60, 0], [81, 75], [21, 92], [0, 17]]],
  [[148, 121], [[63, 0], [85, 73], [22, 92], [0, 19]]],
  [[156, 119], [[62, 0], [82, 73], [20, 90], [0, 17]]],
  [[163, 120], [[63, 0], [78, 73], [15, 86], [0, 13]]],
  [[166, 119], [[65, 0], [81, 73], [16, 87], [0, 14]]],
  [[173, 122], [[55, 0], [66, 77], [11, 85], [0, 8]]],
  [[172, 122], [[48, 0], [64, 73], [16, 83], [0, 10]]],
  [[172, 125], [[40, 0], [59, 70], [19, 81], [0, 11]]],
  [[176, 126], [[27, 0], [48, 70], [21, 78], [0, 8]]],
  [[176, 128], [[23, 0], [47, 68], [24, 76], [0, 8]]],
  [[170, 128], [[24, 0], [51, 67], [27, 77], [0, 10]]],
  [[162, 130], [[23, 0], [57, 65], [34, 77], [0, 12]]],
  [[156, 132], [[24, 0], [60, 63], [36, 77], [0, 14]]],
  [[152, 132], [[27, 0], [65, 63], [38, 79], [0, 16]]],
  [[144, 129], [[37, 0], [77, 63], [40, 86], [0, 23]]],
  [[135, 132], [[41, 0], [85, 60], [44, 90], [0, 30]]],
  [[127, 130], [[46, 0], [94, 58], [48, 96], [0, 38]]],
  [[124, 126], [[60, 0], [103, 61], [43, 103], [0, 42]]],
  [[126, 126], [[59, 0], [101, 60], [42, 101], [0, 41]]],
  [[131, 122], [[64, 0], [100, 65], [36, 101], [0, 36]]],
  [[136, 120], [[61, 0], [96, 67], [35, 99], [0, 32]]],
  [[143, 119], [[63, 0], [93, 70], [30, 97], [0, 27]]],
  [[150, 119], [[69, 0], [91, 70], [22, 92], [0, 22]]],
  [[158, 120], [[67, 0], [83, 72], [16, 87], [0, 15]]],
  [[156, 119], [[62, 0], [82, 73], [20, 90], [0, 17]]],
  [[165, 119], [[67, 0], [79, 73], [12, 84], [0, 11]]],
  [[166, 119], [[65, 0], [81, 73], [16, 87], [0, 14]]],
  [[173, 122], [[55, 0], [66, 77], [11, 85], [0, 8]]],
  [[172, 122], [[48, 0], [64, 73], [16, 83], [0, 10]]],
  [[172, 125], [[40, 0], [59, 70], [19, 81], [0, 11]]],
  [[176, 126], [[27, 0], [48, 70], [21, 78], [0, 8]]],
  [[176, 128], [[23, 0], [47, 68], [24, 76], [0, 8]]],
  [[170, 128], [[24, 0], [51, 67], [27, 77], [0, 10]]],
  [[155, 132], [[21, 0], [60, 64], [39, 77], [0, 13]]],
  [[149, 135], [[23, 0], [63, 62], [40, 77], [0, 15]]],
  [[141, 133], [[31, 0], [72, 62], [41, 82], [0, 20]]],
  [[136, 133], [[37, 0], [78, 62], [41, 86], [0, 24]]],
  [[130, 130], [[46, 0], [87, 62], [41, 93], [0, 31]]],
  [[127, 128], [[52, 0], [93, 62], [41, 97], [0, 35]]],
  [[127, 124], [[58, 0], [99, 62], [41, 101], [0, 39]]],
  [[129, 124], [[58, 0], [98, 62], [40, 100], [0, 38]]],
  [[135, 122], [[60, 0], [95, 65], [35, 97], [0, 32]]],
  [[143, 118], [[64, 0], [94, 68], [30, 96], [0, 28]]],
  [[152, 120], [[64, 0], [85, 71], [21, 90], [0, 19]]],
  [[160, 119], [[69, 0], [83, 73], [14, 86], [0, 13]]],
  [[172, 125], [[76, 0], [76, 73], [0, 73], [0, 0]]],
  [[172, 125], [[76, 0], [76, 73], [0, 73], [0, 0]]],
  [[172, 125], [[76, 0], [76, 73], [0, 73], [0, 0]]],
  [[172, 125], [[76, 0], [76, 73], [0, 73], [0, 0]]],
  [[172, 125], [[76, 0], [76, 73], [0, 73], [0, 0]]],
  [[172, 125], [[76, 0], [76, 73], [0, 73], [0, 0]]],
  [[172, 125], [[76, 0], [76, 73], [0, 73], [0, 0]]],
];

const capooTags = ["猫猫虫", "咖波"] as const;
type Key = "capoo_draw" | "capoo_rip" | "capoo_stew" | "shiroko_pero" | "lick_candy";

interface Spec {
  readonly key: Key;
  readonly keywords: readonly string[];
  readonly tags?: readonly string[];
  readonly artCount: number;
  readonly delay: number;
  readonly animation?: "extend-loop" | "extend-first";
  readonly sequence?: readonly number[];
}
const specs: readonly Spec[] = [
  { key: "capoo_draw", keywords: ["咖波画"], tags: capooTags, artCount: 6, delay: 100,
    sequence: [0, 1, 2, 1, 2, 1, 2, 1, 2, 3, 4, 5, 4, 5, 4, 5, 4, 5, 4, 5, 4, 5] },
  { key: "capoo_rip", keywords: ["咖波撕"], tags: capooTags, artCount: 8, delay: 100,
    sequence: [0, 1, 2, 0, 1, 2, 0, 1, 2, 3, 4, 5, 6, 7, 7] },
  { key: "capoo_stew", keywords: ["咖波炖"], tags: capooTags, artCount: 5, delay: 80, animation: "extend-loop" },
  { key: "shiroko_pero", keywords: ["白子舔"], tags: ["碧蓝档案", "蔚蓝档案", "砂狼白子"],
    artCount: 4, delay: 60, animation: "extend-loop" },
  { key: "lick_candy", keywords: ["舔糖", "舔棒棒糖"], artCount: 91, delay: 30, animation: "extend-first" },
];

function project(photo: Image, [[x, y], quad]: Pose): Draw {
  const xs = quad.map(([left]) => left), ys = quad.map(([, top]) => top);
  const width = Math.max(...xs) - Math.min(...xs), height = Math.max(...ys) - Math.min(...ys);
  const matrix = screenProjection(photo.width, photo.height, quad);
  return draw => {
    draw.translate(x, y);
    draw.beginPath();
    draw.rect(0, 0, width, height);
    draw.clip();
    draw.setTransform(draw.getTransform().multiply(matrix));
    draw.imageSmoothingQuality = "high";
    draw.drawImage(photo, 0, 0);
  };
}

function roundClip(draw: Parameters<Draw>[0], x: number, y: number, size: number) {
  draw.beginPath();
  draw.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  draw.clip();
}

async function prepareImage(key: Key, photo: Image) {
  const widths = { capoo_draw: 175, capoo_rip: 150, capoo_stew: 80, shiroko_pero: 245, lick_candy: 76 };
  const heights = { capoo_draw: 120, capoo_rip: 100, capoo_stew: 80, shiroko_pero: 245, lick_candy: 76 };
  const width = widths[key], height = heights[key];
  const { png } = await renderExactPng(width, height, draw => {
    if (key === "capoo_stew") roundClip(draw, 0, 0, width);
    if (key === "lick_candy") {
      roundClip(draw, 0, 0, width);
      draw.translate(width / 2, height / 2);
      draw.rotate(-Math.PI / 2);
      draw.imageSmoothingQuality = "high";
      draw.drawImage(photo, -width / 2, -height / 2, width, height);
    } else {
      drawAvatar(draw, photo, { slot: [0, 0, width, height] }, false);
    }
  });
  return loadImage(png);
}

async function readFrames(spec: Spec, context: MemeTemplateContext) {
  const art: Image[] = [];
  const digits = String(spec.artCount - 1).length;
  for (let from = 0; from < spec.artCount; from += 8) {
    context.signal.throwIfAborted();
    art.push(...await Promise.all(Array.from({ length: Math.min(8, spec.artCount - from) }, (_, offset) => {
      const index = String(from + offset).padStart(digits, "0");
      return context.imageAsset(`${spec.key}/${index}.png`).then(loadImage);
    })));
  }
  const { width, height } = art[0]!;
  if (art.some(frame => frame.width !== width || frame.height !== height)) throw new Error(`表情模板 ${spec.key} 的帧尺寸不一致。`);
  return { art, width, height };
}

function blendBottom(upper: Buffer, bottom: Buffer) {
  for (let pixel = 0; pixel < upper.length; pixel += 4) {
    const mask = upper[pixel + 3]!;
    const ratio = 255 - mask;
    for (let channel = pixel; channel < pixel + 4; channel++) {
      upper[channel] = Math.round((upper[channel]! * mask + bottom[channel]! * ratio) / 255);
    }
  }
  return upper;
}

async function applyShape(photo: Image, mask: Uint8Array, signal: AbortSignal) {
  const { width, height } = photo;
  signal.throwIfAborted();
  const { rgba } = await renderRgba(width, height, draw => draw.drawImage(photo, 0, 0));
  for (let pixel = 0; pixel < rgba.length; pixel += 4) {
    const alpha = mask[pixel + 3]!;
    for (let channel = pixel; channel < pixel + 4; channel++) rgba[channel] = Math.round(rgba[channel]! * alpha / 255);
  }
  const pixels = new ImageData(new Uint8ClampedArray(rgba), width, height);
  return loadImage((await renderExactPng(width, height, draw => draw.putImageData(pixels, 0, 0))).png);
}

async function readMask(context: MemeTemplateContext) {
  const image = await context.imageAsset("shiroko_pero/mask.png").then(loadImage);
  if (image.width !== 245 || image.height !== 245) throw new Error("白子舔的原遮罩尺寸不一致。");
  return (await renderRgba(245, 245, draw => draw.drawImage(image, 0, 0))).rgba;
}

function create(spec: Spec): MemeTemplate {
  async function render({ images, texts }: MemeTemplateInput, context: MemeTemplateContext) {
    if (images.length !== 1 || texts.length) throw new Error("该表情需要一张图片。");
    const { signal } = context;
    const [{ art, width, height }, source, shape] = await Promise.all([
      readFrames(spec, context),
      spec.animation ? readMemeImageSequence(images[0]!, signal) : readMemeFirstImage(images[0]!, signal).then(image => ({
        frames: [image] as const, averageDelayMs: 0,
      })),
      spec.key === "shiroko_pero" ? readMask(context) : undefined,
    ]);
    const sequence = spec.sequence ?? Array.from({ length: spec.artCount }, (_, index) => index);
    const frames = timedOverlayTimeline(source, sequence.length, spec.delay, spec.animation ?? "first-frame");
    const cache = new WeakMap<Image, Promise<Image>>();
    const split = new WeakMap<Image, Promise<readonly [Image, Image]>>();
    function prepared(image: Image) {
      const cached = cache.get(image);
      if (cached) return cached;
      const request = prepareImage(spec.key, image).then(photo => shape ? applyShape(photo, shape, signal) : photo);
      cache.set(image, request);
      return request;
    }
    async function halves(photo: Image) {
      const cached = split.get(photo);
      if (cached) return cached;
      const crop = async (left: number) => loadImage((await renderExactPng(75, 100,
        draw => draw.drawImage(photo, left, 0, 75, 100, 0, 0, 75, 100))).png);
      const request = Promise.all([crop(0), crop(75)]);
      split.set(photo, request);
      return request;
    }
    const staticOutputs = new Map<number, Buffer>();
    let state = "";
    async function renderFrame({ image, overlay }: typeof frames[number]["value"], w: number, h: number) {
      const index = sequence[overlay]!;
      const size = `${w}x${h}`;
      if (size !== state) {
        staticOutputs.clear();
        state = size;
      }
      const cached = !spec.animation && staticOutputs.get(index);
      if (cached) return cached;
      const scaled = (paint: Draw): Draw => draw => { draw.scale(w / width, h / height); paint(draw); };
      const artLayer = scaled(draw => draw.drawImage(art[index]!, 0, 0));
      const photoOnFrame = !(spec.key === "capoo_draw" && index < 4) &&
        !(spec.key === "lick_candy" && (index === 19 || index === 20 || index === 27 || index === 28));
      let rgba: Buffer;
      if (!photoOnFrame) rgba = await renderMaskedRgba(w, h, artLayer, [], signal);
      else {
        const photo = await prepared(image);
        if (spec.key === "capoo_rip" && index >= 6) {
          const [left, right] = await halves(photo);
          const [leftPose, rightPose] = ripSplit[index - 6]!;
          const upper = await renderMaskedRgba(w, h, scaled(project(left, leftPose)), [artLayer], signal);
          const bottom = await renderRgba(w, h, scaled(project(right, rightPose)));
          rgba = blendBottom(upper, bottom.rgba);
        } else {
          const pose = spec.key === "capoo_draw" ? project(photo, drawPoses[index - 4]!)
            : spec.key === "capoo_rip" ? project(photo, ripFull[index]!)
              : spec.key === "lick_candy" ? project(photo, candy[index]!)
                : spec.key === "shiroko_pero" ? (draw: Parameters<Draw>[0]) => draw.drawImage(photo, 105, 178)
                  : (draw: Parameters<Draw>[0]) => draw.drawImage(photo, 88, index === 2 || index === 3 ? 45 : 47);
          rgba = spec.key === "lick_candy" ? await renderMaskedRgba(w, h, artLayer, [scaled(pose)], signal)
            : await renderMaskedRgba(w, h, scaled(pose), [artLayer], signal);
        }
      }
      for (let i = 3; i < rgba.length; i += 4) rgba[i] = rgba[i] ? 255 : 0;
      if (!spec.animation) staticOutputs.set(index, rgba);
      return rgba;
    }
    try {
      assertMemeGifDimensions(width, height, frames.length);
    } catch (error) {
      if (!(error instanceof MemeGifDimensionLimitError)) throw error;
      async function* framesOnDisk() {
        for (const { value, delayMs } of frames) yield { rgba: await renderFrame(value, width, height), delayMs };
      }
      try {
        return await encodeMemeGifStream(width, height, frames.length, framesOnDisk(), signal);
      } catch (streamError) {
        if (!(streamError instanceof MemeGifDimensionLimitError || streamError instanceof MemeGifByteLimitError)) throw streamError;
      }
    }
    return renderPythonGif({ width, height, signal, frames, renderFrame });
  }
  return {
    info: { key: spec.key, keywords: spec.keywords, tags: spec.tags, params_type: {
      min_images: 1, max_images: 1, min_texts: 0, max_texts: 0, default_texts: [], args_type: null,
    } }, render,
    async preview(context) {
      return render({ images: [await previewImage(context.signal)], texts: [], args: {} }, context);
    },
  };
}

export const legacyProjectedActionTemplates = specs.map(create);
