// Original avatar placement from MemeCrafters/meme-generator v0.1.14.
// https://github.com/MemeCrafters/meme-generator/tree/619fa10518fc2eca4fa1053af37f0a00a839f062/meme_generator/memes
import { renderExactPng } from "../../../packages/skia/index.ts";
import { loadImage, type Image } from "skia-canvas";
import type { MemeTemplate, MemeTemplateContext, MemeTemplateInput } from "../builtin-template.ts";
import { readMemeFirstImage } from "./animated-input.ts";
import { renderMaskedRgba } from "./masked-layout.ts";
import { screenProjection, type ProjectiveQuad } from "./projective-transform.ts";
import { renderPythonGif } from "./python-gif.ts";
import { previewImage, type Draw } from "./template-layout.ts";

type Point = readonly [x: number, y: number];
type Pose = readonly [x: number, y: number, width: number, height: number];
interface Projection { readonly position: Point; readonly quad: ProjectiveQuad }
type Placement = Pose | Projection | undefined;

interface Animation {
  readonly key: string;
  readonly keywords: readonly string[];
  readonly tags?: readonly string[];
  readonly initialSize?: number;
  readonly delayMs: number;
  readonly placements: readonly Placement[];
}

const capoo = ["猫猫虫", "咖波"] as const;
const fixedSize = (positions: readonly Point[], size: number): Pose[] => positions.map(([x, y]) => [x, y, size, size]);

const chaseTrain: readonly Pose[] = [
  [128, 44, 35, 34], [132, 40, 35, 33], [133, 36, 33, 34], [135, 41, 33, 38],
  [136, 38, 34, 34], [136, 33, 35, 35], [138, 38, 33, 34], [138, 34, 36, 35],
  [139, 32, 38, 34], [139, 37, 40, 35], [139, 33, 36, 35], [138, 28, 39, 36],
  [138, 33, 40, 35], [138, 31, 37, 34], [135, 27, 43, 36], [136, 32, 36, 37],
  [135, 26, 38, 40], [133, 26, 37, 35], [132, 30, 33, 36], [132, 25, 33, 39],
  [131, 23, 32, 36], [130, 31, 33, 36], [128, 25, 35, 39], [127, 23, 33, 35],
  [126, 29, 34, 36], [124, 25, 34, 40], [119, 23, 39, 36], [119, 32, 35, 36],
  [116, 27, 35, 37], [113, 23, 36, 38], [113, 32, 34, 35], [113, 23, 39, 36],
  [114, 17, 36, 35], [111, 13, 36, 38], [114, 15, 34, 37], [111, 10, 34, 39],
  [109, 11, 33, 39], [104, 17, 36, 35], [102, 14, 34, 36], [99, 14, 34, 35],
  [96, 16, 35, 38], [93, 14, 35, 35], [89, 15, 36, 35], [86, 18, 36, 36],
  [83, 14, 36, 39], [81, 16, 34, 36], [74, 17, 40, 41], [74, 15, 38, 36],
  [70, 16, 39, 35], [69, 20, 33, 35], [66, 17, 36, 35], [62, 17, 36, 35],
  [57, 21, 37, 36], [57, 15, 35, 39], [53, 17, 35, 36], [51, 20, 35, 38],
  [47, 19, 37, 36], [47, 18, 37, 35], [43, 19, 40, 36], [42, 22, 38, 35],
  [38, 20, 40, 34], [37, 21, 38, 34], [35, 24, 39, 32], [33, 22, 39, 33],
  [32, 22, 39, 36], [32, 25, 38, 35], [31, 22, 35, 37], [31, 23, 37, 37],
  [31, 28, 36, 31], [32, 25, 37, 34], [32, 23, 36, 37], [33, 30, 36, 33],
  [33, 27, 35, 34], [33, 28, 38, 33], [33, 29, 37, 34], [35, 28, 36, 35],
  [36, 27, 36, 37], [33, 30, 43, 39], [38, 31, 35, 34], [39, 30, 37, 34],
  [40, 30, 36, 34], [41, 30, 39, 35], [41, 29, 41, 36], [44, 32, 40, 37],
  [45, 29, 40, 37], [48, 28, 39, 38], [50, 33, 38, 33], [53, 28, 35, 38],
  [54, 31, 37, 34], [57, 32, 38, 34], [57, 29, 41, 35], [63, 29, 35, 34],
  [62, 29, 41, 35], [66, 28, 38, 35], [70, 29, 35, 33], [70, 28, 40, 39],
  [74, 28, 36, 36], [77, 26, 37, 35], [79, 28, 37, 35], [81, 27, 38, 35],
  [85, 27, 36, 35], [88, 29, 37, 36], [91, 27, 36, 34], [94, 24, 38, 39],
  [95, 27, 39, 34], [98, 26, 37, 34], [103, 24, 36, 35], [99, 28, 37, 36],
  [97, 34, 34, 36], [102, 38, 34, 38], [99, 40, 37, 37], [101, 47, 39, 36],
  [106, 43, 36, 36], [109, 40, 35, 35], [112, 43, 35, 39], [116, 41, 33, 36],
  [116, 39, 36, 36], [121, 45, 34, 37], [123, 38, 35, 41], [126, 35, 34, 37],
];

