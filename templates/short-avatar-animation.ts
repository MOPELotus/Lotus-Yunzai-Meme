import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("meme", messageCatalog.messages);
import { createFixedAvatarAnimation } from "./fixed-avatar-animation.ts";

// Positions, compositing order and source frame delays from the pinned AnyLiew registrations.
const circle = { circle: "after-resize" } as const;
export const shortAvatarAnimations = [
  createFixedAvatarAnimation({
    ...circle, key: "capoo_lashings", keywords: ["咖波捶打", "捶打"], tags: ["猫猫虫", "咖波"], frames: 12, delayMs: 20,
    positions: [100, 102], sizes: [330, 330],
  }),
  createFixedAvatarAnimation({
    ...circle, key: "finger", keywords: ["指"], frames: 93, delayMs: 30, positions: [241, 11], sizes: [94, 94],
  }),
  createFixedAvatarAnimation({
    ...circle, key: "hello", keywords: ["hello", "Hello"], frames: 36, delayMs: 100, positions: [33, 44], sizes: [129, 129],
  }),
  createFixedAvatarAnimation({
    ...circle, key: "music", keywords: ["音乐"], frames: 63, delayMs: 40, positions: [47, 47], sizes: [163, 163],
  }),
  createFixedAvatarAnimation({
    ...circle, key: "nailoong_nestle", keywords: ["奶龙依偎"], firstFrame: 0, frames: 1, delayMs: 130,
    positions: [160, 9], sizes: [120, 120], avatarOnTop: true,
  }),
  createFixedAvatarAnimation({
    key: "question_mark", keywords: ["🐷", "猪"], frames: 24, delayMs: 100, positions: [27, 53], sizes: [156, 156],
    circle: "before-resize",
  }),
  createFixedAvatarAnimation({
    ...circle, key: "shamate", keywords: ["杀马特"], frames: 34, delayMs: 60, positions: [70, 145], sizes: [250, 250],
  }),
  createFixedAvatarAnimation({
    ...circle, key: "steal", keywords: ["偷"], firstFrame: 0, frames: 1, delayMs: 130, positions: [61, 34], sizes: [376, 376],
  }),
  createFixedAvatarAnimation({
    ...circle, key: "tick", keywords: ["虫"], frames: 30, delayMs: 80, positions: [64, 64], sizes: [100, 100],
  }),
] as const;
