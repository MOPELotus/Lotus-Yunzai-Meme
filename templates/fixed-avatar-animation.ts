import { loadImage, type Image, type CanvasRenderingContext2D } from "skia-canvas";
import { renderExactPng, renderRgba } from "../../../packages/skia/index.ts";
import type { MemeTemplate, MemeTemplateContext, MemeTemplateInput } from "../builtin-template.ts";
import { readMemeFirstImage, readMemeImageSequence } from "./animated-input.ts";
import {
  assertMemeGifDimensions, encodeMemeGif, encodeMemeGifStream, MemeGifByteLimitError, MemeGifDimensionLimitError,
} from "./gif.ts";
import { previewImage, rotateExpanded } from "./template-layout.ts";

type Position = readonly [left: number, top: number];
type Size = readonly [width: number, height: number];
const maxSendBytes = 8 * 1024 * 1024;

interface FixedAvatarAnimation {
  readonly key: string;
  readonly keywords: readonly string[];
  readonly tags?: readonly string[];
  readonly delayMs: number;
  readonly positions: Position | readonly Position[];
  readonly sizes: Size | readonly Size[];
  readonly frames: number;
  // Counts of byte-identical consecutive source PNGs, before GIF encoding.
  readonly sourceHolds?: readonly number[];
  readonly crop?: true;
  readonly angle?: number;
  readonly squareResize?: number;
  readonly circle?: "before-resize" | "after-resize" | "hard-ellipse";
  readonly initialCircle?: { readonly size: Size; readonly cropFirst?: boolean };
  readonly firstFrame?: 0 | 1;
  readonly framePath?: (frame: number) => string;
  readonly avatarStart?: number;
  readonly avatarFrames?: number;
  readonly cycleSquareAvatar?: true;
  readonly preserveZeroDelay?: true;
  readonly avatarOnTop?: true;
  readonly secondAvatar?: Pick<FixedAvatarAnimation, "positions" | "sizes">;
  readonly directUnderlay?: true;
  readonly largeCanvas?: { readonly maxSide?: number };
  readonly mode?: Parameters<typeof renderRgba>[3];
}

