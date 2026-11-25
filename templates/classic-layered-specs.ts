import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("meme", messageCatalog.messages);
// Original keys, poses and preparation steps from MemeCrafters/meme-generator v0.1.14.
// https://github.com/MemeCrafters/meme-generator/tree/619fa10518fc2eca4fa1053af37f0a00a839f062/meme_generator/memes
import type { ProjectiveQuad } from "./projective-transform.ts";

type Point = readonly [x: number, y: number];
export type Rectangle = readonly [x: number, y: number, width: number, height: number, angle?: number];
export type Projection = { readonly position: Point; readonly quad: ProjectiveQuad };
export type AvatarLayer = Rectangle | Projection;
export type Fit = "square" | "cover" | "stretch";

export interface ClassicLayeredSpec {
  readonly key: string;
  readonly keywords: readonly string[];
  readonly tags?: readonly string[];
  readonly cadence: number;
  readonly layering: "under" | "above" | "paper";
  readonly fit?: Fit;
  readonly initialSize?: Point;
  readonly circle?: "always" | "option";
  readonly animatedInput?: boolean;
  readonly frames: readonly (readonly AvatarLayer[])[];
}

function slots(points: readonly Point[], width: number, height = width): readonly Rectangle[][] {
  return points.map(([x, y]) => [[x, y, width, height]]);
}

function rectangles(rects: readonly Rectangle[]): readonly Rectangle[][] {
  return rects.map(rect => [rect]);
}

const dog: readonly Point[] = [
  [36, 408], [36, 410], [40, 375], [40, 355], [36, 325], [28, 305], [28, 305], [28, 305],
  [28, 305], [28, 285], [28, 285], [28, 285], [28, 285], [28, 290], [30, 295], [30, 300],
  [30, 300], [30, 300], [30, 300], [30, 300], [30, 300], [28, 298], [26, 296], [24, 294],
  [28, 294], [26, 294], [24, 294], [35, 294], [115, 330], [150, 355], [180, 420], [180, 450],
  [150, 450], [150, 450],
];
const stickman: readonly Point[] = [
  [194, 53], [194, 53], [194, 52], [195, 52], [196, 52], [197, 52], [198, 51], [199, 51],
  [200, 51], [201, 51], [201, 52], [202, 53], [200, 53], [198, 54], [196, 54], [194, 54],
  [192, 55], [190, 55], [190, 54], [192, 53], [194, 53], [194, 52], [195, 52], [196, 52],
  [195, 52], [194, 52], [194, 53], [193, 53], [192, 53], [191, 53], [191, 54], [190, 54],
  [189, 54], [190, 54], [191, 54], [192, 53], [192, 53], [193, 53], [194, 53], [194, 52],
  [195, 52], [196, 52], [195, 52], [194, 52], [193, 53], [193, 53], [192, 53], [191, 54],
  [190, 54], [190, 54], [190, 54], [191, 54], [191, 53], [192, 53], [193, 53], [194, 53],
  [194, 52], [195, 52], [196, 52], [196, 52], [197, 52], [198, 51], [199, 51], [200, 51],
  [201, 51], [200, 52], [201, 52], [202, 53], [199, 53], [197, 54], [195, 54], [193, 54],
  [191, 55], [190, 54], [192, 53], [194, 53], [194, 52], [195, 52], [196, 52], [197, 52],
  [198, 51], [199, 51], [200, 51], [201, 51], [201, 52], [202, 53], [200, 53], [197, 54],
  [195, 54], [193, 54], [191, 55], [190, 54], [192, 53], [194, 53], [195, 52], [196, 52],
  [197, 52], [198, 51], [199, 51], [200, 51], [201, 52], [202, 53], [200, 53], [197, 54],
  [195, 54], [193, 54], [191, 55], [190, 54], [189, 58],
];
const subject: readonly Point[] = [
  [60, 71], [61, 73], [62, 71], [66, 70], [75, 69], [87, 74], [87, 74], [85, 76],
  [79, 73], [76, 71], [68, 69], [66, 73], [66, 74], [66, 74], [66, 71], [76, 65],
  [80, 65], [91, 73], [91, 77], [91, 75], [86, 71], [83, 69], [78, 68], [73, 67],
  [68, 74], [68, 77], [71, 73], [81, 68], [88, 69], [96, 73], [98, 78], [97, 79],
  [93, 76], [85, 71], [80, 66], [71, 69], [69, 74], [68, 77], [68, 77], [80, 70],
  [91, 68], [95, 71], [98, 78], [97, 79], [95, 78], [86, 69], [77, 64], [71, 69],
  [71, 73], [69, 73], [73, 67], [78, 65], [88, 65], [91, 72], [94, 77], [91, 74],
  [89, 70], [83, 63], [75, 60], [69, 67], [67, 74], [68, 73], [76, 64], [77, 60],
  [84, 62], [92, 68], [92, 73], [90, 69], [86, 66], [80, 61], [69, 63], [65, 67],
  [60, 76], [62, 73], [66, 68], [75, 62], [77, 62], [85, 69], [86, 73], [85, 75],
  [78, 70], [74, 67], [67, 67], [65, 72], [65, 79],
];

