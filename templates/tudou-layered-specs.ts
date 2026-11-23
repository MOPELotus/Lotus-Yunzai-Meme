export type Pose = readonly [left: number, top: number, width: number, height: number];

export interface TudouAvatarLayer {
  readonly source: number;
  readonly poses: Pose | readonly Pose[];
  readonly mode: "resize-circle" | "cover-circle" | "circle-cover";
  readonly angle?: number;
  readonly below?: true;
  readonly visible?: readonly (readonly [first: number, last: number])[];
}

interface Composition {
  readonly key: string;
  readonly keywords: readonly string[];
  readonly tags?: readonly string[];
  readonly avatars: number;
  readonly viewport: readonly [width: number, height: number];
  readonly layers: readonly TudouAvatarLayer[];
  readonly artworkLast?: true;
}
export type TudouComposition = Composition & (
  { readonly frames: number; readonly delayMs: number; readonly still?: never } |
  { readonly frames: 1; readonly still: "jpeg" | "png"; readonly delayMs?: never }
);

// Pose tables and image parameters from LRZ9712/tudou-meme at 7e799eeaca9ce712eeabe41f964636c755a86c63.
export const tudouCompositions: readonly TudouComposition[] = [
  {
    key: "3p", keywords: ["3p"], avatars: 3, viewport: [351, 300], frames: 3,
    delayMs: 60,
    layers: [
      { source: 2, mode: "cover-circle", below: true, poses: [[74, 186, 114, 115], [73, 180, 119, 113], [81, 166, 108, 112]] },
      { source: 0, mode: "cover-circle", poses: [[187, -1, 123, 126], [172, 8, 123, 126], [200, -7, 123, 126]] },
      { source: 1, mode: "cover-circle", poses: [[6, 143, 93, 100], [7, 146, 93, 100], [6, 140, 93, 100]] },
    ],
  },
  {
    key: "kou", keywords: ["嗦", "口"], avatars: 2, viewport: [200, 200], frames: 2,
    delayMs: 50, artworkLast: true,
    layers: [
      { source: 1, mode: "cover-circle", poses: [[67, 99, 48, 48], [71, 98, 48, 48]] },
      { source: 0, mode: "cover-circle", angle: 15, poses: [[30, 37, 58, 58], [36, 42, 58, 58]] },
    ],
  },
  {
    key: "llq", keywords: ["群p", "群p我"], avatars: 1, viewport: [300, 270], frames: 5,
    delayMs: 800,
    layers: [
      { source: 0, mode: "resize-circle", visible: [[4, 4]], poses: [180, 90, 110, 110] },
    ],
  },
  {
    key: "nantongjue", keywords: ["男同撅", "猥琐撅"], avatars: 2, viewport: [512, 512], frames: 16,
    delayMs: 20,
    layers: [
      {
        source: 1, mode: "cover-circle", angle: 30, poses: [
          [42, 237, 133, 143], [44, 234, 133, 143], [44, 234, 133, 143], [43, 231, 133, 143],
          [43, 229, 133, 143], [46, 228, 133, 143], [46, 228, 133, 143], [43, 227, 133, 143],
          [43, 227, 133, 143], [43, 227, 133, 143], [46, 227, 133, 143], [46, 229, 133, 143],
          [46, 229, 133, 143], [46, 229, 133, 143], [46, 229, 133, 143], [46, 229, 133, 143],
        ],
      },
      {
        source: 0, mode: "cover-circle", angle: 1, poses: [
          [168, 66, 137, 151], [175, 66, 137, 151], [176, 67, 137, 151], [176, 67, 137, 151],
          [176, 67, 137, 151], [175, 65, 137, 151], [176, 68, 137, 151], [176, 68, 137, 151],
          [175, 66, 137, 151], [175, 66, 137, 151], [175, 67, 137, 151], [175, 68, 137, 151],
          [175, 68, 137, 151], [175, 69, 137, 151], [175, 69, 137, 151], [175, 67, 137, 151],
        ],
      },
    ],
  },
  {
    key: "nizhejiah", keywords: ["你这家伙", "军训"], avatars: 1, viewport: [489, 487], frames: 1,
    still: "jpeg",
    layers: [
      { source: 0, mode: "circle-cover", poses: [245, 45, 240, 220] },
    ],
  },
  {
    key: "nvtongjue", keywords: ["女同撅", "姐妹撅"], avatars: 2, viewport: [402, 431], frames: 14,
    delayMs: 50,
    layers: [
      {
        source: 1, mode: "cover-circle", angle: 30, poses: [
          [103, 109, 99, 99], [105, 109, 99, 99], [105, 109, 99, 99], [106, 109, 99, 99],
          [105, 109, 99, 99], [108, 114, 99, 99], [104, 117, 99, 99], [106, 118, 99, 99],
          [104, 118, 99, 99], [106, 119, 99, 99], [106, 119, 99, 99], [106, 119, 99, 99],
          [106, 119, 99, 99], [106, 119, 99, 99],
        ],
      },
      {
        source: 0, mode: "cover-circle", angle: 1, poses: [
          [207, 41, 106, 119], [207, 41, 106, 119], [209, 41, 106, 119], [216, 41, 106, 119],
          [223, 47, 106, 119], [223, 52, 106, 119], [218, 52, 106, 119], [223, 54, 106, 119],
          [226, 48, 106, 119], [216, 47, 106, 119], [208, 44, 106, 119], [204, 41, 106, 119],
          [205, 42, 106, 119], [204, 40, 106, 119],
        ],
      },
    ],
  },
  {
    key: "pao", keywords: ["跑"], avatars: 1, viewport: [50, 46], frames: 8,
    delayMs: 50,
    layers: [
      {
        source: 0, mode: "resize-circle", poses: [
          [12, 7, 24, 24], [12, 8, 24, 24], [12, 7, 24, 24], [12, 8, 24, 24],
          [12, 7, 24, 24], [12, 8, 24, 24], [12, 7, 24, 24], [12, 8, 24, 24],
        ],
      },
    ],
  },
  {
    key: "pingdiguo", keywords: ["平底锅", "拍死你"], avatars: 2, viewport: [200, 180], frames: 2,
    delayMs: 50, artworkLast: true,
    layers: [
      { source: 1, mode: "cover-circle", poses: [[21, 96, 91, 79], [17, 95, 91, 79]] },
      { source: 0, mode: "cover-circle", angle: 15, poses: [[41, 14, 99, 90], [40, 13, 99, 90]] },
    ],
  },
  {
    key: "qi", keywords: ["骑"], avatars: 2, viewport: [300, 296], frames: 1,
    tags: ["杰瑞", "猫和老鼠"], still: "png",
    layers: [
      { source: 1, mode: "circle-cover", below: true, poses: [16, 115, 113, 99] },
      { source: 0, mode: "circle-cover", below: true, poses: [138, 6, 94, 93] },
    ],
  },
  {
    key: "qian", keywords: ["牵", "调教"], avatars: 2, viewport: [433, 703], frames: 1,
    tags: ["杰瑞", "猫和老鼠"], still: "png",
    layers: [
      { source: 1, mode: "circle-cover", below: true, poses: [308, 432, 100, 100] },
      { source: 0, mode: "circle-cover", below: true, poses: [80, 144, 90, 90] },
    ],
  },
  {
    key: "shuaiqunwu", keywords: ["甩裙舞"], avatars: 1, viewport: [100, 100], frames: 17,
    delayMs: 50,
    layers: [
      {
        source: 0, mode: "resize-circle", poses: [
          [34, 8, 52, 52], [34, 8, 52, 52], [34, 13, 52, 52], [34, 16, 52, 52],
          [34, 16, 52, 52], [35, 14, 52, 52], [33, 12, 52, 52], [33, 10, 52, 52],
          [33, 10, 52, 52], [32, 12, 52, 52], [32, 14, 52, 52], [32, 16, 52, 52],
          [33, 16, 52, 52], [33, 15, 52, 52], [33, 14, 52, 52], [32, 11, 52, 52],
          [33, 12, 52, 52],
        ],
      },
    ],
  },
  {
    key: "zaoleipi", keywords: ["遭雷劈", "电"], avatars: 1, viewport: [300, 300], frames: 49,
    delayMs: 20,
    layers: [
      {
        source: 0, mode: "resize-circle", visible: [[0, 10], [16, 38]], poses: [
          [133, 81, 112, 111], [129, 71, 127, 129], [129, 71, 127, 129], [129, 71, 127, 129],
          [149, 81, 127, 129], [152, 81, 127, 129], [154, 81, 127, 129], [164, 81, 127, 129],
          [164, 121, 127, 129], [154, 121, 127, 129], [104, 66, 127, 129], [60, 36, 127, 129],
          [60, 36, 127, 129], [60, 36, 127, 129], [61, 45, 92, 92], [66, 50, 92, 92],
          [69, 90, 92, 92], [66, 120, 92, 92], [60, 130, 92, 92], [60, 140, 92, 92],
          [52, 144, 98, 104], [31, 128, 103, 100], [41, 128, 103, 100], [51, 122, 103, 100],
          [61, 112, 103, 100], [74, 100, 108, 104], [73, 102, 116, 110], [66, 95, 123, 116],
          [58, 88, 137, 129], [50, 82, 146, 135], [38, 82, 158, 142], [30, 76, 166, 152],
          [4, 66, 181, 168], [0, 70, 173, 168], [-50, 80, 182, 177], [-50, 80, 182, 177],
          [-18, 98, 167, 178], [0, 91, 192, 177], [19, 75, 192, 177], [27, 62, 192, 177],
          [27, 62, 192, 177], [27, 62, 192, 177], [27, 62, 192, 177], [27, 62, 192, 177],
          [27, 62, 192, 177], [27, 62, 192, 177], [35, 45, 192, 177], [27, 53, 192, 177],
          [27, 53, 192, 177],
        ],
      },
    ],
  },
  {
    key: "zuo", keywords: ["坐", "镇压"], avatars: 2, viewport: [246, 275], frames: 4,
    delayMs: 50, artworkLast: true,
    layers: [
      { source: 1, mode: "cover-circle", poses: [9, 143, 58, 58] },
      { source: 0, mode: "cover-circle", angle: 1, poses: [61, 43, 62, 58] },
    ],
  },
];