const risen: readonly Projection[] = [
  { position: [81, 55], quad: [[0, 2], [101, 0], [103, 105], [1, 105]] },
  { position: [74, 49], quad: [[0, 3], [104, 0], [106, 108], [1, 108]] },
  { position: [-66, 36], quad: [[0, 0], [182, 5], [184, 194], [1, 185]] },
  { position: [-231, 55], quad: [[0, 0], [259, 4], [276, 281], [13, 278]] },
];
const worship: Projection = { position: [0, 0], quad: [[0, -30], [135, 17], [135, 145], [0, 140]] };

const specs: readonly Animation[] = [
  { key: "applaud", keywords: ["鼓掌"], initialSize: 110, delayMs: 100,
    placements: [[27, 17, 109, 102], [28, 15, 107, 105], [27, 14, 110, 106], [27, 14, 109, 106], [29, 12, 107, 108]] },
  { key: "capoo_point", keywords: ["咖波指"], tags: capoo, initialSize: 180, delayMs: 100,
    placements: [[57, 290, 165, 167], [53, 290, 165, 167], [57, 293, 160, 165], [56, 290, 165, 167]] },
  { key: "capoo_rub", keywords: ["咖波蹭", "咖波贴"], tags: capoo, initialSize: 180, delayMs: 100,
    placements: [[78, 260, 178, 184], [84, 269, 178, 174], [84, 269, 178, 174], [84, 264, 178, 178]] },
  { key: "chase_train", keywords: ["追列车", "追火车"], initialSize: 42, delayMs: 50, placements: chaseTrain },
  { key: "hutao_bite", keywords: ["胡桃啃"], tags: ["米哈游", "胡桃", "原神"], initialSize: 100, delayMs: 100,
    placements: [[108, 234, 98, 101], [108, 237, 96, 100]] },
  { key: "scratch_head", keywords: ["挠头"], initialSize: 68, delayMs: 100,
    placements: [[4, 5, 53, 46], [7, 6, 50, 45], [6, 8, 50, 42], [7, 7, 50, 44], [4, 8, 53, 42], [7, 7, 52, 45]] },
  { key: "chino_throw", keywords: ["智乃扔", "智乃抛"], tags: ["香风智乃"], delayMs: 70, placements: [
    ...Array<Pose>(5).fill([133, 299, 240, 186]), [93, 260, 250, 220], [74, 226, 234, 228], [95, 176, 236, 226], [95, 176, 236, 226],
    [70, 45, 138, 123], [104, 51, 128, 112], [126, 57, 103, 95], [49, 23, 190, 146], [0, 0, 142, 163],
    ...Array<Pose>(7).fill([0, 0, 500, 500]),
  ] },
  { key: "garbage", keywords: ["垃圾", "垃圾桶"], initialSize: 79, delayMs: 40, placements: fixedSize([
    ...Array<Point>(3).fill([39, 40]), ...Array<Point>(2).fill([39, 30]), ...Array<Point>(10).fill([39, 32]),
    [39, 30], [39, 27], [39, 32], [37, 49], [37, 64], [37, 67], [37, 67], [39, 69], [37, 70], [37, 70],
  ], 79) },
  { key: "klee_eat", keywords: ["可莉吃"], tags: ["米哈游", "可莉", "原神"], initialSize: 83, delayMs: 100, placements: fixedSize([
    ...Array<Point>(5).fill([0, 174]), [12, 160], [19, 152], [23, 148], [26, 145], [32, 140], [37, 136], [42, 131], [49, 127],
    [70, 126], [88, 128], [-30, 210], [-19, 207], [-14, 200], [-10, 188], [-7, 179], [-3, 170], [-3, 175], [-1, 174],
    ...Array<Point>(8).fill([0, 174]),
  ], 83) },
  { key: "rise_dead", keywords: ["诈尸", "秽土转生"], initialSize: 150, delayMs: 150,
    placements: Array.from({ length: 34 }, (_, index) => {
      if (index > 28) return undefined;
      const pose = risen[Math.max(0, index - 25)]!;
      const [x, y] = pose.position;
      return index % 2 === 1 ? { ...pose, position: [x + 1, y - 1] } : pose;
    }) },
  { key: "worship", keywords: ["膜", "膜拜"], initialSize: 150, delayMs: 40, placements: Array<Projection>(10).fill(worship) },
];