// Original pose tables and frame art from anyliew/meme_emoji at 33bf418ac2ccd416be70faf9a13e97befb7703a8.
const specs: readonly FixedAvatarAnimation[] = [
  {
    key: "capoo_smash_egg", keywords: ["咖波砸蛋"], frames: 3, delayMs: 110,
    positions: [[24, 57], [23, 95], [29, 116]],
    sizes: [65, 65],
    tags: ["猫猫虫", "咖波"],
  },
  {
    key: "ikun_trainee", keywords: ["练习生"], frames: 12, delayMs: 50,
    positions: [[58, 52], [56, 55], [59, 52], [60, 51], [59, 45], [62, 42], [63, 48], [60, 53], [63, 48], [62, 42], [59, 46], [60, 51]],
    sizes: [[64, 42], [65, 42], [64, 42], [61, 43], [63, 51], [58, 50], [57, 49], [61, 43], [56, 49], [59, 50], [63, 50], [61, 43]],
    crop: true,
  },
  {
    key: "mihoyo_kirara_delivery", keywords: ["绮良良派送", "派送"], frames: 4, delayMs: 40,
    positions: [226, 74],
    sizes: [141, 120],
    tags: ["米哈游", "原神"],
  },
  {
    key: "christmas_eve", keywords: ["平安夜", "平安夜快乐"], frames: 3, delayMs: 500,
    positions: [70, 120],
    sizes: [118, 89],
  },
  {
    key: "doro_chasing", keywords: ["doro追", "Doro追", "桃乐丝追"], frames: 4, delayMs: 70,
    positions: [[268, 147], [267, 148], [268, 146], [267, 148]],
    sizes: [96, 96],
  },
  {
    key: "doro_lick", keywords: ["桃乐丝舔", "doro舔", "Doro舔", "DORO舔"], frames: 5, delayMs: 90,
    positions: [103, 73],
    sizes: [31, 31],
  },
  {
    key: "dog_ear_hat", keywords: ["狗耳帽", "狗帽"], frames: 12, delayMs: 90,
    positions: [66, 109],
    sizes: [156, 118],
  },
  {
    key: "cheer", keywords: ["欢呼"], frames: 10, delayMs: 100,
    positions: [[71, 165], [74, 75], [75, 75], [71, 166], [71, 166], [75, 76], [71, 167], [72, 166], [75, 76], [72, 166]],
    sizes: [69, 69],
  },
  {
    key: "happy_mid_autumn_festival", keywords: ["中秋快乐", "中秋节快乐"], frames: 7, delayMs: 150,
    positions: [36, 37],
    sizes: [70, 70],
  },
  {
    key: "happy_national_day", keywords: ["国庆快乐", "国庆节快乐"], frames: 4, delayMs: 80,
    positions: [[55, 92], [55, 81], [55, 76], [55, 84]],
    sizes: [190, 160],
  },
  {
    key: "happy_new_year", keywords: ["新年好"], frames: 4, delayMs: 70,
    positions: [103, 165],
    sizes: [83, 43],
  },
  {
    key: "picking_flowers", keywords: ["摘花"], frames: 4, delayMs: 200,
    positions: [45, 13],
    sizes: [212, 212],
  },
  {
    key: "small_hands", keywords: ["小手"], frames: 3, delayMs: 80,
    positions: [42, 13],
    sizes: [175, 175],
  },
  {
    key: "wifi", keywords: ["wifi", "WIFI"], frames: 4, delayMs: 100,
    positions: [6, 41],
    sizes: [67, 67],
  },
  {
    key: "slacking_off", keywords: ["摸鱼"], frames: 4, delayMs: 200,
    positions: [10, 57],
    sizes: [145, 116],
  },
  {
    key: "bring_wealth", keywords: ["来财"], frames: 24, delayMs: 70,
    positions: [0, 0],
    sizes: [224, 224],
  },
  {
    key: "capoo_fished_out", keywords: ["咖波掏"], frames: 20, delayMs: 100,
    positions: [
      [1, 1], [1, 1], [1, 1], [1, 1], [1, 1], [1, 1], [1, 1],
      [1, 1], [1, 1], [1, 1], [1, 1], [1, 1], [1, 1], [1, 1],
      [1, 1], [57, 84], [35, 117], [21, 102], [27, 112], [28, 112],
    ],
    sizes: [95, 95],
    tags: ["猫猫虫", "咖波"],
  },
  {
    key: "capoo_gothammered", keywords: ["咖波被锤"], frames: 20, delayMs: 50,
    positions: [
      [82, 147], [77, 116], [79, 128], [76, 135], [80, 146], [77, 127], [80, 127],
      [78, 137], [81, 146], [78, 130], [81, 129], [81, 139], [81, 147], [80, 131],
      [81, 130], [79, 137], [81, 146], [78, 131], [79, 130], [80, 138],
    ],
    sizes: [80, 80],
    tags: ["猫猫虫", "咖波"],
  },
  {
    key: "cat_lick", keywords: ["猫舔", "猫猫舔"], frames: 30, delayMs: 60,
    positions: [38, 127],
    sizes: [80, 65],
  },
  {
    key: "doro_banging", keywords: ["doro敲", "Doro敲", "桃乐丝敲"], frames: 11, delayMs: 30,
    positions: [
      [149, 109], [149, 109], [149, 109], [139, 133], [134, 140], [143, 127], [149, 109],
      [149, 109], [149, 109], [149, 109], [149, 109],
    ],
    sizes: [
      [82, 82], [82, 82], [82, 82], [102, 52], [112, 45], [89, 60], [82, 82],
      [82, 82], [82, 82], [82, 82], [82, 82],
    ],
  },
  {
    key: "doro_do", keywords: ["doro撅", "Doro撅", "桃乐丝撅"], frames: 4, delayMs: 50,
    positions: [[0, 600], [0, 645], [0, 680], [0, 720]],
    sizes: [640, 640],
  },
  {
    key: "doro_kiss", keywords: ["桃乐丝亲", "Doro亲", "doro亲"], frames: 9, delayMs: 60,
    positions: [65, 343],
    sizes: [190, 160],
  },
  {
    key: "doro_knight", keywords: ["骑士", "doro骑士", "Doro骑士", "DORO骑士"], frames: 16, delayMs: 100,
    positions: [
      [126, 203], [125, 197], [125, 204], [125, 209], [128, 197], [125, 200], [124, 207],
      [125, 201], [125, 201], [125, 207], [125, 209], [126, 201], [125, 205], [125, 198],
      [127, 197], [127, 206],
    ],
    sizes: [133, 133],
  },
  {
    key: "doro_stroke", keywords: ["抚摸", "doro抚摸", "Doro抚摸", "桃乐丝抚摸"], frames: 16, delayMs: 70,
    positions: [148, 306],
    sizes: [81, 81],
  },
  {
    key: "doro_trampoline", keywords: ["跳床", "蹦床", "doro蹦床", "桃乐丝蹦床", "doro跳床", "桃乐丝跳床"], frames: 15, delayMs: 60,
    positions: [
      [31, 94], [30, 96], [33, 68], [33, 66], [29, 65], [32, 62], [31, 76],
      [31, 95], [30, 95], [30, 95], [32, 67], [32, 66], [33, 65], [36, 65],
      [34, 74],
    ],
    sizes: [79, 66],
  },
  {
    key: "bonfire_dance", keywords: ["篝火舞", "圈舞"], frames: 61, delayMs: 40,
    positions: [
      [167, 56], [167, 56], [167, 56], [167, 56], [139, 59], [139, 59], [139, 59],
      [129, 82], [111, 68], [111, 68], [111, 68], [111, 68], [84, 61], [84, 61],
      [72, 95], [72, 95], [72, 95], [69, 101], [69, 101], [63, 107], [63, 107],
      [60, 122], [60, 122], [60, 122], [62, 156], [62, 156], [63, 177], [63, 177],
      [63, 177], [66, 170], [66, 170], [66, 170], [63, 206], [63, 206], [93, 245],
      [93, 245], [136, 267], [136, 267], [136, 267], [154, 261], [154, 261], [184, 259],
      [184, 259], [200, 285], [200, 285], [200, 285], [194, 229], [194, 229], [196, 225],
      [196, 225], [196, 225], [199, 286], [199, 286], [194, 230], [195, 230], [195, 230],
      [195, 224], [195, 224], [200, 286], [200, 286], [228, 275],
    ],
    sizes: [
      [110, 110], [110, 110], [110, 110], [110, 110], [110, 110], [110, 110], [110, 110],
      [110, 110], [110, 110], [110, 110], [110, 110], [110, 110], [110, 110], [110, 110],
      [110, 110], [110, 110], [110, 110], [110, 110], [110, 110], [110, 110], [110, 110],
      [110, 110], [110, 110], [110, 110], [110, 110], [110, 110], [110, 110], [110, 110],
      [110, 110], [110, 110], [110, 110], [110, 110], [126, 126], [126, 126], [126, 126],
      [126, 126], [126, 126], [126, 126], [126, 126], [126, 126], [126, 126], [126, 126],
      [126, 126], [126, 126], [126, 126], [126, 126], [126, 126], [126, 126], [126, 126],
      [126, 126], [126, 126], [126, 126], [126, 126], [126, 126], [126, 126], [126, 126],
      [126, 126], [126, 126], [126, 126], [126, 126], [126, 126],
    ],
  },
  {
    key: "burning", keywords: ["燃烧"], frames: 29, delayMs: 50,
    positions: [31, 41],
    sizes: [166, 166],
  },
  {
    key: "capoo_take_smash", keywords: ["咖波砸"], frames: 20, delayMs: 50,
    positions: [
      [95, 155], [84, 194], [80, 204], [95, 155], [84, 194], [80, 204], [95, 155],
      [84, 194], [80, 204], [95, 155], [84, 116], [80, 204], [95, 155], [84, 194],
      [80, 204], [95, 155], [84, 194], [80, 204], [95, 155], [84, 194],
    ],
    sizes: [
      [49, 81], [86, 51], [74, 32], [49, 81], [86, 51], [74, 32], [49, 81],
      [86, 51], [74, 32], [49, 81], [86, 129], [74, 32], [49, 81], [86, 51],
      [74, 32], [49, 81], [86, 51], [74, 32], [49, 81], [86, 51],
    ],
    tags: ["猫猫虫", "咖波"],
  },
  {
    key: "chain", keywords: ["锁链"], frames: 45, delayMs: 30,
    positions: [20, 20],
    sizes: [185, 185],
  },
  {
    key: "cooking", keywords: ["炒菜"], frames: 52, delayMs: 50,
    positions: [
      [80, 59], [80, 59], [80, 61], [80, 61], [80, 67], [80, 67], [80, 59],
      [80, 59], [80, 61], [80, 62], [80, 67], [80, 67], [80, 59], [80, 58],
      [80, 61], [80, 62], [80, 67], [80, 67], [80, 58], [79, 59], [80, 61],
      [80, 61], [80, 67], [80, 67], [80, 59], [80, 59], [80, 61], [80, 61],
      [80, 67], [80, 67], [80, 59], [80, 59], [80, 61], [80, 62], [80, 67],
      [80, 67], [80, 58], [80, 59], [80, 63], [80, 64], [78, 68], [79, 68],
      [80, 64], [80, 63], [80, 58], [80, 59], [80, 64], [80, 63], [79, 67],
      [79, 67], [80, 63], [80, 63],
    ],
    sizes: [95, 95],
  },
  {
    key: "doro_openlight", keywords: ["开灯", "桃乐丝开灯", "doro开灯", "Doro开灯", "DORO开灯"], frames: 63, delayMs: 30,
    positions: [33, 35],
    sizes: [55, 55],
  },
  {
    key: "double_guns", keywords: ["双枪"], frames: 7, delayMs: 100,
    positions: [0, 0],
    sizes: [224, 224],
  },
  {
    key: "dragon_hand", keywords: ["龙手"], frames: 18, delayMs: 60,
    positions: [12, 18],
    sizes: [90, 86],
  },
  {
    key: "fever", keywords: ["为爱发烧", "发烧"], frames: 13, delayMs: 90,
    positions: [
      [74, 222], [73, 237], [73, 253], [74, 258], [73, 253], [76, 249], [76, 231],
      [76, 231], [76, 250], [74, 257], [74, 258], [73, 253], [75, 235],
    ],
    sizes: [155, 100],
  },
  {
    key: "fishing", keywords: ["钓鱼"], frames: 8, delayMs: 110,
    positions: [104, 89],
    sizes: [100, 70],
  },
  {
    key: "frieren_snuggle", keywords: ["芙莉莲贴贴"], frames: 17, delayMs: 50,
    positions: [
      [57, 132], [57, 132], [57, 137], [57, 137], [56, 138], [56, 138], [56, 138],
      [55, 140], [55, 140], [55, 140], [57, 137], [57, 137], [58, 135], [57, 132],
      [57, 132], [57, 132], [57, 132],
    ],
    sizes: [78, 78],
  },
  {
    key: "heartbeat", keywords: ["心跳"], frames: 7, delayMs: 40,
    positions: [[78, 96], [78, 96], [80, 97], [88, 96], [85, 94], [85, 94], [78, 96]],
    sizes: [110, 110],
  },
  {
    key: "electric_arc", keywords: ["电弧"], frames: 293, delayMs: 30,
    sourceHolds: [
      3, 4, 3, 3, 4, 3, 3, 3, 4, 3, 3, 4, 3, 3, 4, 3, 3, 3,
      4, 3, 3, 4, 3, 3, 4, 3, 3, 3, 4, 3, 3, 4, 3, 3, 4, 3,
      3, 3, 4, 3, 3, 4, 3, 3, 4, 3, 3, 3, 4, 3, 3, 4, 3, 3,
      4, 3, 3, 3, 4, 3, 3, 4, 3, 3, 4, 3, 3, 3, 4, 3, 3, 4,
      3, 3, 4, 3, 3, 3, 4, 3, 3, 4, 3, 3, 4, 3, 3, 3, 3,
    ],
    positions: [25, 25],
    sizes: [180, 180],
  },
  {
    key: "health_bar", keywords: ["血条", "HP", "hp"], frames: 435, delayMs: 30,
    sourceHolds: [
      17, 3, 3, 3, 4, 3, 3, 4, 3, 3, 4, 3, 3, 3, 4, 3, 3, 4,
      3, 3, 37, 3, 3, 3, 4, 3, 3, 4, 3, 3, 4, 3, 3, 3, 4, 3,
      3, 4, 3, 23, 3, 4, 3, 3, 4, 3, 3, 3, 4, 3, 3, 4, 3, 3,
      4, 3, 3, 3, 4, 3, 3, 4, 3, 3, 4, 3, 3, 3, 4, 3, 3, 4,
      3, 16, 4, 3, 3, 4, 3, 3, 4, 3, 3, 3, 4, 3, 3, 4, 3, 3,
      4, 3, 3, 3, 4, 3, 3, 4, 3, 3, 4, 3, 3, 3, 4, 3, 3, 3,
    ],
    positions: [7, 10],
    sizes: [210, 210],
  },
];

