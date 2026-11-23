import type { TudouComposition } from "./tudou-layered-specs.ts";

// Original LRZ9712/tudou-meme coordinates from revision 7e799eeaca9ce712eeabe41f964636c755a86c63.
export const tudouExtraCompositions: readonly TudouComposition[] = [
  {
    key: "baipiaoguai", keywords: ["白嫖怪"], avatars: 1, viewport: [162, 152], frames: 1, still: "jpeg", firstFrameOnly: true,
    layers: [
      { source: 0, mode: "resize-circle", initialCircle: [94, 94], poses: [67, 17, 94, 94] },
    ],
  },
  {
    key: "cat_jue", keywords: ["猫猫撅", "猫撅", "猫咪撅"], avatars: 2, viewport: [128, 128], frames: 12, delayMs: 20,
    layers: [
      { source: 0, mode: "resized-circle-cover", initialCircle: "input", poses: [
        [54, 15, 60, 52], [50, 16, 63, 50], [51, 14, 62, 55], [51, 14, 61, 53],
        [54, 14, 59, 55], [51, 15, 61, 53], [51, 15, 61, 53], [51, 15, 66, 50],
        [52, 15, 63, 53], [50, 15, 65, 53], [52, 15, 61, 53], [52, 14, 61, 53],
      ] },
      { source: 1, mode: "resized-circle-cover", initialCircle: "input", poses: [
        [8, 69, 57, 46], [7, 68, 59, 48], [6, 66, 61, 47], [7, 67, 59, 48],
        [7, 68, 59, 48], [6, 68, 60, 46], [6, 67, 60, 46], [6, 67, 61, 46],
        [8, 68, 61, 46], [7, 68, 61, 47], [8, 67, 59, 46], [8, 67, 59, 46],
      ] },
    ],
  },
  {
    key: "dorochoumei", keywords: ["doro臭美"], avatars: 1, viewport: [1080, 980], frames: 1, still: "jpeg",
    layers: [
      { source: 0, mode: "stretch", below: true, poses: [712, 285, 167, 167] },
    ],
  },
  {
    key: "drag_trash", keywords: ["拖垃圾人"], avatars: 2, viewport: [480, 480], frames: 26, delayMs: 50,
    layers: [
      { source: 0, mode: "resized-circle-cover", initialCircle: [126, 120], initialCover: true, poses: [
        [302, 188, 126, 120], [302, 195, 126, 120], [301, 208, 117, 112], [296, 206, 117, 112],
        [296, 202, 117, 112], [308, 208, 117, 112], [310, 211, 117, 112], [307, 209, 117, 112],
        [258, 221, 117, 112], [241, 208, 115, 114], [235, 212, 115, 114], [241, 211, 115, 114],
        [238, 211, 105, 114], [239, 221, 105, 114], [235, 220, 124, 114], [265, 224, 136, 124],
        [287, 229, 133, 124], [291, 226, 133, 124], [285, 227, 133, 124], [277, 224, 133, 124],
        [279, 226, 133, 124], [290, 235, 133, 124], [280, 230, 133, 124], [265, 250, 133, 124],
        [251, 253, 125, 110], [245, 249, 122, 110],
      ] },
      { source: 1, mode: "resized-circle-cover", initialCircle: [104, 131], initialCover: true, poses: [
        [111, 233, 104, 131], [103, 243, 119, 104], [112, 228, 104, 122], [98, 240, 120, 99],
        [108, 233, 120, 116], [116, 236, 120, 116], [105, 254, 120, 92], [108, 234, 109, 131],
        [112, 234, 109, 107], [110, 248, 109, 107], [105, 240, 109, 107], [105, 236, 109, 107],
        [105, 242, 109, 107], [105, 239, 109, 107], [105, 240, 109, 107], [99, 262, 123, 79],
        [118, 240, 88, 122], [101, 254, 120, 85], [121, 236, 88, 116], [108, 240, 114, 116],
        [108, 239, 114, 116], [112, 243, 114, 116], [116, 240, 114, 116], [119, 246, 114, 116],
        [119, 246, 114, 116], [112, 245, 114, 116],
      ] },
    ],
  },
  {
    key: "feiji", keywords: ["飞鸡"], avatars: 2, viewport: [1179, 1099], frames: 1, delayMs: 1000,
    layers: [
      { source: 0, mode: "resize-circle", initialCircle: [160, 160], poses: [259, 266, 149, 149] },
      { source: 1, mode: "stretch", poses: [1058, 124, 154, 154] },
    ],
  },
  {
    key: "gejiji", keywords: ["割鸡鸡", "割jj"], avatars: 1, viewport: [194, 258], frames: 41, delayMs: 50,
    layers: [
      { source: 0, mode: "resize-circle", initialCircle: [47, 47], poses: [
        [104, 20, 44, 44], [101, 18, 42, 42], [98, 14, 46, 46], [97, 12, 47, 47],
        [95, 8, 47, 47], [92, 4, 47, 47], [90, 1, 47, 47], [90, 1, 47, 47],
        [90, 1, 47, 47], [89, 0, 47, 47], [89, -1, 47, 47], [88, 0, 47, 47],
        [89, 0, 47, 47], [90, 0, 47, 47], [91, 1, 47, 47], [91, 1, 47, 47],
        [92, 5, 47, 47], [95, 6, 47, 47], [95, 8, 47, 47], [96, 10, 47, 47],
        [96, 15, 47, 47], [96, 20, 47, 47], [96, 20, 47, 47], [96, 20, 47, 47],
        [96, 19, 47, 47], [98, 20, 47, 47], [97, 21, 47, 47], [96, 20, 47, 47],
        [95, 20, 47, 47], [97, 20, 47, 47], [95, 21, 47, 47], [95, 21, 47, 47],
        [94, 21, 47, 47], [98, 23, 47, 47], [100, 23, 47, 47], [102, 22, 47, 47],
        [103, 22, 47, 47], [104, 20, 47, 47], [104, 20, 47, 47], [104, 20, 47, 47],
        [102, 20, 47, 47],
      ] },
    ],
  },
  {
    key: "gemen_hug", keywords: ["哥们抱", "兄弟抱"], avatars: 1, viewport: [270, 218], frames: 1, still: "jpeg",
    layers: [
      { source: 0, mode: "stretch", below: true, poses: [87, 25, 78, 71] },
    ],
  },
  {
    key: "grab_cat", keywords: ["抓咪咪", "抓奶", "抓奶子", "抓咪"], avatars: 1, viewport: [500, 494], frames: 12, delayMs: 50,
    layers: [
      { source: 0, mode: "resize-circle", initialCircle: [121, 121], initialCover: true, poses: [
        [27, -5, 121, 121], [25, -8, 121, 121], [29, -2, 121, 121], [37, 8, 121, 121],
        [32, 2, 121, 121], [29, -6, 121, 121], [30, 0, 121, 121], [35, 3, 121, 121],
        [25, -3, 121, 121], [25, 0, 121, 121], [24, -5, 121, 121], [35, 2, 121, 121],
      ] },
    ],
  },
  {
    key: "juwu", keywords: ["巨物"], avatars: 1, viewport: [640, 640], frames: 1, resizeArtwork: true, opaqueOutput: true, still: "png", artworkLast: true,
    layers: [
      { source: 0, mode: "stretch", opaque: true, poses: [0, 0, 640, 640] },
    ],
  },
  {
    key: "kanniuzi", keywords: ["看牛子"], avatars: 1, viewport: [300, 411], frames: 1, still: "jpeg", firstFrameOnly: true, artworkLast: true,
    layers: [
      { source: 0, mode: "cover", poses: [37, 2, 215, 215] },
    ],
  },
  {
    key: "lick_cat", keywords: ["舔咪", "舔奶子", "舔咪咪"], avatars: 1, viewport: [500, 497], frames: 10, delayMs: 50,
    layers: [
      { source: 0, mode: "resize-circle", initialCircle: [143, 143], initialCover: true, poses: [
        [-8, 72, 143, 143], [-10, 75, 143, 143], [-13, 68, 143, 143], [-6, 83, 143, 143],
        [-10, 72, 143, 143], [-8, 81, 143, 143], [-17, 75, 143, 143], [-19, 80, 143, 143],
        [-8, 78, 143, 143], [-8, 78, 143, 143],
      ] },
    ],
  },
  {
    key: "liugou", keywords: ["遛狗"], avatars: 1, viewport: [260, 260], frames: 16, delayMs: 70,
    layers: [
      { source: 0, mode: "resize-circle", initialCircle: [70, 70], expandedAngle: -2, poses: [
        [9, 169, 64, 64], [8, 171, 64, 64], [13, 166, 64, 64], [8, 171, 64, 64],
        [10, 172, 64, 64], [11, 169, 64, 64], [12, 169, 64, 64], [8, 173, 64, 64],
        [8, 173, 64, 64], [10, 171, 64, 64], [10, 168, 64, 64], [6, 172, 66, 66],
        [8, 174, 63, 63], [8, 171, 63, 63], [13, 167, 63, 63], [8, 171, 63, 63],
      ] },
    ],
  },
];
