import { loadImage, type Image } from "skia-canvas";
import type { MemeTemplate, MemeTemplateContext, MemeTemplateInput } from "../builtin-template.ts";
import { readMemeFirstImage, readMemeImageSequence } from "./animated-input.ts";
import { drawAvatar } from "./avatar-slot.ts";
import { encodeMemeGifStream, MemeGifByteLimitError, MemeGifDimensionLimitError } from "./gif.ts";
import { renderMaskedRgba } from "./masked-layout.ts";
import { screenProjection, type ProjectiveQuad } from "./projective-transform.ts";
import { drawFittedText, previewImage, registerFont, type Draw } from "./template-layout.ts";
import { timedOverlayTimeline } from "./timed-overlays.ts";

type Point = readonly [x: number, y: number];
type Box = readonly [x: number, y: number, width: number, height: number];
type Pose = readonly [...Box, angle: number];
type Alignment = Parameters<typeof timedOverlayTimeline>[3];
type Frame = ReturnType<typeof timedOverlayTimeline>[number]["value"];
interface LayerSet {
  readonly base: Draw;
  readonly masks?: readonly Draw[];
}
interface ShapeAnimation {
  readonly key: string;
  readonly keywords: readonly string[];
  readonly imageFormat?: "jpg";
  readonly tags?: readonly string[];
  readonly alignment?: Alignment;
  readonly frameCount: number;
  readonly delay: number;
  readonly caption?: string;
  layers(frame: Frame, art: Image, text: string, font: string, noise: Point): LayerSet;
}

function artwork(art: Image): Draw { return draw => draw.drawImage(art, 0, 0); }
function photo(image: Image, box: Box, fit?: "square"): Draw {
  return draw => drawAvatar(draw, image, { slot: box, fit }, false);
}

function rotateCover(image: Image, [x, y, w, h, angle]: Pose, expand: boolean, circle = false): Draw {
  const theta = -angle * Math.PI / 180;
  const extentX = Math.abs(Math.cos(theta) * w / 2) + Math.abs(Math.sin(theta) * h / 2);
  const extentY = Math.abs(Math.sin(theta) * w / 2) + Math.abs(Math.cos(theta) * h / 2);
  const width = expand ? Math.ceil(w / 2 + extentX) - Math.floor(w / 2 - extentX) : w;
  const height = expand ? Math.ceil(h / 2 + extentY) - Math.floor(h / 2 - extentY) : h;
  return draw => {
    draw.translate(x + width / 2, y + height / 2);
    draw.rotate(theta);
    if (circle) {
      draw.beginPath();
      draw.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
      draw.clip();
    }
    photo(image, [-w / 2, -h / 2, w, h], circle ? "square" : undefined)(draw);
  };
}

function projection(image: Image, [x, y]: Point, quad: ProjectiveQuad, [width, height]: Point, fit?: "square"): Draw {
  const xs = quad.map(([left]) => left), ys = quad.map(([, top]) => top);
  const boundX = Math.max(...xs) - Math.min(...xs), boundY = Math.max(...ys) - Math.min(...ys);
  return draw => {
    draw.translate(x, y);
    draw.beginPath();
    draw.rect(0, 0, boundX, boundY);
    draw.clip();
    draw.setTransform(draw.getTransform().multiply(screenProjection(width, height, quad)));
    photo(image, [0, 0, width, height], fit)(draw);
  };
}

