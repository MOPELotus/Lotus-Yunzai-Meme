import { loadImage } from "skia-canvas";
import { renderExactPng } from "../../../packages/skia/index.ts";
import type { MemeTemplate, MemeTemplateContext } from "../builtin-template.ts";
import { createFixedAvatarAnimation } from "./fixed-avatar-animation.ts";

function quiltSource(context: MemeTemplateContext): MemeTemplateContext {
  return {
    ...context,
    async imageAsset(path) {
      const source = await context.imageAsset(path);
      const image = await loadImage(source);
      context.signal.throwIfAborted();
      if (image.width !== 300 || image.height < 290 || image.height > 300) {
        throw new Error("被窝表情的原帧尺寸无效。");
      }
      if (image.height === 300) return source;
      // The original GIF keeps the first frame's logical screen and clears the shorter frames below their last row.
      const padded = await renderExactPng(300, 300, draw => draw.drawImage(image, 0, 0));
      context.signal.throwIfAborted();
      return padded.png;
    },
  };
}

function quilt(preset: Parameters<typeof createFixedAvatarAnimation>[0]): MemeTemplate {
  const template = createFixedAvatarAnimation(preset);
  return {
    ...template,
    render: (input, context) => template.render(input, quiltSource(context)),
    preview: context => template.preview!(quiltSource(context)),
  };
}