const bocchi: readonly Projection[] = [
  { position: [146, 173], quad: [[54, 62], [353, 1], [379, 382], [1, 399]] },
  { position: [146, 174], quad: [[54, 61], [349, 1], [379, 381], [1, 398]] },
  { position: [152, 174], quad: [[54, 61], [349, 1], [379, 381], [1, 398]] },
  { position: [158, 167], quad: [[54, 61], [335, 1], [379, 381], [1, 398]] },
  { position: [157, 149], quad: [[54, 61], [335, 1], [370, 381], [1, 398]] },
  { position: [167, 108], quad: [[41, 59], [321, 1], [357, 379], [1, 396]] },
  { position: [173, 69], quad: [[41, 57], [315, 1], [357, 377], [1, 394]] },
  { position: [175, 43], quad: [[41, 56], [309, 1], [353, 380], [1, 393]] },
  { position: [174, 30], quad: [[41, 56], [314, 1], [353, 380], [1, 393]] },
  { position: [171, 18], quad: [[41, 50], [312, 1], [348, 367], [1, 387]] },
  { position: [178, 14], quad: [[35, 50], [306, 1], [342, 367], [1, 386]] },
];
const tankuku: readonly Projection[] = [
  { position: [68, 91], quad: [[0, 46], [320, 0], [350, 214], [38, 260]] },
  { position: [184, 77], quad: [[18, 0], [328, 28], [298, 227], [0, 197]] },
  { position: [194, 65], quad: [[15, 0], [294, 28], [278, 216], [0, 188]] },
  { position: [203, 55], quad: [[14, 0], [279, 27], [262, 205], [0, 178]] },
  { position: [209, 49], quad: [[14, 0], [270, 25], [252, 195], [0, 170]] },
  { position: [215, 41], quad: [[15, 0], [260, 25], [242, 186], [0, 164]] },
  { position: [223, 35], quad: [[10, 0], [245, 21], [230, 180], [0, 157]] },
  { position: [231, 25], quad: [[13, 0], [230, 21], [218, 168], [0, 147]] },
  { position: [238, 21], quad: [[13, 0], [220, 23], [210, 167], [0, 140]] },
  { position: [254, 13], quad: [[27, 0], [226, 46], [196, 182], [0, 135]] },
  { position: [254, 13], quad: [[27, 0], [226, 46], [196, 182], [0, 135]] },
  { position: [254, 13], quad: [[27, 0], [226, 46], [196, 182], [0, 135]] },
  { position: [175, 9], quad: [[0, 35], [200, 0], [224, 133], [25, 169]] },
  { position: [195, 17], quad: [[0, 35], [200, 0], [224, 133], [25, 169]] },
  { position: [195, 17], quad: [[0, 35], [200, 0], [224, 133], [25, 169]] },
];
const capoo: readonly Projection[] = [
  { position: [28, 47], quad: [[0, 4], [153, 0], [138, 105], [0, 157]] },
  { position: [28, 48], quad: [[1, 13], [151, 0], [130, 104], [0, 156]] },
  { position: [18, 51], quad: [[9, 10], [156, 0], [152, 108], [0, 155]] },
  { position: [17, 53], quad: [[0, 21], [150, 0], [146, 115], [7, 145]] },
  { position: [2, 62], quad: [[0, 19], [156, 0], [199, 109], [31, 145]] },
  { position: [16, 58], quad: [[0, 28], [156, 0], [171, 115], [12, 154]] },
  { position: [18, 63], quad: [[0, 25], [157, 0], [169, 113], [13, 147]] },
];

