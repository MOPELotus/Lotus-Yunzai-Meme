import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("meme", messageCatalog.messages);
import { createFixedAvatarAnimation } from "./fixed-avatar-animation.ts";
import { tudouShortFramePath } from "../backend-tudou-short-animation-assets.ts";

type Pose = readonly [left: number, top: number, width: number, height: number];
interface ShortScene {
  readonly key: string;
  readonly keywords: readonly string[];
  readonly delayMs: number;
  readonly initial: readonly [number, number];
  readonly poses: readonly Pose[];
  readonly frameCount?: number;
  readonly below?: true;
}

// Slot geometry, mask staging and compositing from LRZ9712/tudou-meme 7e799eeaca9ce712eeabe41f964636c755a86c63.
const scenes: readonly ShortScene[] = [
  {
    key: "aichuai", keywords: ["挨踹"], delayMs: 50, initial: [110, 110], below: true,
    poses: [
      [-36, 170, 154, 149], [-38, 175, 154, 149], [-37, 171, 154, 149], [-38, 174, 154, 149], [-41, 174, 154, 149],
      [-40, 171, 154, 149], [-42, 171, 154, 149],
    ],
  },
  {
    key: "duidi", keywords: ["怼地", "怼"], delayMs: 50, initial: [110, 110], below: true,
    poses: [[22, 6, 92, 75], [20, 6, 93, 76], [23, 10, 92, 76], [22, 5, 92, 76], [23, 2, 94, 77]],
  },
  {
    key: "huanying2", keywords: ["欢迎欢迎", "欢迎!", "欢迎！"], delayMs: 20, initial: [110, 110], below: true,
    poses: [[19, 68, 55, 51], [19, 66, 55, 49], [19, 68, 52, 47], [19, 68, 54, 49]],
  },
  {
    key: "huanyingchuo", keywords: ["欢迎新人"], delayMs: 20, initial: [110, 110], below: true,
    poses: [[92, 106, 42, 42], [117, 91, 42, 42], [129, 105, 42, 42], [125, 105, 42, 42]],
  },
  {
    key: "maomaochong", keywords: ["毛毛虫"], delayMs: 50, initial: [110, 110], below: true,
    poses: [
      [146, 140, 94, 94], [142, 138, 94, 94], [148, 142, 94, 94], [141, 137, 94, 94], [147, 143, 94, 94],
      [141, 137, 94, 94], [147, 142, 94, 94], [141, 139, 94, 94], [147, 139, 94, 94], [145, 138, 94, 94],
      [147, 141, 94, 94], [141, 139, 94, 94],
    ],
  },
  {
    key: "maomimobai", keywords: ["猫咪膜拜", "膜拜猫咪"], delayMs: 50, initial: [50, 50],
    poses: [[19, 134, 39, 39], [24, 136, 39, 39], [32, 144, 35, 32]],
  },
  {
    key: "naonao_tou", keywords: ["挠挠头"], delayMs: 50, initial: [92, 92],
    poses: [
      [75, 72, 90, 90], [74, 72, 90, 90], [75, 71, 90, 90], [75, 71, 90, 90], [74, 72, 90, 90],
      [75, 73, 90, 90], [73, 72, 90, 90], [76, 71, 90, 90], [70, 72, 92, 92], [70, 72, 92, 92],
      [72, 71, 90, 90], [74, 71, 90, 90], [72, 72, 90, 90], [73, 74, 90, 90], [72, 74, 90, 90],
    ],
  },
  {
    key: "qilongwang", keywords: ["骑龙王"], delayMs: 50, initial: [110, 110], below: true,
    poses: [[64, 3, 33, 33], [62, 3, 33, 33], [58, 2, 33, 33]],
  },
  {
    key: "tiaosheng", keywords: ["跳绳"], delayMs: 50, initial: [76, 53],
    poses: [
      [267, 160, 76, 53], [268, 163, 76, 53], [268, 159, 76, 53], [268, 160, 76, 53], [268, 160, 73, 53],
      [268, 160, 74, 53], [270, 163, 74, 53], [268, 168, 74, 53], [268, 167, 74, 55], [268, 159, 74, 55],
      [268, 160, 74, 55], [268, 163, 74, 55], [267, 153, 74, 55], [268, 107, 74, 55], [270, 95, 74, 55],
      [270, 86, 74, 55], [267, 76, 74, 55], [267, 78, 74, 55], [267, 80, 74, 55], [270, 90, 74, 59],
      [270, 102, 74, 59], [270, 139, 74, 59], [271, 167, 74, 59],
    ],
  },
  {
    key: "tuoni", keywords: ["托尼", "tony", "洗头"], delayMs: 50, initial: [80, 80],
    poses: [
      [25, 10, 70, 70], [27, 10, 70, 70], [28, 8, 70, 70], [28, 8, 70, 70], [27, 8, 70, 70],
      [25, 8, 70, 70], [28, 8, 70, 70], [27, 8, 70, 70], [25, 11, 70, 70], [25, 10, 70, 70],
      [28, 10, 70, 70], [29, 10, 70, 70], [28, 10, 70, 70], [25, 10, 70, 70],
    ],
  },
  {
    key: "xiaoxiongmaozi", keywords: ["小熊帽子"], delayMs: 80, initial: [130, 130], frameCount: 10,
    poses: [
      [58, 67, 117, 101], [56, 68, 117, 101], [54, 67, 117, 101], [54, 67, 117, 101], [58, 70, 107, 92],
      [58, 70, 112, 92], [222, -98, 114, 94],
    ],
  },
  {
    key: "zixingche", keywords: ["自行车"], delayMs: 50, initial: [110, 110],
    poses: [[12, 2, 24, 24], [11, 1, 24, 24], [9, 1, 24, 24], [10, 0, 24, 24]],
  },
];

export function createTudouShortAnimations(mode?: Parameters<typeof createFixedAvatarAnimation>[0]["mode"]) {
  return scenes.map(({ key, keywords, delayMs, initial, poses, frameCount, below }) => createFixedAvatarAnimation({
    key, keywords, delayMs, frames: frameCount ?? poses.length, avatarFrames: poses.length,
    firstFrame: 0, framePath: frame => tudouShortFramePath(key, frame),
    initialCircle: { size: initial, cropFirst: below }, circle: "before-resize",
    positions: poses.map(([x, y]) => [x, y]), sizes: poses.map(([, , width, height]) => [width, height]),
    avatarOnTop: below ? undefined : true, directUnderlay: true, mode,
  }));
}

export const tudouShortAnimations = createTudouShortAnimations();