const gorillaPoses: readonly Pose[] = [
  [74, 125, 24, 8, -135], [84, 119, 24, 8, -130], [111, 103, 22, 15, -100], [122, 95, 22, 15, -90],
  [136, 89, 25, 17, -87], [142, 60, 49, 22, -40], [134, 49, 66, 30, -30], [134, 49, 66, 30, -30],
  [116, 35, 92, 38, -25], [78, 26, 167, 73, -5], [-30, 0, 300, 180, 5], [-120, -85, 400, 240, 16],
  [-160, -125, 500, 300, 20], [-180, -180, 600, 360, 23],
];
const walnutPoses: readonly Pose[] = [
  [-222, 30, 695, 430, 4.2], [-212, 30, 695, 430, 4.2], [0, 30, 695, 430, 4.2], [41, 26, 695, 430, 4.2],
  [-100, -67, 922, 570, 4.2], [-172, -113, 1059, 655, 4.2], [-273, -192, 1217, 753, 4.2],
];
const walnutSequence = [0, 0, 0, 1, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 5, 6, 6, 6];
const trolleySmall: readonly (readonly [number, number, number])[] = [
  [237, 25, 0], [215, 25, 0], [191, 25, 0], [169, 25, 0], [150, 25, 0], [129, 19, 20], [114, 16, 30],
  [92, 13, 40], [72, 9, 40], [51, 6, 80], [27, 7, 90], [1, 8, 90], [-15, 8, 90],
];
const bucketPositions: readonly Point[] = [[2, 26], [10, 24], [15, 27], [17, 29], [10, 20], [2, 29], [3, 31], [1, 30]];
const teaseProjections: readonly (readonly [Point, ProjectiveQuad])[] = [
  [[21, 75], [[0, 0], [129, 3], [155, 123], [12, 142]]], [[18, 73], [[0, 29], [128, 0], [149, 118], [30, 147]]],
  [[22, 78], [[0, 37], [136, 1], [160, 97], [16, 152]]], [[22, 58], [[0, 58], [169, 1], [194, 92], [24, 170]]],
  [[43, 23], [[0, 114], [166, 1], [168, 98], [41, 205]]], [[38, 24], [[0, 112], [171, 0], [169, 113], [45, 195]]],
  [[31, 54], [[0, 73], [148, 0], [172, 81], [45, 170]]], [[24, 62], [[0, 62], [159, 1], [177, 81], [47, 155]]],
  [[31, 75], [[1, 45], [126, 1], [158, 81], [29, 145]]], [[18, 61], [[0, 63], [161, 1], [190, 88], [42, 153]]],
  [[20, 66], [[0, 57], [152, 0], [195, 82], [40, 149]]], [[16, 77], [[0, 41], [141, 0], [170, 90], [27, 138]]],
  [[28, 105], [[0, 1], [132, 0], [131, 112], [1, 114]]], [[21, 107], [[0, 1], [132, 0], [131, 112], [1, 114]]],
  [[11, 113], [[1, 7], [138, 0], [141, 126], [4, 131]]], [[10, 114], [[0, 0], [142, 0], [142, 131], [0, 131]]],
  [[5, 121], [[0, 0], [147, 0], [147, 115], [0, 115]]], [[0, 119], [[0, 0], [158, 0], [158, 102], [0, 102]]],
  [[0, 116], [[0, 0], [158, 0], [158, 107], [0, 107]]], [[0, 119], [[0, 0], [158, 0], [158, 103], [0, 101]]],
  [[2, 101], [[0, 0], [153, 0], [153, 122], [0, 120]]], [[-18, 85], [[61, 0], [194, 15], [143, 146], [0, 133]]],
  [[0, 66], [[88, 1], [173, 17], [123, 182], [0, 131]]], [[0, 29], [[118, 3], [201, 48], [111, 220], [1, 168]]],
];

function remoteSize(image: Image): Point {
  const width = Math.min(image.width, 500);
  return [width, Math.max(1, Math.trunc(image.height * width / image.width))];
}

// Poses and frame timings from the fixed Python templates at 619fa10518fc2eca4fa1053af37f0a00a839f062.
const specs: readonly ShapeAnimation[] = [
  { key: "gorilla_throw", keywords: ["猩猩扔"], frameCount: 42, delay: 40, alignment: "no-extend",
    layers({ overlay, image }, art) {
      const pose = gorillaPoses[overlay - 28];
      return { base: artwork(art), ...(pose && { masks: [rotateCover(image, pose, true)] }) };
    } },
  { key: "remote_control", keywords: ["遥控", "控制"], frameCount: 17, delay: 70, alignment: "extend-loop",
    layers({ image, overlay }, art, _text, _font, [noiseX, noiseY]) {
      const [width, height] = remoteSize(image);
      const x = overlay < 4 ? 0 : Math.trunc(width * (noiseX - 0.5) / 30);
      const y = overlay < 4 ? 0 : Math.trunc(height * (noiseY - 0.5) / 30);
      const h = Math.max(1, Math.trunc(height / 1.5)), w = Math.max(1, Math.trunc(art.width * h / art.height));
      return { base: () => {}, masks: [
        photo(image, [x, y, width, height]),
        draw => draw.drawImage(art, width - w, height - h, w, h),
      ] };
    } },
  { key: "tom_tease", keywords: ["汤姆嘲笑"], tags: ["汤姆", "猫和老鼠"],
    frameCount: 11, delay: 200, alignment: "extend-first",
    layers({ image }, art) {
      return { base: projection(image, [258, -12], [[0, 100], [290, 0], [290, 370], [0, 335]], [400, 350]),
        masks: [artwork(art)] };
    } },
  { key: "trolley", keywords: ["推车"], frameCount: 50, delay: 50,
    layers({ image, overlay }, art) {
      const small = trolleySmall[overlay - 31];
      const pose: Pose | undefined = overlay < 28 ? [overlay < 25 ? 21 : overlay < 27 ? 0 : -21, 101, 65, 65, 0] :
        small && [small[0], small[1], 18, 18, small[2]];
      return { base: artwork(art), ...(pose && { masks: [rotateCover(image, pose, false, true)] }) };
    } },
  { key: "walnut_zoom", keywords: ["胡桃放大"], tags: ["胡桃", "莉可丽丝"],
    frameCount: 24, delay: 200, alignment: "extend-last",
    layers({ image, overlay }, art) {
      return { base: rotateCover(image, walnutPoses[walnutSequence[overlay]!]!, true), masks: [artwork(art)] };
    } },
  { key: "tease", keywords: ["拿捏", "戏弄"], tags: ["碧蓝档案", "蔚蓝档案"], frameCount: 24, delay: 50,
    layers({ image, overlay }, art) {
      const [at, quad] = teaseProjections[overlay]!;
      const side = Math.min(image.width, image.height);
      return { base: projection(image, at, quad, [side, side], "square"), masks: [artwork(art)] };
    } },
  { key: "pass_the_buck", keywords: ["推锅", "甩锅"], frameCount: 8, delay: 100, caption: "你写!",
    layers({ image, overlay }, art, text, font) {
      const [x, y] = bucketPositions[overlay]!;
      return { base(draw) {
        artwork(art)(draw);
        if (text) drawFittedText(draw, [0, 0, art.width, 20], text, font, 10, 20, "center", "black",
          { wrap: false, paragraphMetrics: true });
      }, masks: [photo(image, [x, y, 27, 27], "square")] };
    } },
  { key: "jiubingfufa", keywords: ["旧病复发"], frameCount: 26, delay: 60, caption: "此乃旧病复发也",
    imageFormat: "jpg", alignment: "no-extend",
    layers({ image, overlay }, art, text, font) {
      return { base(draw) {
        artwork(art)(draw);
        if (overlay > 9) drawFittedText(draw, [0, 0, 290, 160], text, font, 12, 32, "center", "white",
          { wrap: false, paragraphMetrics: true, stroke: ["black", 0.05] });
      }, masks: [rotateCover(image, [32, art.height - 162, 120, 120, 0], false, true)] };
    } },
];

