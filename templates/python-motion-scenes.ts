import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("meme", messageCatalog.messages);
import { loadImage, type Image } from "skia-canvas";
import type { MemeTemplate, MemeTemplateContext } from "../builtin-template.ts";
import { readMemeFirstImage, readMemeImageSequence, type MemeImageSequence } from "./animated-input.ts";
import { renderPythonCanvasGif } from "./python-gif.ts";
import { previewImage, rgbaFrameDimensions, rotateExpanded, type Draw } from "./template-layout.ts";
import { screenProjection, type ProjectiveQuad } from "./projective-transform.ts";

export function buildImageMeme(key: string, keywords: readonly string[], imageCount: readonly [number, number],
  render: MemeTemplate["render"], tags?: readonly string[]): MemeTemplate {
  const [min_images, max_images] = imageCount;
  return {
    info: { key, keywords, tags, params_type: { min_images, max_images, min_texts: 0, max_texts: 0, default_texts: [], args_type: null } },
    render,
    async preview(context) {
      const photo = await previewImage(context.signal);
      return render({ images: Array.from({ length: min_images }, () => photo), texts: [], args: {} }, context);
    },
  };
}

export function loadPythonArt(context: MemeTemplateContext, key: string, name = "0.png") {
  return context.imageAsset(`python/meme_generator/memes/${key}/images/${name}`).then(loadImage);
}

export function positionedPhoto(image: Image, x: number, y: number, width: number, height: number, inside = false): Draw {
  const ratio = (inside ? Math.min : Math.max)(width / image.width, height / image.height);
  const scaledWidth = Math.max(1, Math.trunc(image.width * ratio));
  const scaledHeight = Math.max(1, Math.trunc(image.height * ratio));
  return draw => {
    draw.save();
    draw.beginPath();
    draw.rect(x, y, width, height);
    draw.clip();
    draw.imageSmoothingQuality = "high";
    draw.drawImage(image, x + Math.trunc((width - scaledWidth) / 2), y + Math.trunc((height - scaledHeight) / 2), scaledWidth, scaledHeight);
    draw.restore();
  };
}

function clippedCircle(photo: Image, x: number, y: number, size: number, angle = 0): Draw {
  return draw => {
    draw.save();
    draw.translate(x + size / 2, y + size / 2);
    if (angle) draw.rotate(-angle * Math.PI / 180);
    draw.beginPath();
    draw.arc(0, 0, size / 2, 0, Math.PI * 2);
    draw.clip();
    positionedPhoto(photo, -size / 2, -size / 2, size, size)(draw);
    draw.restore();
  };
}

type AnimationFrame = { readonly index: number; readonly photos: readonly Image[] };

function paintAnimation(width: number, height: number, frames: readonly AnimationFrame[], step: number, signal: AbortSignal,
  paint: (frame: AnimationFrame, draw: Parameters<Draw>[0]) => void, samePose?: (previous: number, current: number) => boolean) {
  const timeline: { value: AnimationFrame; delayMs: number }[] = [];
  for (const frame of frames) {
    const previous = timeline.at(-1);
    if (previous && samePose?.(previous.value.index, frame.index) && previous.value.photos.every((photo, index) => photo === frame.photos[index])) {
      previous.delayMs += step;
    } else timeline.push({ value: frame, delayMs: step });
  }
  return renderPythonCanvasGif({ ...rgbaFrameDimensions(width, height), signal, frames: timeline, drawFrame: paint });
}

function stillFrames(length: number, photos: readonly Image[]) {
  return Array.from({ length }, (_, index) => ({ index, photos }));
}

function loopFrames(sources: readonly MemeImageSequence[], count: number, step: number) {
  const durations = sources.filter(source => source.frames.length > 1).map(source => source.frames.length * source.averageDelayMs / 1000);
  const tick = step / 1000;
  let length = count;
  if (Math.max(0, ...durations) - length * tick >= tick) {
    while (length + count <= 100) {
      length += count;
      const end = length * tick;
      if (durations.every(duration => Math.abs(Math.round(end / duration) * duration - end) <= tick)) break;
    }
  }
  const indexes = sources.map(() => 0);
  const startTimes = sources.map(() => 0);
  return Array.from({ length }, (_, frame) => ({
    index: frame % count,
    photos: sources.map((source, i) => {
      const duration = source.averageDelayMs / 1000;
      if (source.frames.length === 1 || duration <= 0) return source.frames[0];
      let index = indexes[i]!;
      let start = startTimes[i]!;
      // Track the same cumulative interval boundaries as the original GIF alignment.
      while ((index + 1) * duration <= frame * tick - start) {
        index++;
        if (index !== source.frames.length) continue;
        index = 0;
        start += source.frames.length * duration;
      }
      indexes[i] = index;
      startTimes[i] = start;
      return source.frames[index]!;
    }),
  }));
}