export const classicLayeredSpecs: readonly ClassicLayeredSpec[] = [
  { key: "dog_dislike", keywords: ["狗都不玩"], cadence: 80, layering: "above", fit: "cover", circle: "option", frames: slots(dog, 122) },
  { key: "stickman_dancing", keywords: ["跳舞", "火柴人跳舞"], tags: ["火柴人"], cadence: 30, layering: "above", circle: "always", frames: slots(stickman, 138) },
  { key: "subject3", keywords: ["科目三"], cadence: 80, layering: "above", circle: "always", frames: slots(subject, 120) },
  { key: "throw_gif", keywords: ["抛", "掷"], cadence: 100, layering: "above", circle: "always", frames: [
    [[108, 36, 32, 32]], [[122, 36, 32, 32]], [], [[19, 129, 123, 123]],
    [[-50, 200, 185, 185], [289, 70, 33, 33]], [[280, 73, 32, 32]], [[259, 31, 35, 35]], [[-50, 220, 175, 175]],
  ] },
  { key: "bocchi_draft", keywords: ["波奇手稿"], tags: ["后藤一里", "后藤独", "波奇酱", "孤独摇滚"], cadence: 80,
    layering: "under", fit: "cover", initialSize: [350, 400],
    frames: [0, 0, 0, 0, 0, 0, 0, 1, 1, 2, 2, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 10, 10].map(i => [bocchi[i]!]) },
  { key: "jiujiu", keywords: ["啾啾"], cadence: 60, layering: "under", fit: "cover", frames: Array<Rectangle[]>(8).fill([[0, 0, 75, 51]]) },
  { key: "tankuku_raisesign", keywords: ["唐可可举牌"], tags: ["唐可可", "LoveLive!Superstar!!"], cadence: 200,
    layering: "under", fit: "cover", initialSize: [300, 230], frames: tankuku.map(pose => [pose]) },
  { key: "wooden_fish", keywords: ["木鱼"], cadence: 100, layering: "under", fit: "stretch", frames: Array<Rectangle[]>(66).fill([[116, 153, 85, 85]]) },
  { key: "love_you", keywords: ["永远爱你"], cadence: 200, layering: "paper", frames: rectangles([[68, 65, 70, 70], [63, 59, 80, 80]]) },
  { key: "punch", keywords: ["打拳"], cadence: 30, layering: "paper", initialSize: [260, 260], frames: slots([
    [-50, 5], [-40, -5], [-30, -15], [-20, -25], [-10, -25], [0, -15], [10, -5], [20, 5],
    [10, -5], [0, -15], [-10, -25], [10, -15], [-30, -5],
  ], 260) },
  { key: "suck", keywords: ["吸", "嗦"], cadence: 80, layering: "paper", frames: rectangles([
    [82, 100, 130, 119], [82, 94, 126, 125], [82, 120, 128, 99], [81, 164, 132, 55], [79, 163, 132, 55], [82, 140, 127, 79],
    [83, 152, 125, 67], [75, 157, 140, 62], [72, 165, 144, 54], [80, 132, 128, 87], [81, 127, 127, 92], [79, 111, 132, 108],
  ]) },
  { key: "kick_ball", keywords: ["踢球"], cadence: 100, layering: "under", initialSize: [78, 78], frames: rectangles(([
    [57, 136], [56, 117], [55, 99], [52, 113], [50, 126], [48, 139], [47, 112], [47, 85], [47, 57], [48, 97],
    [50, 136], [51, 176], [52, 169], [55, 181], [58, 153],
  ] as const).map(([x, y], i) => [x, y, 78, 78, -24 * i])) },
  { key: "roll", keywords: ["滚"], cadence: 100, layering: "under", initialSize: [210, 210], frames: rectangles(([
    [87, 77, 0], [96, 85, -45], [92, 79, -90], [92, 78, -135], [92, 75, -180], [92, 75, -225], [93, 76, -270], [90, 80, -315],
  ] as const).map(([x, y, angle]) => [x, y, 210, 210, angle])) },
  { key: "twist", keywords: ["搓"], cadence: 100, layering: "under", initialSize: [78, 78], frames: rectangles([
    [25, 66, 78, 78, 0], [25, 66, 78, 78, 60], [23, 68, 78, 78, 120], [20, 69, 78, 78, 180], [22, 68, 78, 78, 240],
  ]) },
  { key: "capoo_strike", keywords: ["咖波撞", "咖波头槌"], tags: ["猫猫虫", "咖波"], cadence: 50,
    layering: "under", fit: "cover", initialSize: [200, 160], animatedInput: true, frames: capoo.map(pose => [pose]) },
];
