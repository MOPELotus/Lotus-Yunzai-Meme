import { createFixedAvatarAnimation } from "./fixed-avatar-animation.ts";

// Pose tables and delays come from the fixed AnyLiew registrations.
export const anyliewFixedAnimationV2 = [
  createFixedAvatarAnimation({
    key: "ikun_chicken_year", keywords: ["鸡年"], frames: 108, delayMs: 50,
    sourceHolds: Array<number>(108).fill(1),
    positions: [37, 37],
    sizes: [150, 150],
  }),
  createFixedAvatarAnimation({
    key: "ikun_elastic", keywords: ["弹坤"], frames: 13, delayMs: 50,
    positions: [
      [89, 82], [90, 83], [87, 83], [87, 83], [87, 83], [87, 83], [86, 84], [87, 84], [89, 84],
      [92, 87], [95, 88], [94, 86], [88, 83],
    ],
    sizes: [112, 112],
  }),
  createFixedAvatarAnimation({
    key: "ikun_kfc", keywords: ["肯德坤"], frames: 12, delayMs: 50,
    positions: [
      [51, 51], [53, 51], [59, 44], [60, 0], [64, 0], [69, 36], [71, 33], [69, 36], [64, 0],
      [60, 0], [59, 44], [53, 51],
    ],
    sizes: [
      [184, 121], [175, 121], [170, 119], [161, 161], [169, 159], [166, 122], [163, 118], [166, 122], [169, 159],
      [161, 161], [170, 119], [175, 121],
    ],
  }),
  createFixedAvatarAnimation({
    key: "ikun_year", keywords: ["坤年"], frames: 12, delayMs: 50,
    // Its original twelve-frame loop reuses the first seven numbered assets.
    framePath: frame => `anyliew/emoji/ikun_year/images/${(frame - 1) % 7 + 1}.png`,
    positions: [27, 35],
    sizes: [172, 172],
  }),
  createFixedAvatarAnimation({
    key: "inspiration", keywords: ["灵机一现", "灵感", "灵光一动"], frames: 6, delayMs: 100,
    sourceHolds: [
      4, 1, 1, 2, 1, 6,
    ],
    positions: [50, 50],
    sizes: [112, 112],
  }),
  createFixedAvatarAnimation({
    key: "lace", keywords: ["花边"], frames: 22, delayMs: 140,
    sourceHolds: Array<number>(22).fill(1),
    positions: [23, 23],
    sizes: [173, 173],
  }),
  createFixedAvatarAnimation({
    key: "lochi_mari_play", keywords: ["玛丽玩", "伊落玛丽玩"], frames: 16, delayMs: 60,
    tags: ["蔚蓝档案", "碧蓝档案"],
    sourceHolds: Array<number>(16).fill(1),
    positions: [
      [85, 178], [85, 178], [88, 177], [91, 178], [91, 178], [86, 178], [86, 178], [86, 178], [86, 178],
      [86, 178], [88, 178], [91, 179], [91, 179], [91, 179], [90, 178], [87, 178],
    ],
    sizes: [62, 62],
  }),
  createFixedAvatarAnimation({
    key: "look_leg", keywords: ["看看腿", "看看脚"], frames: 5, delayMs: 30,
    sourceHolds: [
      1, 2, 1, 1, 2,
    ],
    positions: [30, 51],
    sizes: [73, 73],
  }),
  createFixedAvatarAnimation({
    key: "maodie_whipped", keywords: ["耄耋打"], frames: 28, delayMs: 100,
    sourceHolds: Array<number>(28).fill(1),
    positions: [
      [70, 73], [71, 69], [71, 69], [65, 66], [52, 61], [41, 65], [38, 68], [38, 69], [44, 72],
      [50, 71], [58, 69], [63, 68], [60, 71], [55, 74], [53, 74], [54, 73], [64, 71], [77, 72],
      [81, 72], [81, 72], [73, 71], [58, 70], [33, 70], [31, 71], [40, 73], [44, 76], [48, 76],
      [54, 74],
    ],
    sizes: [59, 59],
  }),
  createFixedAvatarAnimation({
    key: "merry_christmas", keywords: ["圣诞快乐", "圣诞节快乐"], frames: 8, delayMs: 100,
    positions: [60, 90],
    sizes: [93, 77],
  }),
  createFixedAvatarAnimation({
    key: "mihoyo_bailu_kick", keywords: ["白露踢"], frames: 32, delayMs: 90,
    tags: ["崩坏：星穹铁道", "米哈游"],
    sourceHolds: [
      4, 1, 1, 1, 1, 1, 1, 1, 1,
      1, 1, 1, 1, 1, 1, 1, 1, 1,
      1, 1, 1, 1, 1, 1, 1, 1, 1,
      1, 1, 1, 1, 1,
    ],
    positions: [
      [49, 67], [49, 67], [49, 67], [49, 67], [31, 35], [11, 32], [1, 47], [2, 60], [3, 62],
      [7, 64], [9, 70], [8, 76], [4, 106], [2, 157], [11, 156], [29, 47], [47, 1], [56, -28],
      [66, -26], [92, -36], [127, 4], [150, 56], [130, 63], [86, 46], [28, 54], [-25, 151], [13, 99],
      [132, 29], [167, 6], [207, 1], [220, 29], [227, 61], [159, 17], [104, -28], [76, -39],
    ],
    sizes: [60, 60],
  }),
  createFixedAvatarAnimation({
    key: "mihoyo_sangonomiya_kokomi_love", keywords: ["心海爱心"], frames: 29, delayMs: 40,
    tags: ["米哈游", "原神"],
    sourceHolds: Array<number>(29).fill(1),
    positions: [
      [239, 234], [243, 234], [250, 231], [258, 229], [260, 228], [254, 230], [245, 233], [239, 234], [246, 233],
      [255, 230], [260, 228], [257, 229], [248, 232], [245, 233], [239, 234], [239, 234], [239, 234], [239, 234],
      [239, 234], [239, 234], [239, 234], [239, 234], [239, 234], [239, 234], [239, 234], [239, 234], [239, 234],
      [239, 234], [239, 234],
    ],
    sizes: [
      [185, 144], [180, 145], [170, 155], [158, 164], [156, 167], [164, 159], [177, 148], [186, 144], [176, 150],
      [163, 160], [156, 167], [160, 163], [173, 156], [178, 147], [185, 144], [185, 144], [185, 144], [185, 144],
      [185, 144], [185, 144], [185, 144], [185, 144], [185, 144], [185, 144], [185, 144], [185, 144], [185, 144],
      [185, 144], [185, 144],
    ],
  }),
  createFixedAvatarAnimation({
    key: "nailoong_hit", keywords: ["奶龙打"], frames: 31, delayMs: 70,
    sourceHolds: Array<number>(31).fill(1),
    positions: [
      [107, 101], [106, 101], [105, 100], [129, 116], [133, 117], [133, 115], [128, 113], [125, 110], [125, 110],
      [124, 110], [124, 110], [123, 110], [123, 110], [122, 109], [121, 109], [114, 104], [112, 103], [111, 103],
      [112, 104], [111, 101], [111, 101], [111, 102], [111, 104], [112, 103], [112, 103], [113, 104], [113, 104],
      [113, 104], [112, 104], [112, 104], [112, 104],
    ],
    sizes: [60, 60],
  }),
  createFixedAvatarAnimation({
    key: "nailoong_kiss", keywords: ["奶龙吻"], frames: 20, delayMs: 130,
    // Before frame four the original composes only the foreground.
    sourceHolds: Array<number>(20).fill(1),
    positions: [
      [0, 0], [0, 0], [0, 0], [68, 57], [67, 57], [69, 54], [81, 51], [98, 57], [99, 57],
      [99, 57], [95, 55], [62, 46], [60, 45], [60, 45], [49, 48], [46, 48], [38, 50], [38, 51],
      [30, 61], [27, 63],
    ],
    sizes: [
      [0, 0], [0, 0], [0, 0], [69, 69], [69, 69], [69, 69], [69, 69], [69, 69], [69, 69],
      [69, 69], [69, 69], [69, 69], [69, 69], [69, 69], [76, 76], [76, 76], [85, 85], [85, 85],
      [85, 85], [85, 85],
    ],
  }),
] as const;