function at<T extends Size>(values: T | readonly T[], index: number): T {
  return (typeof values[0] === "number" ? values : values[index]) as T;
}

function placeAvatar(context: CanvasRenderingContext2D, avatar: Image, [left, top]: Position, [width, height]: Size, crop: boolean,
  square = false,
) {
  context.imageSmoothingQuality = "high";
  const side = Math.min(avatar.width, avatar.height);
  const sourceWidth = square ? side : avatar.width;
  const sourceHeight = square ? side : avatar.height;
  const sx = Math.floor((avatar.width - sourceWidth) / 2), sy = Math.floor((avatar.height - sourceHeight) / 2);
  const drawPhoto = (x: number, y: number, w: number, h: number) => {
    if (square) context.drawImage(avatar, sx, sy, sourceWidth, sourceHeight, x, y, w, h);
    else context.drawImage(avatar, x, y, w, h);
  };
  if (!crop) {
    drawPhoto(left, top, width, height);
    return;
  }

  const ratio = Math.max(width / sourceWidth, height / sourceHeight);
  const scaledWidth = Math.trunc(sourceWidth * ratio);
  const scaledHeight = Math.trunc(sourceHeight * ratio);
  context.save();
  context.beginPath();
  context.rect(left, top, width, height);
  context.clip();
  drawPhoto(left + Math.trunc((width - scaledWidth) / 2), top + Math.trunc((height - scaledHeight) / 2),
    scaledWidth, scaledHeight);
  context.restore();
}

