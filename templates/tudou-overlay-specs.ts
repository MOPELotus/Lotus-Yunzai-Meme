import type { TudouComposition } from "./tudou-layered-specs.ts";

// Original frame geometry and mask placement from LRZ9712/tudou-meme 7e799eeaca9ce712eeabe41f964636c755a86c63.
export const tudouOverlays: readonly TudouComposition[] = [
  {
    key: "anmo", keywords: ["玩具"], avatars: 1, viewport: [247, 202], frames: 21, delayMs: 50,
    layers: [{ source: 0, mode: "resize-circle",
      poses: [
        [21, 70, 78, 78], [21, 70, 78, 78], [21, 62, 78, 78], [21, 42, 78, 78], [25, 36, 78, 78],
        [37, 23, 78, 78], [43, 11, 78, 78], [48, 5, 78, 78], [41, 9, 78, 78], [35, 25, 78, 78],
        [25, 40, 78, 78], [23, 47, 78, 78], [23, 62, 78, 78], [23, 66, 78, 78], [23, 85, 78, 78],
        [21, 87, 78, 78], [21, 91, 78, 78], [21, 97, 78, 78], [23, 106, 74, 74], [23, 96, 74, 74],
        [25, 90, 74, 74],
      ],
    }],
  },
  {
    key: "chiwoyichui", keywords: ["吃我一锤"], avatars: 1, viewport: [382, 382], frames: 12, delayMs: 70,
    layers: [{ source: 0, mode: "resize-circle", initialCircle: [100, 100],
      poses: [
        [252, 171, 102, 102], [258, 187, 102, 102], [257, 180, 102, 102], [259, 170, 102, 102], [258, 186, 102, 102],
        [256, 176, 102, 102], [255, 171, 102, 102], [255, 171, 102, 102], [254, 175, 102, 102], [254, 167, 102, 102],
        [257, 183, 102, 102], [257, 173, 102, 102],
      ],
    }],
  },
  {
    key: "chuosini", keywords: ["戳死你", "戳"], avatars: 1, viewport: [185, 158], frames: 4, delayMs: 50,
    layers: [{ source: 0, mode: "resize-circle", below: true, squareFirst: true,
      poses: [[92, 106, 42, 42], [117, 91, 42, 42], [129, 105, 42, 42], [125, 105, 42, 42]],
    }],
  },
  {
    key: "daomaoyan", keywords: ["导冒烟"], avatars: 1, viewport: [80, 80], frames: 3, delayMs: 20,
    layers: [{ source: 0, mode: "resize-circle", initialCircle: "input",
      poses: [[23, 4, 45, 38], [11, 15, 44, 36], [22, 4, 44, 36]],
    }],
  },
  {
    key: "daqi", keywords: ["打气", "炸奶"], avatars: 1, viewport: [123, 85], frames: 18, delayMs: 80, artworkLast: true,
    layers: [{ source: 0, mode: "resize-circle", initialCircle: "input",
      poses: [
        [73, 1, 33, 33], [74, 2, 33, 33], [75, 1, 33, 33], [74, 0, 33, 33], [74, 0, 33, 33],
        [73, 0, 33, 33], [74, 0, 33, 33], [74, 1, 33, 33], [73, 2, 33, 33], [73, 0, 33, 33],
        [74, 0, 33, 33], [73, 1, 33, 33], [72, 1, 33, 33], [74, 1, 33, 33], [73, 2, 33, 33],
        [73, 2, 33, 33], [72, 1, 33, 33], [73, 1, 33, 33],
      ],
    }],
  },
  {
    key: "eshi", keywords: ["屙屎", "大便攻击"], avatars: 1, viewport: [155, 155], frames: 4, delayMs: 50,
    layers: [{ source: 0, mode: "resize-circle", initialCircle: [60, 60],
      poses: [[6, 37, 56, 41], [7, 37, 56, 41], [8, 36, 53, 41], [8, 36, 57, 41]],
    }],
  },
  {
    key: "jiumi", keywords: ["揪咪", "掐咪咪揪咪咪"], avatars: 1, viewport: [240, 240], frames: 7, delayMs: 80,
    layers: [{ source: 0, mode: "resize-circle", initialCircle: [90, 90],
      poses: [
        [46, 50, 86, 75], [46, 52, 86, 75], [46, 51, 86, 75], [46, 50, 86, 75], [44, 50, 88, 77],
        [48, 54, 85, 75], [48, 52, 84, 74],
      ],
    }],
  },
  {
    key: "maodielanqiu", keywords: ["耄耋篮球"], avatars: 1, viewport: [50, 49], frames: 22, delayMs: 50,
    layers: [{ source: 0, mode: "resize-circle", initialCircle: "input", below: true,
      poses: [
        [1, 27, 14, 14], [1, 27, 14, 14], [2, 26, 14, 14], [2, 30, 14, 14], [2, 34, 14, 14],
        [2, 33, 14, 14], [2, 29, 14, 14], [2, 28, 14, 14], [2, 27, 14, 14], [2, 33, 14, 14],
        [2, 34, 14, 14], [2, 31, 14, 14], [2, 28, 14, 14], [6, 30, 12, 12], [16, 37, 10, 10],
        [25, 36, 10, 10], [33, 29, 10, 10], [37, 24, 10, 10], [32, 29, 10, 10], [24, 37, 10, 10],
        [16, 37, 10, 10], [5, 29, 13, 13],
      ],
    }],
  },
  {
    key: "mengqin", keywords: ["猛亲", "仓鼠亲", "一顿亲"], avatars: 1, viewport: [240, 240], frames: 4, delayMs: 50,
    layers: [{ source: 0, mode: "resize-circle", initialCircle: [66, 66],
      poses: [[37, 121, 66, 66], [37, 121, 66, 66], [37, 121, 66, 66], [34, 124, 66, 66]],
    }],
  },
  {
    key: "painitou", keywords: ["拍你头"], avatars: 1, viewport: [472, 472], frames: 5, delayMs: 80,
    layers: [{ source: 0, mode: "resize-circle", initialCircle: [130, 110],
      poses: [
        [98, 296, 125, 102], [97, 295, 125, 102], [96, 297, 125, 102], [98, 297, 125, 102], [95, 297, 125, 102],
      ],
    }],
  },
  {
    key: "qikonglong", keywords: ["骑恐龙", "恐龙"], avatars: 1, viewport: [128, 128], frames: 10, delayMs: 50,
    layers: [{ source: 0, mode: "resize-circle", initialCircle: [45, 45],
      poses: [
        [36, 13, 37, 32], [36, 14, 36, 31], [39, 14, 36, 31], [39, 18, 36, 31], [37, 19, 36, 31],
        [37, 20, 36, 31], [35, 16, 36, 31], [34, 17, 36, 31], [32, 14, 36, 31], [31, 16, 36, 31],
      ],
    }],
  },
  {
    key: "rudong", keywords: ["蠕动", "磕头"], avatars: 1, viewport: [80, 80], frames: 6, delayMs: 50,
    layers: [{ source: 0, mode: "resize-circle",
      poses: [
        [7, 14, 44, 45], [5, 15, 44, 45], [4, 26, 44, 45], [3, 25, 44, 45], [3, 23, 46, 47],
        [3, 20, 46, 47],
      ],
    }],
  },
  {
    key: "shuibuzhao", keywords: ["睡不着"], avatars: 1, viewport: [488, 500], frames: 4, delayMs: 40,
    layers: [{ source: 0, mode: "resize-circle", initialCircle: [120, 120],
      poses: [[94, 133, 110, 110], [98, 139, 110, 110], [98, 143, 110, 110], [93, 139, 110, 110]],
    }],
  },
  {
    key: "tianxie", keywords: ["舔鞋", "红高跟", "嘬高跟", "嘬鞋"], avatars: 1, viewport: [240, 240], frames: 2, delayMs: 50,
    layers: [{ source: 0, mode: "resize-circle", initialCircle: [70, 70],
      poses: [[102, 117, 61, 61], [102, 116, 61, 61]],
    }],
  },
  {
    key: "wang", keywords: ["王"], avatars: 1, viewport: [240, 240], frames: 8, delayMs: 50,
    layers: [{ source: 0, mode: "resize-circle", initialCircle: [118, 118],
      poses: [
        [49, 60, 118, 71], [51, 62, 118, 71], [52, 61, 117, 71], [55, 60, 112, 71], [58, 60, 107, 71],
        [52, 66, 115, 71], [52, 62, 112, 71], [54, 60, 113, 71],
      ],
    }],
  },
  {
    key: "zhuatou", keywords: ["抓头"], avatars: 1, viewport: [240, 240], frames: 22, delayMs: 50, artworkLast: true,
    layers: [{ source: 0, mode: "resize-circle", initialCircle: [100, 100],
      poses: [
        [27, 160, 73, 58], [26, 159, 75, 60], [26, 157, 75, 60], [26, 146, 75, 72], [27, 116, 77, 83],
        [28, 88, 75, 101], [28, 91, 75, 100], [28, 96, 75, 98], [26, 94, 77, 101], [28, 97, 75, 98],
        [27, 99, 75, 96], [26, 101, 75, 96], [28, 98, 75, 96], [28, 99, 75, 96], [28, 106, 75, 89],
        [31, 106, 75, 89], [27, 106, 75, 89], [27, 106, 75, 89], [27, 103, 75, 89], [26, 102, 75, 89],
        [27, 95, 75, 101], [27, 99, 75, 97],
      ],
    }],
  },
];