// Exact pose tables from AnyLiew at 33bf418ac2ccd416be70faf9a13e97befb7703a8.
export const anyliewFixedBatchTemplates: readonly MemeTemplate[] = [
  createFixedAvatarAnimation({
    key: "nailoong_smile", keywords: ["奶龙笑"], frames: 32, delayMs: 60,
    positions: [240, 0],
    sizes: [240, 240],
  }),
  createFixedAvatarAnimation({
    key: "nailoong_snuggle", keywords: ["奶龙贴贴"], frames: 75, delayMs: 130,
    positions: [
      [112, 1], [112, 1], [112, 1], [112, 1], [112, 0], [111, 0], [106, 0], [104, 0],
      [97, 0], [92, 0], [89, 0], [83, 0], [80, 0], [75, 0], [73, 0], [72, 0],
      [70, 0], [70, -1], [72, 0], [75, 0], [80, 0], [85, 0], [95, 0], [99, 0],
      [106, 0], [113, 1], [117, 1], [122, 3], [123, 3], [124, 3], [123, 4], [123, 4],
      [115, 4], [113, 2], [107, 1], [99, 0], [97, -1], [86, -2], [81, -2], [77, -2],
      [72, 0], [70, 1], [70, 1], [70, 1], [70, 1], [73, 0], [77, 0], [83, -1],
      [91, -2], [97, -1], [108, 0], [115, 0], [116, 0], [123, 2], [126, 3], [128, 4],
      [128, 4], [126, 5], [117, 3], [114, 2], [110, 0], [99, 0], [96, -1], [88, -1],
      [81, -1], [79, -1], [72, -1], [70, 0], [68, 1], [66, 2], [66, 2], [66, 2],
      [69, 2], [73, 0], [77, 0],
    ],
    sizes: [
      [91, 91], [91, 91], [91, 91], [91, 91], [91, 91], [91, 91], [91, 91], [91, 91],
      [91, 91], [91, 91], [91, 91], [91, 91], [91, 91], [91, 91], [91, 91], [91, 91],
      [93, 93], [93, 93], [91, 91], [91, 91], [91, 91], [91, 91], [91, 91], [91, 91],
      [91, 91], [91, 91], [91, 91], [91, 91], [91, 91], [91, 91], [91, 91], [91, 91],
      [91, 91], [91, 91], [91, 91], [91, 91], [91, 91], [91, 90], [91, 90], [91, 91],
      [91, 91], [91, 91], [91, 91], [91, 91], [91, 91], [91, 91], [91, 91], [91, 91],
      [91, 91], [91, 91], [91, 91], [91, 91], [91, 91], [91, 91], [91, 91], [91, 91],
      [91, 91], [91, 91], [93, 93], [91, 91], [91, 91], [91, 91], [91, 91], [91, 91],
      [91, 91], [91, 91], [91, 91], [91, 91], [91, 91], [91, 91], [91, 91], [91, 91],
      [91, 91], [91, 91], [91, 91],
    ],
    sourceHolds: [
      1, 1, 1, 1, 1, 1, 1, 1,
      1, 1, 1, 1, 1, 1, 1, 1,
      1, 1, 1, 1, 1, 1, 1, 1,
      1, 1, 1, 1, 1, 1, 1, 1,
      1, 1, 1, 1, 1, 1, 1, 1,
      1, 1, 1, 1, 1, 1, 1, 1,
      1, 1, 1, 1, 1, 1, 1, 1,
      1, 1, 1, 1, 1, 1, 1, 1,
      1, 1, 1, 1, 1, 1, 1, 1,
      1, 1, 1,
    ],
  }),
  createFixedAvatarAnimation({
    key: "nailoong_sync", keywords: ["奶龙合拍"], frames: 12, delayMs: 110,
    positions: [
      [73, 60], [61, 60], [58, 60], [56, 59], [65, 59], [76, 59], [77, 59], [82, 59],
      [78, 59], [68, 59], [58, 59], [55, 59],
    ],
    sizes: [70, 70],
  }),
  createFixedAvatarAnimation({
    key: "palworld_chillet", keywords: ["疾风鼬"], frames: 24, delayMs: 20,
    positions: [120, 87],
    sizes: [216, 183],
    sourceHolds: [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 1],
  }),
  createFixedAvatarAnimation({
    key: "palworld_chillet_god_wealth", keywords: ["财源滚滚", "财神到"], frames: 10, delayMs: 80,
    positions: [
      [139, 167], [139, 160], [156, 154], [177, 153], [198, 156], [215, 160], [223, 163], [219, 168],
      [188, 157], [164, 156],
    ],
    sizes: [205, 205],
  }),
  createFixedAvatarAnimation({
    key: "pig_lot", keywords: ["好多猪"], frames: 24, delayMs: 100,
    positions: [53, 63],
    sizes: [102, 102],
  }),
  createFixedAvatarAnimation({
    key: "pink_cat", keywords: ["粉猫"], frames: 8, delayMs: 120,
    positions: [29, 34],
    sizes: [170, 170],
  }),
  createFixedAvatarAnimation({
    key: "please_waiting", keywords: ["请稍候"], frames: 100, delayMs: 30,
    positions: [81, 76],
    sizes: [159, 159],
    sourceHolds: [
      1, 1, 1, 1, 1, 1, 1, 1,
      1, 1, 1, 1, 1, 1, 1, 1,
      1, 1, 1, 1, 1, 1, 1, 1,
      1, 1, 1, 1, 1, 1, 1, 1,
      1, 1, 1, 1, 1, 1, 1, 1,
      1, 1, 1, 1, 1, 1, 1, 1,
      1, 1, 1, 1, 1, 1, 1, 1,
      1, 1, 1, 1, 1, 1, 1, 1,
      1, 1, 1, 1, 1, 1, 1, 1,
      1, 1, 1, 1, 1, 1, 1, 1,
      1, 1, 1, 1, 1, 1, 1, 1,
      1, 1, 1, 1, 1, 1, 1, 1,
      1, 1, 1, 1,
    ],
  }),
  createFixedAvatarAnimation({
    key: "prison", keywords: ["铁窗"], frames: 297, delayMs: 30,
    positions: [20, 20],
    sizes: [188, 188],
    sourceHolds: [
      3, 4, 3, 3, 4, 3, 3, 3,
      4, 3, 3, 4, 3, 3, 4, 3,
      3, 3, 4, 3, 3, 4, 3, 3,
      4, 3, 3, 3, 4, 3, 3, 4,
      3, 3, 4, 3, 3, 3, 4, 3,
      3, 4, 3, 3, 4, 3, 3, 3,
      4, 3, 3, 4, 3, 3, 4, 3,
      3, 3, 4, 3, 3, 4, 3, 3,
      4, 3, 3, 3, 4, 3, 3, 4,
      3, 3, 4, 3, 3, 43,
    ],
  }),
  quilt({
    key: "quilt", keywords: ["被窝"], frames: 21, delayMs: 30,
    positions: [
      [68, 68], [68, 68], [68, 72], [69, 74], [69, 74], [69, 73], [69, 72], [69, 74],
      [68, 72], [68, 68], [68, 68], [68, 68], [68, 72], [68, 72], [69, 73], [69, 73],
      [69, 73], [69, 75], [68, 72], [68, 68], [68, 68],
    ],
    sizes: [142, 146],
  }),
  createFixedAvatarAnimation({
    key: "rabbit", keywords: ["🐇", "兔子", "兔", "兔耳帽"], frames: 20, delayMs: 40,
    positions: [71, 149],
    sizes: [150, 100],
    sourceHolds: [2, 2, 1, 1, 1, 1, 2, 1, 9],
  }),
  createFixedAvatarAnimation({
    key: "read_love_letters", keywords: ["看情书"], frames: 5, delayMs: 80,
    positions: [64, 7],
    sizes: [220, 220],
  }),
  createFixedAvatarAnimation({
    key: "scanning", keywords: ["扫描"], frames: 111, delayMs: 50,
    positions: [20, 20],
    sizes: [188, 188],
    sourceHolds: [
      1, 1, 1, 1, 1, 1, 1, 1,
      1, 1, 1, 1, 1, 1, 1, 1,
      1, 1, 1, 1, 1, 1, 1, 1,
      1, 1, 1, 1, 1, 1, 1, 1,
      1, 1, 1, 1, 1, 1, 1, 1,
      1, 1, 1, 1, 1, 1, 1, 1,
      1, 1, 1, 1, 1, 1, 1, 1,
      1, 1, 1, 1, 1, 1, 1, 1,
      1, 1, 1, 1, 1, 1, 1, 1,
      1, 1, 1, 1, 1, 1, 1, 1,
      1, 1, 1, 1, 1, 1, 1, 1,
      1, 1, 1, 1, 1, 1, 1, 1,
      1, 1, 1, 1, 1, 1, 1, 1,
      1, 1, 1, 1, 1, 1, 1,
    ],
  }),
  createFixedAvatarAnimation({
    key: "sending_love", keywords: ["比心"], frames: 15, delayMs: 160,
    positions: [
      [76, 76], [84, 78], [76, 76], [67, 76], [76, 76], [76, 78], [75, 82], [75, 82],
      [75, 82], [75, 82], [75, 82], [75, 82], [75, 82], [75, 82], [75, 82],
    ],
    sizes: [159, 128],
  }),
  createFixedAvatarAnimation({
    key: "tencent_marco_polo_ride", keywords: ["马克骑", "马可波罗骑"], frames: 73, delayMs: 120,
    positions: [
      [30, 32], [30, 32], [33, 29], [35, 27], [35, 27], [35, 27], [36, 27], [37, 27],
      [39, 28], [36, 36], [28, 50], [31, 73], [38, 76], [46, 75], [61, 70], [76, 65],
      [65, 69], [43, 76], [38, 65], [20, 84], [24, 110], [31, 115], [55, 68], [64, 42],
      [66, 51], [59, 84], [49, 85], [60, 74], [83, 51], [103, 37], [99, 59], [102, 59],
      [108, 46], [108, 53], [102, 73], [97, 80], [96, 71], [108, 52], [113, 60], [118, 59],
      [118, 59], [118, 59], [118, 59], [119, 57], [119, 57], [117, 59], [118, 58], [119, 57],
      [119, 57], [119, 57], [119, 58], [120, 57], [120, 57], [120, 57], [120, 57], [120, 57],
      [120, 57], [119, 58], [119, 58], [119, 58], [119, 58], [118, 60], [118, 59], [120, 57],
      [120, 57], [118, 59], [119, 59], [119, 59], [119, 59], [117, 61], [117, 61], [118, 58],
      [115, 58],
    ],
    sizes: [52, 52],
    sourceHolds: [
      1, 1, 1, 1, 1, 1, 1, 1,
      1, 1, 1, 1, 1, 1, 1, 1,
      1, 1, 1, 1, 1, 1, 1, 1,
      1, 1, 1, 1, 1, 1, 1, 1,
      1, 1, 1, 1, 1, 1, 1, 1,
      1, 1, 1, 1, 1, 1, 1, 1,
      1, 1, 1, 1, 1, 1, 1, 1,
      1, 1, 1, 1, 1, 1, 1, 1,
      1, 1, 1, 1, 1, 1, 1, 1,
      1,
    ],
  }),
  createFixedAvatarAnimation({
    key: "whisper", keywords: ["窃窃私语"], frames: 30, delayMs: 70,
    positions: [7, 64],
    sizes: [130, 130],
  }),
];