function flipPose(index: number, height: number) {
  const phase = index / 30;
  if (phase < 0.6) {
    const second = phase >= 0.3;
    const progress = (phase - (second ? 0.3 : 0)) / 0.3;
    return { lift: height * (1 - 4 * (progress - 0.5) ** 2), angle: (second ? -45 : 45) * (1 - 2 * Math.abs(progress - 0.5)) };
  }
  if (phase < 0.65) return { lift: height * (1 - (1 - (phase - 0.6) / (0.65 - 0.6)) ** 2), angle: 0 };
  if (phase < 0.95) return { lift: height, angle: 360 * (phase - 0.65) / (0.95 - 0.65) };
  return { lift: height * (1 - ((phase - 0.95) / (1 - 0.95)) ** 2), angle: 0 };
}

function expandedSize(width: number, height: number, degrees: number) {
  if (degrees % 180 === 0) return [width, height] as const;
  if (degrees % 90 === 0) return [height, width] as const;
  const radians = degrees * Math.PI / 180;
  const cosine = Math.abs(Math.cos(radians)), sine = Math.abs(Math.sin(radians));
  const side = (base: number, extent: number) => Math.ceil((base + extent) / 2) - Math.floor((base - extent) / 2);
  return [side(width, width * cosine + height * sine), side(height, width * sine + height * cosine)] as const;
}

const backflip = buildImageMeme("backflip", ["后空翻"], [1, 1], async ({ images }, { signal }) => {
  const source = await readMemeImageSequence(images[0]!, signal);
  const first = source.frames[0];
  const diagonal = Math.hypot(first.width, first.height);
  const width = Math.trunc(diagonal * 1.3);
  const height = Math.trunc(first.height * 1.2 + diagonal / 2 + first.height * 0.6);
  const ground = height - first.height / 2;
  return paintAnimation(width, height, loopFrames([source], 30, 50), 50, signal, ({ index, photos: [image] }, draw) => {
    const { lift, angle } = flipPose(index, first.height * 1.2);
    const [rotatedWidth, rotatedHeight] = expandedSize(image!.width, image!.height, angle);
    draw.translate(Math.trunc(width / 2 - rotatedWidth / 2), Math.trunc(ground - lift - rotatedHeight / 2));
    rotateExpanded(draw, image!.width, image!.height, -angle);
    draw.drawImage(image!, 0, 0);
  }, (a, b) => {
    const firstPose = flipPose(a, first.height * 1.2), secondPose = flipPose(b, first.height * 1.2);
    return Math.abs(firstPose.lift - secondPose.lift) < 1e-8 && Math.abs(firstPose.angle - secondPose.angle) < 1e-8;
  });
});

const leftPepe = [[107, 30], [107, 30], [95, 45], [80, 160], [80, 160], [70, 98]] as const;
const rightPepe = [[320, 145], [320, 145], [330, 130], [300, 50], [300, 50], [323, 80]] as const;
const pepeRaise = buildImageMeme("pepe_raise", ["佩佩举"], [2, 2], async ({ images }, context) => {
  const source = await Promise.all(images.map(file => readMemeImageSequence(file, context.signal)));
  const artwork = await Promise.all(leftPepe.map((_pos, index) => loadPythonArt(context, "pepe_raise", `${index}.png`)));
  const { width, height } = artwork[0]!;
  return paintAnimation(width, height, loopFrames(source, leftPepe.length, 60), 60, context.signal, ({ index, photos }, draw) => {
    draw.drawImage(artwork[index]!, 0, 0);
    clippedCircle(photos[0]!, leftPepe[index]![0], leftPepe[index]![1], 100)(draw);
    clippedCircle(photos[1]!, rightPepe[index]![0], rightPepe[index]![1], 100)(draw);
  }, (a, b) => (a === 0 && b === 1) || (a === 3 && b === 4));
}, ["明日方舟"]);