function avatarEllipse(draw: CanvasRenderingContext2D, [x, y]: Position, [width, height]: Size, hard: boolean) {
  draw.beginPath();
  draw.ellipse(x + width / 2, y + height / 2, width / 2, (hard ? height : width) / 2, 0, 0, Math.PI * 2);
}

async function circleSource(avatar: Image, mode: Parameters<typeof renderRgba>[3], initial?: FixedAvatarAnimation["initialCircle"]) {
  const [width, height] = initial?.size ?? [avatar.width, avatar.height];
  const size = Math.min(width, height);
  const { png } = await renderExactPng(size, size, draw => {
    draw.beginPath();
    draw.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    draw.clip();
    const x = Math.trunc((size - width) / 2), y = Math.trunc((size - height) / 2);
    if (initial) placeAvatar(draw, avatar, [x, y], [width, height], initial.cropFirst ?? false);
    else draw.drawImage(avatar, x, y);
  }, mode);
  return loadImage(png);
}

async function resizedSquare(avatar: Image, size: number, mode: Parameters<typeof renderRgba>[3]) {
  const { png } = await renderExactPng(size, size, draw => placeAvatar(draw, avatar, [0, 0], [size, size], false, true), mode);
  return loadImage(png);
}

function mixChannel(bottom: number, top: number, mask: number) {
  return Math.round((bottom * (255 - mask) + top * mask) / 255);
}