function squarePhoto(image: Image, [x, y, width, height]: Pose): Draw {
  const size = Math.min(image.width, image.height);
  const sourceX = Math.floor((image.width - size) / 2), sourceY = Math.floor((image.height - size) / 2);
  return draw => {
    draw.imageSmoothingQuality = "high";
    draw.drawImage(image, sourceX, sourceY, size, size, x, y, width, height);
  };
}

function projectedPhoto(image: Image, { position: [x, y], quad }: Projection): Draw {
  const xs = quad.map(point => point[0]), ys = quad.map(point => point[1]);
  const width = Math.max(...xs) - Math.min(...xs), height = Math.max(...ys) - Math.min(...ys);
  const transform = screenProjection(image.width, image.height, quad);
  return draw => {
    draw.translate(x, y);
    draw.beginPath();
    // Pillow's extent is relative to (0, 0), even when the quad begins above it.
    draw.rect(0, 0, width, height);
    draw.clip();
    draw.transform(transform);
    draw.imageSmoothingQuality = "high";
    draw.drawImage(image, 0, 0);
  };
}

function create({ key, keywords, tags, initialSize, delayMs, placements }: Animation): MemeTemplate {
  const digits = String(placements.length - 1).length;
  async function render({ images, texts }: MemeTemplateInput, context: MemeTemplateContext) {
    if (images.length !== 1 || texts.length) throw new Error("该表情需要一张图片。");
    const { signal } = context;
    const readArt = (index: number) => context.imageAsset(`${key}/${String(index).padStart(digits, "0")}.png`).then(loadImage);
    const [avatar, first] = await Promise.all([readMemeFirstImage(images[0]!, signal), readArt(0)]);
    const { width, height } = first;
    const photo = initialSize ? await loadImage((await renderExactPng(initialSize, initialSize,
      squarePhoto(avatar, [0, 0, initialSize, initialSize]))).png) : avatar;
    const artwork = [first];
    for (let from = 1; from < placements.length; from += 8) {
      signal.throwIfAborted();
      const batch = await Promise.all(placements.slice(from, from + 8).map((_, offset) => readArt(from + offset)));
      if (batch.some(art => art.width !== width || art.height !== height)) throw new Error(`表情模板 ${key} 的帧尺寸不一致。`);
      artwork.push(...batch);
    }
    const frames = placements.map((placement, index) => ({ value: { placement, index }, delayMs }));
    return renderPythonGif({
      width, height, frames, signal,
      async renderFrame({ index, placement }, outWidth, outHeight) {
        const art = artwork[index]!;
        const scaled = (paint: Draw): Draw => draw => {
          draw.scale(outWidth / width, outHeight / height);
          paint(draw);
        };
        const drawArt = scaled(draw => draw.drawImage(art, 0, 0));
        const base = placement === undefined ? drawArt : scaled("quad" in placement
          ? projectedPhoto(photo, placement) : squarePhoto(photo, placement));
        const rgba = await renderMaskedRgba(outWidth, outHeight, base, placement === undefined ? [] : [drawArt], signal);
        for (let i = 3; i < rgba.length; i += 4) rgba[i] = rgba[i] ? 255 : 0;
        return rgba;
      },
    });
  }
  return {
    info: { key, keywords, tags, params_type: { min_images: 1, max_images: 1, min_texts: 0, max_texts: 0, args_type: null } },
    render,
    async preview(context) {
      return render({ images: [await previewImage(context.signal)], texts: [], args: {} }, context);
    },
  };
}

export const classicAvatarMemeTemplates = specs.map(create);