const playBaseball = buildImageMeme("play_baseball", ["打棒球"], [1, 1], async ({ images }, context) => {
  const photo = await readMemeFirstImage(images[0]!, context.signal);
  const artwork = await Promise.all(Array.from({ length: 6 }, (_, index) => loadPythonArt(context, "play_baseball", `${index}.png`)));
  let x = 0, velocity = 40, angle = 0;
  const poses = Array.from({ length: 20 }, () => {
    x += velocity;
    angle += velocity > 0 ? -60 : 60;
    if (Math.abs(x) >= 200) velocity = -velocity;
    return { x, angle };
  });
  return paintAnimation(1000, 300, stillFrames(poses.length, [photo]), 80, context.signal, ({ index }, draw) => {
    const { x, angle } = poses[index]!;
    clippedCircle(photo, 425 + x, 120, 150, angle)(draw);
    const right = artwork[index >= 3 && index <= 7 ? index - 2 : 0]!;
    const left = artwork[index >= 13 && index <= 17 ? index - 12 : 0]!;
    draw.drawImage(right, 630, 6);
    draw.translate(left.width, 0);
    draw.scale(-1, 1);
    draw.drawImage(left, 0, 6);
  });
}, ["咖波", "猫猫虫"]);

const stepPositions = [[104, 72, 32, 185, -25], [104, 72, 32, 185, -25], [90, 73, 51, 207, 0],
  [88, 78, 51, 202, 0], [88, 86, 49, 197, 0]] as const;
const stepOn = buildImageMeme("step_on", ["踩"], [1, 1], async ({ images }, context) => {
  const [photo, artwork] = await Promise.all([
    readMemeFirstImage(images[0]!, context.signal),
    Promise.all(stepPositions.map((_pose, index) => loadPythonArt(context, "step_on", `${index}.png`))),
  ]);
  const { width, height } = artwork[0]!;
  return paintAnimation(width, height, stillFrames(stepPositions.length, [photo]), 70, context.signal, ({ index }, draw) => {
    const [w, h, x, y, angle] = stepPositions[index]!;
    const side = Math.min(photo.width, photo.height);
    draw.save();
    draw.translate(x, y);
    rotateExpanded(draw, w, h, angle);
    draw.imageSmoothingQuality = "high";
    draw.drawImage(photo, Math.trunc((photo.width - side) / 2), Math.trunc((photo.height - side) / 2), side, side, 0, 0, w, h);
    draw.restore();
    draw.drawImage(artwork[index]!, 0, 0);
  });
});

function pyramidFace(photo: Image, angle: number): Draw {
  const faceWidth = 180, faceHeight = 254;
  const depth = Math.hypot(300, 300) / 2 / Math.tan(Math.PI / 8);
  const cosine = Math.cos(angle * Math.PI / 180), sine = Math.sin(angle * Math.PI / 180);
  function project(x: number, y: number, z: number) {
    const factor = depth / (depth - (-sine * x + cosine * z));
    return [150 + Math.trunc((cosine * x + sine * z) * factor), 150 + Math.trunc(y * factor)] as const;
  }
  const points: ProjectiveQuad = [project(-90, -90, 0), project(90, -90, 0), project(90, 90, 90), project(-90, 90, 90)];
  return draw => {
    draw.save();
    draw.transform(screenProjection(faceWidth, faceHeight, points));
    draw.beginPath();
    draw.moveTo(faceWidth / 2, 0);
    draw.lineTo(0, faceHeight);
    draw.lineTo(faceWidth, faceHeight);
    draw.closePath();
    draw.clip();
    positionedPhoto(photo, 0, 0, faceWidth, faceHeight)(draw);
    draw.restore();
  };
}

const pyramid = buildImageMeme("pyramid", ["四棱锥", "金字塔"], [1, 4], async ({ images }, { signal }) => {
  const sources = await Promise.all(images.map(file => readMemeImageSequence(file, signal)));
  if (sources.length === 1) sources.push(sources[0]!);
  return paintAnimation(300, 300, loopFrames(sources, sources.length * 15, 60), 60, signal, ({ index, photos }, draw) => {
    const current = Math.floor(index / 15);
    const angle = index % 15 * 6;
    pyramidFace(photos[(current + 1) % photos.length]!, angle - 90)(draw);
    pyramidFace(photos[current]!, angle)(draw);
  });
});

export const pythonMotionSceneTemplates = [backflip, pepeRaise, playBaseball, stepOn, pyramid] as const;
