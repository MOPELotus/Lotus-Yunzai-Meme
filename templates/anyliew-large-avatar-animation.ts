import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("meme", messageCatalog.messages);
import { createFixedAvatarAnimation } from "./fixed-avatar-animation.ts";

// Pose tables from anyliew/meme_emoji at 33bf418ac2ccd416be70faf9a13e97befb7703a8.
export const anyliewLargeAvatarAnimations = [
  createFixedAvatarAnimation({
    key: "mihoyo_qiqi_suck", keywords: ["七七舔"], tags: ["米哈游", "原神"],
    frames: 68, delayMs: 60, sizes: [155, 155],
    positions: [
      [78, 641], [92, 617], [123, 589], [144, 550], [230, 542], [328, 546],
      [375, 552], [375, 552], [375, 552], [375, 552], [375, 552], [375, 552],
      [375, 552], [375, 552], [375, 552], [375, 552], [375, 552], [375, 552],
      [375, 552], [375, 552], [375, 552], [375, 552], [375, 552], [375, 552],
      [375, 552], [375, 552], [375, 552], [375, 552], [375, 552], [375, 552],
      [375, 552], [375, 552], [375, 552], [375, 552], [375, 552], [375, 552],
      [375, 552], [375, 552], [327, 546], [229, 542], [143, 548], [122, 588],
      [91, 616], [77, 640], [77, 640], [77, 640], [77, 640], [77, 640],
      [77, 640], [77, 640], [77, 640], [77, 640], [77, 640], [77, 640],
      [77, 640], [77, 640], [77, 640], [77, 640], [77, 640], [77, 640],
      [77, 640], [77, 640], [77, 640], [77, 640], [77, 640], [77, 640],
      [77, 640], [77, 640],
    ],
    // The original sender reduced the 1000 px source to 810 px.
    largeCanvas: { maxSide: 810 },
  }),
  createFixedAvatarAnimation({
    key: "moria_ruruka_probe", keywords: ["露露卡探头", "森亚露露卡探头"],
    frames: 77, delayMs: 30, positions: [0, 24], sizes: [476, 476],
    largeCanvas: {},
  }),
] as const;