function createShapeAnimation(spec: ShapeAnimation): MemeTemplate {
  const { key, keywords, tags, caption, frameCount, delay, alignment = "first-frame", imageFormat = "png" } = spec;
  async function render(input: MemeTemplateInput, context: MemeTemplateContext) {
    const { signal } = context;
    const font = caption ? await registerFont(context) : "";
    const text = input.texts[0] ?? caption ?? "";
    const readArt = (index: number) => context.imageAsset(`${key}/${String(index).padStart(String(frameCount - 1).length, "0")}.${imageFormat}`).then(loadImage);
    const [source, first] = await Promise.all([
      alignment === "first-frame" ? readMemeFirstImage(input.images[0]!, signal)
        .then(image => ({ frames: [image] as const, averageDelayMs: 0 })) : readMemeImageSequence(input.images[0]!, signal),
      readArt(0),
    ]);
    const original: Point = key === "remote_control" ? remoteSize(source.frames[0]) : [first.width, first.height];
    const frames = timedOverlayTimeline(source, frameCount, delay, alignment).map(frame => ({
      ...frame, noise: key === "remote_control" && frame.value.overlay >= 4 ? [Math.random(), Math.random()] as const : [0, 0] as const,
    }));
    let [width, height] = original;
    for (;;) {
      signal.throwIfAborted();
      try {
        return await encodeMemeGifStream(width, height, frames.length, rgbaFrames(width, height), signal);
      } catch (error) {
        if (!(error instanceof MemeGifByteLimitError || error instanceof MemeGifDimensionLimitError) || width + height === 2) throw error;
      }
      width = Math.max(1, Math.floor(width * 0.9));
      height = Math.max(1, Math.floor(height * 0.9));
    }
    async function* rgbaFrames(width: number, height: number) {
      let previous: { rgba: Buffer; delayMs: number } | undefined;
      const scale = (paint: Draw): Draw => draw => {
        draw.scale(width / original[0], height / original[1]);
        draw.imageSmoothingQuality = "high";
        paint(draw);
      };
      for (const { value, delayMs, noise } of frames) {
        signal.throwIfAborted();
        const art = value.overlay ? await readArt(value.overlay) : first;
        const { base, masks = [] } = spec.layers(value, art, text, font, noise);
        const rgba = await renderMaskedRgba(width, height, scale(base), masks.map(scale), signal);
        for (let index = 3; index < rgba.length; index += 4) rgba[index] = rgba[index] ? 255 : 0;
        if (previous && previous.delayMs + delayMs <= 655_350 && rgba.equals(previous.rgba)) {
          previous.delayMs += delayMs;
        } else {
          if (previous) yield previous;
          previous = { rgba, delayMs };
        }
      }
      if (previous) yield previous;
    }
  }
  return {
    info: { key, keywords, tags, params_type: {
      min_images: 1, max_images: 1, min_texts: 0, max_texts: caption ? 1 : 0,
      default_texts: caption ? [caption] : [], args_type: null,
    } },
    render,
    async preview(context) {
      return render({ images: [await previewImage(context.signal)], texts: [], args: {} }, context);
    },
  };
}

export const shapeTimedAnimations = specs.map(createShapeAnimation);
