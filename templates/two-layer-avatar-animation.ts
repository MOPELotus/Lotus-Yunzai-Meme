import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("meme", messageCatalog.messages);
import { createFixedAvatarAnimation } from "./fixed-avatar-animation.ts";

// Original position and resize tables from the pinned AnyLiew registrations.
export const twoLayerAvatarAnimations = [
  createFixedAvatarAnimation({
    key: "beg_foster_care", keywords: ["求包养"], frames: 13, delayMs: 80, positions: [72, 37], sizes: [146, 130],
  }),
  createFixedAvatarAnimation({
    key: "capoo_take_dump", keywords: ["咖波拉"], tags: ["猫猫虫", "咖波"], frames: 19, delayMs: 100,
    positions: [[34, 55], [34, 55], [38, 59], [91, 79], [148, 104], ...Array<readonly [number, number]>(14).fill([1, 1])],
    sizes: [[86, 75], [86, 75], [79, 69], [51, 52], [35, 36], ...Array<readonly [number, number]>(14).fill([2, 2])],
  }),
  createFixedAvatarAnimation({
    key: "clownish", keywords: ["滑稽"], frames: 12, delayMs: 80, sizes: [60, 60],
    positions: [[55, -7], [57, -4], [61, 1], [70, -3], [98, 14], [103, 16], [99, -4], [94, 1], [91, 3], [83, -1], [54, 14], [47, 18]],
  }),
  createFixedAvatarAnimation({
    key: "cockroaches", keywords: ["蟑螂", "小强"], frames: 5, delayMs: 90, positions: [94, 95], sizes: [115, 90], crop: true,
  }),
  createFixedAvatarAnimation({
    key: "fart", keywords: ["放屁"], frames: 8, delayMs: 140, sizes: [93, 93],
    positions: [[32, 4], [36, 4], [36, 4], [36, 4], [33, 4], [33, 4], [31, 4], [31, 4]],
  }),
  createFixedAvatarAnimation({
    key: "focus", keywords: ["聚焦"], frames: 40, delayMs: 50, positions: [0, 0], sizes: [224, 224],
  }),
  createFixedAvatarAnimation({
    key: "french_kiss", keywords: ["舌吻"], frames: 54, delayMs: 60, positions: [180, 0], sizes: [180, 180],
  }),
  createFixedAvatarAnimation({
    key: "grin", keywords: ["咧嘴"], frames: 30, delayMs: 40, positions: [23, 23], sizes: [180, 180],
  }),
  createFixedAvatarAnimation({
    key: "horse_riding", keywords: ["骑马"], frames: 4, delayMs: 10, sizes: [58, 58],
    positions: [[76, 44], [81, 44], [100, 47], [101, 46]],
  }),
  createFixedAvatarAnimation({
    key: "ignite", keywords: ["燃起来了"], frames: 21, delayMs: 60, positions: [35, 32], sizes: [170, 170],
  }),
  createFixedAvatarAnimation({
    key: "ikun_666", keywords: ["666", "六六六"], frames: 108, delayMs: 50, positions: [37, 37], sizes: [150, 150],
  }),
  createFixedAvatarAnimation({
    key: "ikun_ball", keywords: ["坤球"], frames: 2, delayMs: 100, positions: [40, 44], sizes: [145, 107], crop: true,
  }),
] as const;
