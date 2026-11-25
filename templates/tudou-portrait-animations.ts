import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("meme", messageCatalog.messages);
import { tudouShortFramePath } from "../backend-tudou-short-animation-assets.ts";
import { createFixedAvatarAnimation } from "./fixed-avatar-animation.ts";

type Pose = readonly [left: number, top: number, width: number, height: number];
interface Scene {
  readonly key: string;
  readonly keywords: readonly string[];
  readonly tags?: readonly string[];
  readonly frames: number;
  readonly poses: Pose | readonly Pose[];
  readonly ellipse?: true;
  readonly second?: Pose | readonly Pose[];
}

// Original registration parameters and frame layouts from LRZ9712/tudou-meme 7e799eeaca9ce712eeabe41f964636c755a86c63.
const scenes: readonly Scene[] = [
  {
    key: "beiwodao", keywords: ["被窝导"], frames: 3, ellipse: true,
    poses: [[105, 41, 146, 131], [102, 41, 146, 131], [105, 41, 146, 131]],
  },
  {
    key: "cha", keywords: ["叉"], frames: 3,
    poses: [[53, 40, 108, 95], [57, 41, 108, 95], [53, 40, 108, 95]],
  },
  {
    key: "huochailu", keywords: ["火柴撸"], tags: ["火柴人"], frames: 6,
    poses: [
      [63, 28, 155, 155], [63, 28, 155, 155], [83, 38, 155, 155],
      [94, 40, 155, 155], [97, 45, 155, 155], [97, 45, 155, 155],
    ],
  },
  {
    key: "jibao", keywords: ["挤爆"], frames: 5,
    poses: [199, 43, 175, 145],
  },
  {
    key: "kaimen", keywords: ["开门"], frames: 1, ellipse: true,
    poses: [23, 76, 32, 28],
  },
  {
    key: "moni", keywords: ["摸你"], frames: 6, ellipse: true,
    poses: [227, 102, 274, 198],
    second: [
      [49, 414, 145, 102], [41, 397, 149, 106], [38, 380, 157, 116],
      [34, 362, 152, 120], [33, 337, 154, 129], [38, 369, 158, 124],
    ],
  },
  {
    key: "nailongpao", keywords: ["奶龙跑"], frames: 12, ellipse: true,
    poses: [
      [74, 63, 76, 77], [56, 42, 76, 77], [54, 33, 76, 77], [51, 47, 76, 77],
      [41, 62, 76, 77], [38, 68, 76, 77], [56, 64, 76, 77], [71, 81, 76, 77],
      [73, 91, 76, 77], [72, 72, 76, 77], [69, 60, 76, 77], [61, 73, 76, 77],
    ],
  },
  {
    key: "niulai", keywords: ["牛来"], frames: 9, ellipse: true,
    poses: [
      [78, 46, 51, 75], [76, 31, 57, 88], [69, 16, 68, 101],
      [59, 2, 83, 121], [55, -11, 90, 133], [46, -34, 101, 157],
      [41, -46, 113, 166], [38, -49, 119, 174], [31, -72, 127, 199],
    ],
  },
  {
    key: "qiu", keywords: ["求"], frames: 1, ellipse: true,
    poses: [59, 153, 239, 232],
  },
  {
    key: "shuai", keywords: ["甩"], frames: 4,
    poses: [[43, 135, 83, 69], [49, 103, 53, 45], [138, 100, 53, 44], [149, 125, 61, 62]],
  },
  {
    key: "shuainiuzi", keywords: ["甩牛子", "甩鸡"], frames: 8,
    poses: [
      [90, 56, 54, 54], [95, 62, 54, 54], [105, 62, 54, 54], [112, 57, 54, 54],
      [121, 56, 54, 54], [111, 50, 54, 54], [97, 45, 54, 54], [93, 51, 54, 54],
    ],
  },
  {
    key: "wanweiba", keywords: ["玩尾巴"], frames: 6, ellipse: true,
    poses: [738, 132, 289, 303],
  },
  {
    key: "wudizhen", keywords: ["无敌帧"], frames: 4,
    poses: [[46, 8, 28, 28], [56, 0, 28, 28], [63, 6, 28, 28], [54, 12, 28, 28]],
  },
  {
    key: "yao", keywords: ["摇"], frames: 14,
    poses: [
      [1, 3, 47, 46], [1, 3, 47, 46], [3, 6, 47, 46], [7, 8, 47, 46], [7, 8, 47, 46],
      [10, 8, 47, 46], [10, 8, 47, 46], [7, 7, 47, 46], [10, 7, 47, 46], [9, 8, 47, 46],
      [9, 8, 47, 46], [9, 8, 47, 46], [8, 6, 47, 46], [3, 7, 47, 46],
    ],
  },
];

function placement(poses: Scene["poses"]) {
  if (typeof poses[0] === "number") {
    const [left, top, width, height] = poses as Pose;
    return { positions: [left, top] as const, sizes: [width, height] as const };
  }
  const frames = poses as readonly Pose[];
  return {
    positions: frames.map(([left, top]) => [left, top] as const),
    sizes: frames.map(([, , width, height]) => [width, height] as const),
  };
}

export function createTudouPortraitAnimations(mode?: Parameters<typeof createFixedAvatarAnimation>[0]["mode"]) {
  return scenes.map(({ key, keywords, tags, ellipse, frames, poses, second }) => createFixedAvatarAnimation({
    key, keywords, tags, frames, firstFrame: 0, framePath: index => tudouShortFramePath(key, index),
    ...placement(poses), directUnderlay: true, mode,
    // The old 0.067 s GIF writer truncated to a 60 ms frame in the encoded file.
    ...(ellipse ? { delayMs: 60, crop: true, circle: "hard-ellipse", avatarOnTop: true } : {
      delayMs: 50, circle: "before-resize", initialCircle: { size: [110, 110], cropFirst: true },
    }),
    secondAvatar: second && placement(second),
  }));
}

export const tudouPortraitAnimations = createTudouPortraitAnimations();