// The original Pillow paste used the source alpha to mix every straight RGBA
// channel. Its GIF writer then reserved transparency for the zero-alpha entry.
function blendFixedArt(avatar: Buffer, art: Buffer, directUnderlay = false, flattenAlpha = true) {
  for (let index = 0; index < art.length; index += 4) {
    const artMask = art[index + 3]!;
    if (artMask === 255) continue;
    const avatarMask = avatar[index + 3]!;
    if (artMask === 0 && avatarMask === 0) continue;
    for (let channel = index; channel < index + 3; channel++) {
      const avatarColor = directUnderlay ? avatar[channel]! : mixChannel(0, avatar[channel]!, avatarMask);
      art[channel] = mixChannel(avatarColor, art[channel]!, artMask);
    }
    const avatarAlpha = directUnderlay ? avatarMask : mixChannel(0, avatarMask, avatarMask);
    const alpha = mixChannel(avatarAlpha, artMask, artMask);
    art[index + 3] = flattenAlpha && alpha > 0 ? 255 : alpha;
  }
  return art;
}

const params = { min_images: 1, max_images: 1, min_texts: 0, max_texts: 0, default_texts: [], args_type: null };

async function* orderedFrames(
  count: number, first: Image, lookahead: number, read: (index: number) => Promise<Image>, signal: AbortSignal,
) {
  type Loaded = { image: Image } | { error: unknown };
  const pending: Promise<Loaded>[] = [];
  let next = 1;
  for (let index = 0; index < count; index++) {
    signal.throwIfAborted();
    while (next < count && pending.length < lookahead) {
      signal.throwIfAborted();
      pending.push(read(next++).then(image => ({ image }), error => ({ error })));
    }
    const loaded = index === 0 ? { image: first } : await pending.shift()!;
    signal.throwIfAborted();
    if ("error" in loaded) throw loaded.error;
    yield { index, foreground: loaded.image };
  }
}

