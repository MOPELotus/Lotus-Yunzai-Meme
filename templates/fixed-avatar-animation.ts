import { loadImage, type Image, type CanvasRenderingContext2D } from "skia-canvas";
import { renderRgba } from "../../../packages/skia/index.ts";
import type { MemeTemplate, MemeTemplateContext, MemeTemplateInput } from "../builtin-template.ts";
import { readMemeFirstImage } from "./animated-input.ts";
import { assertMemeGifDimensions, encodeMemeGif } from "./gif.ts";
import { previewImage } from "./template-layout.ts";

type Position = readonly [left: number, top: number];
type Size = readonly [width: number, height: number];

interface FixedAvatarAnimation {
  readonly key: string;
  readonly keywords: readonly string[];
  readonly tags?: readonly string[];
  readonly delayMs: number;
  readonly positions: Position | readonly Position[];
  readonly sizes: Size | readonly Size[];
  readonly frames: number;
  readonly crop?: true;
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
];

function at<T extends Size>(values: T | readonly T[], index: number): T {
  return (typeof values[0] === "number" ? values : values[index]) as T;
}

function placeAvatar(context: CanvasRenderingContext2D, avatar: Image, [left, top]: Position, [width, height]: Size, crop: boolean) {
  context.imageSmoothingQuality = "high";
  if (!crop) {
    context.drawImage(avatar, left, top, width, height);
    return;
  }

  const ratio = Math.max(width / avatar.width, height / avatar.height);
  const scaledWidth = Math.trunc(avatar.width * ratio);
  const scaledHeight = Math.trunc(avatar.height * ratio);
  context.save();
  context.beginPath();
  context.rect(left, top, width, height);
  context.clip();
  context.drawImage(avatar, left + Math.trunc((width - scaledWidth) / 2), top + Math.trunc((height - scaledHeight) / 2),
    scaledWidth, scaledHeight);
  context.restore();
}

function mixChannel(bottom: number, top: number, mask: number) {
  return Math.round((bottom * (255 - mask) + top * mask) / 255);
}

// The original Pillow paste used the source alpha to mix every straight RGBA
// channel. Its GIF writer then reserved transparency for the zero-alpha entry.
function blendFixedArt(avatar: Buffer, art: Buffer) {
  for (let index = 0; index < art.length; index += 4) {
    const artMask = art[index + 3]!;
    if (artMask === 255) continue;
    const avatarMask = avatar[index + 3]!;
    if (artMask === 0 && avatarMask === 0) continue;
    for (let channel = index; channel < index + 3; channel++) {
      const avatarColor = mixChannel(0, avatar[channel]!, avatarMask);
      art[channel] = mixChannel(avatarColor, art[channel]!, artMask);
    }
    const avatarAlpha = mixChannel(0, avatarMask, avatarMask);
    art[index + 3] = mixChannel(avatarAlpha, artMask, artMask) > 0 ? 255 : 0;
  }
  return art;
}

const params = { min_images: 1, max_images: 1, min_texts: 0, max_texts: 0, default_texts: [], args_type: null };

function createTemplate({ key, keywords, tags, delayMs, positions, sizes, frames, crop }: FixedAvatarAnimation): MemeTemplate {
  const readFrame = (index: number, context: MemeTemplateContext) =>
    context.imageAsset(`anyliew/emoji/${key}/images/${index + 1}.png`).then(loadImage);

  async function render(input: MemeTemplateInput, context: MemeTemplateContext) {
    if (input.images.length !== 1 || input.texts.length) throw new Error("这个表情需要一张图片。");

    const { signal } = context;
    signal.throwIfAborted();
    const [avatar, first] = await Promise.all([readMemeFirstImage(input.images[0]!, signal), readFrame(0, context)]);
    const { width, height } = first;
    assertMemeGifDimensions(width, height, frames);
    const rendered = [];
    for (let index = 0; index < frames; index++) {
      signal.throwIfAborted();
      const foreground = index === 0 ? first : await readFrame(index, context);
      if (foreground.width !== width || foreground.height !== height) throw new Error(`表情模板 ${key} 的帧尺寸不一致。`);
      const avatarLayer = await renderRgba(width, height, canvas => placeAvatar(canvas, avatar, at(positions, index), at(sizes, index), crop ?? false));
      const artLayer = await renderRgba(width, height, canvas => canvas.drawImage(foreground, 0, 0));
      const rgba = blendFixedArt(avatarLayer.rgba, artLayer.rgba);
      const previous = rendered.at(-1);
      if (previous?.rgba.equals(rgba)) {
        previous.delayMs += delayMs;
      } else {
        rendered.push({ rgba, delayMs });
      }
    }
    return encodeMemeGif(width, height, rendered, signal);
  }

  return {
    info: { key, keywords, tags, params_type: params },
    render,
    async preview(context) {
      return render({ images: [await previewImage(context.signal)], texts: [], args: {} }, context);
    },
  };
}

export const fixedAvatarAnimations: readonly MemeTemplate[] = specs.map(createTemplate);