export function createFixedAvatarAnimation({
  key, keywords, tags, delayMs, positions, sizes, frames, sourceHolds, crop, angle, squareResize, circle, initialCircle, firstFrame = 1,
  framePath = frame => `anyliew/emoji/${key}/images/${frame}.png`, avatarStart = 0, avatarFrames, cycleSquareAvatar, preserveZeroDelay,
  avatarOnTop, secondAvatar, directUnderlay,
  largeCanvas, mode = "auto",
}: FixedAvatarAnimation): MemeTemplate {
  const longAnimation = sourceHolds !== undefined;
  const resizeForSend = longAnimation || largeCanvas !== undefined;
  const placements = [{ positions, sizes }, ...(secondAvatar ? [secondAvatar] : [])];
  const imageCount = placements.length;
  const fixedPlacement = !cycleSquareAvatar && avatarStart === 0 && avatarFrames === undefined && placements.every(({ positions, sizes }) =>
    typeof positions[0] === "number" && typeof sizes[0] === "number");
  const holds = sourceHolds ?? Array<number>(frames).fill(1);
  let sourceIndex = 0;
  const offsets = holds.map(hold => {
    const current = sourceIndex;
    sourceIndex += hold;
    return current;
  });

  async function readFrame(index: number, context: MemeTemplateContext) {
    const path = framePath(offsets[index]! + firstFrame);
    let bytes: Buffer;
    try {
      bytes = await context.imageAsset(path);
    } catch (error) {
      if (!longAnimation) throw error;
      context.signal.throwIfAborted();
      bytes = await context.imageAsset(path);
    }
    return loadImage(bytes);
  }

  async function render(input: MemeTemplateInput, context: MemeTemplateContext) {
    if (input.images.length !== imageCount || input.texts.length) {
      throw new Error(imageCount === 1 ? "这个表情需要一张图片。" : "这个表情需要两张图片。");
    }

    const { signal } = context;
    signal.throwIfAborted();
    const [avatars, first] = await Promise.all([
      Promise.all(input.images.map(async file => {
        if (cycleSquareAvatar) return (await readMemeImageSequence(file, signal)).frames;
        const image = await readMemeFirstImage(file, signal);
        if (squareResize) return [await resizedSquare(image, squareResize, mode)];
        return [circle === "before-resize" ? await circleSource(image, mode, initialCircle) : image];
      })),
      readFrame(0, context),
    ]);
    const { width: sourceWidth, height: sourceHeight } = first;
    const scale = Math.min(1, (largeCanvas?.maxSide ?? Infinity) / Math.max(sourceWidth, sourceHeight));
    let width = Math.max(1, Math.floor(sourceWidth * scale));
    let height = Math.max(1, Math.floor(sourceHeight * scale));
    for (;;) {
      signal.throwIfAborted();
      try {
        const gif = await encodeFrames(width, height);
        if (!resizeForSend || gif.byteLength <= maxSendBytes) return gif;
      } catch (error) {
        const canResize = error instanceof MemeGifByteLimitError ? resizeForSend :
          largeCanvas !== undefined && error instanceof MemeGifDimensionLimitError;
        if (!canResize || width + height === 2) throw error;
      }
      width = Math.max(1, Math.floor(width * 0.9));
      height = Math.max(1, Math.floor(height * 0.9));
    }

    async function encodeFrames(width: number, height: number) {
      try {
        assertMemeGifDimensions(width, height, frames);
      } catch (error) {
        if (!largeCanvas || !(error instanceof MemeGifDimensionLimitError)) throw error;
        return encodeMemeGifStream(width, height, holds.length, drawFrames(width, height), signal);
      }
      const rendered = [];
      for await (const frame of drawFrames(width, height)) rendered.push(frame);
      return encodeMemeGif(width, height, rendered, signal, { preserveZeroDelay });
    }

    async function* drawFrames(width: number, height: number) {
      const read = (index: number) => readFrame(index, context);
      let previous: { rgba: Buffer; delayMs: number } | undefined;
      let avatarLayers: Buffer[] | undefined;
      const scaleX = width / sourceWidth, scaleY = height / sourceHeight;
      for await (const { index, foreground } of orderedFrames(holds.length, first, longAnimation ? 8 : 1, read, signal)) {
        if (foreground.width !== sourceWidth || foreground.height !== sourceHeight) {
          throw new Error(`表情模板 ${key} 的帧尺寸不一致。`);
        }
        if (!avatarLayers || !fixedPlacement) {
          const offset = offsets[index]!;
          avatarLayers = await Promise.all(placements.map(async ({ positions, sizes }, avatarIndex) => {
            if (offset < avatarStart || avatarFrames !== undefined && offset >= avatarFrames) return Buffer.alloc(width * height * 4);
            const position = at(positions, offset);
            const size = at(sizes, offset);
            const { rgba } = await renderRgba(width, height, canvas => {
              canvas.scale(scaleX, scaleY);
              if (circle === "after-resize" || circle === "hard-ellipse") {
                avatarEllipse(canvas, position, size, circle === "hard-ellipse");
                canvas.clip();
              }
              const source = avatars[avatarIndex]!;
              const image = source[(offset - avatarStart) % source.length]!;
              if (angle) {
                canvas.translate(...position);
                rotateExpanded(canvas, ...size, angle);
              }
              placeAvatar(canvas, image, angle ? [0, 0] : position, size, crop ?? false, cycleSquareAvatar);
            }, mode);
            if (circle === "hard-ellipse") {
              // The source replaces the original alpha with a hard ellipse.
              const { rgba: mask } = await renderRgba(width, height, canvas => {
                canvas.scale(scaleX, scaleY);
                avatarEllipse(canvas, position, size, true);
                canvas.fill();
              }, mode);
              for (let alpha = 3; alpha < rgba.length; alpha += 4) rgba[alpha] = mask[alpha]! >= 128 ? 255 : 0;
            }
            return rgba;
          }));
        }
        const { rgba: art } = await renderRgba(width, height, canvas => {
          canvas.scale(scaleX, scaleY);
          canvas.imageSmoothingQuality = "high";
          canvas.drawImage(foreground, 0, 0);
        }, mode);
        const rgba = avatarOnTop
          ? avatarLayers.reduce((bottom, top, layer) => blendFixedArt(bottom, Buffer.from(top), directUnderlay, layer + 1 === imageCount), art)
          : blendFixedArt(avatarLayers[0]!, art, directUnderlay);
        const duration = delayMs * holds[index]!;
        if (previous?.rgba.equals(rgba)) previous.delayMs += duration;
        else {
          if (previous) yield previous;
          previous = { rgba, delayMs: duration };
        }
      }
      if (previous) yield previous;
    }
  }

  return {
    info: { key, keywords, tags, params_type: { ...params, min_images: imageCount, max_images: imageCount } },
    render,
    async preview(context) {
      const image = await previewImage(context.signal);
      return render({ images: Array<File>(imageCount).fill(image), texts: [], args: {} }, context);
    },
  };
}

export const fixedAvatarAnimations: readonly MemeTemplate[] = specs.map(createFixedAvatarAnimation);
