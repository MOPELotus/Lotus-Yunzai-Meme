import type { MemeTemplateInput } from "../builtin-template.ts";
import type { AnyLiewAvatarScene } from "./anyliew-static-avatar.ts";

const genshin = ["米哈游", "原神"] as const;
const nameHelp = "昵称（第一段文字）";
const defaultNewsBody = "喜报传佳讯\n福星高照\n满门庭";

function namedNewsTitle(input: MemeTemplateInput) {
  return typeof input.args.name === "string" && input.args.name ? input.args.name : undefined;
}
const pixelCaption = { font: "slender", lineHeight: 1 } as const;

function userInfo(input: MemeTemplateInput) {
  const info = Array.isArray(input.args.user_infos) ? input.args.user_infos[0] : undefined;
  return info && typeof info === "object" ? info as { name?: string; gender?: string } : undefined;
}

function targetName(input: MemeTemplateInput) {
  if (input.texts.length) return input.texts[0]!;
  const user = userInfo(input);
  return user?.name || (user && user.gender !== "male" ? "她" : "他");
}

export const anyliewAvatarCaptionScenes: readonly AnyLiewAvatarScene[] = [
  {
    key: "ly01", keywords: ["ly01", "ly-1", "LY-1"], count: 2, layers: [
      { image: 1, box: [933, 251, 235, 235], circle: true },
      { image: 0, box: [272, 243, 235, 235], circle: true },
    ],
  },
  {
    key: "mihoyo_aino_ride", keywords: ["爱诺骑"], count: 1, tags: genshin, animatedInput: true, layers: [
      { image: 0, box: [593, 721, 224, 199] },
      { image: 0, box: [262, 832, 132, 144] },
      { image: 0, box: [390, 754, 115, 115] },
      { image: 0, box: [133, 692, 111, 125] },
    ],
  },
  {
    key: "ikun_why_are_you", keywords: ["你干嘛", "你干吗"], maxTexts: 1, count: 1,
    above: true, jpegFrame: true, jpegOutput: true, animatedInput: true,
    layers: [{ image: 0, box: [275, 75, 120, 120], circle: true, angle: -10 }],
  },
  {
    key: "tencent_np", keywords: ["农P", "农批"], maxTexts: 1, count: 1, above: true, jpegOutput: true, animatedInput: true,
    layers: [{ image: 0, box: [1101, 211, 363, 363], circle: true }],
  },
  {
    key: "mihoyo_player", keywords: ["二游玩家"], maxTexts: 1, count: 1, tags: ["米哈游"],
    layers: [{ image: 0, box: [1073, 628, 312, 312], circle: true }],
  },
  {
    key: "dalia_everyone", keywords: ["所有人"], count: 1, animatedInput: true,
    layers: [{ image: 0, box: [611, 387, 95, 95], circle: "stretch-first", angle: -5 }],
    captions: [{
      text: input => `所有人，给我${targetName(input)}生成黄图`, box: [211, 0, 1060, 132],
      sizes: [15, 60], leftLines: true, color: "#fff", ...pixelCaption,
    }],
  },
  {
    key: "doro_surrounding_photos", keywords: ["周边写真"], count: 1, animatedInput: true,
    layers: [
      { image: 0, box: [860, 1095, 123, 109] },
      { image: 0, box: [864, 1227, 68, 68] },
      { image: 0, box: [815, 1296, 100, 100], angle: -15 },
    ],
    captions: [{
      text: input => `桃乐丝:我这边里有Doro动漫周边公仔\n桃乐丝:还有${targetName(input)}的写真~\n桃乐丝:你要吗？`,
      box: [1, 1, 1080, 250], sizes: [30, 60], leftLines: true, wrap: true, ...pixelCaption,
    }],
  },
  {
    key: "doro_work_for_you", keywords: ["为你打工"], count: 1, animatedInput: true,
    layers: [
      { image: 0, box: [12, 7, 170, 170], angle: 37.5 },
      { image: 0, box: [313, 130, 90, 90], angle: -25 },
      { image: 0, box: [60, 450, 35, 35], angle: 35 },
    ],
    captions: [{
      text: input => `${targetName(input)},桃乐丝正在努力为你打工赚钱`,
      box: [1, 520, 1077, 575], sizes: [30, 60], wrap: true, ...pixelCaption,
    }],
  },
  {
    key: "jd_delivery_person", keywords: ["京东外卖骑手", "京东外卖工牌"], count: 1, animatedInput: true,
    layers: [{ image: 0, box: [420, 1000, 630, 630], circle: true, angle: -20, brightness: 80 }],
    captions: [{
      text: targetName, box: [0, 0, 577, 394], rotation: { x: 353, y: 1710, degrees: -17 },
      sizes: [45, 60], leftLines: true, wrap: true, color: "#3a3c49", lineHeight: 1.45,
    }],
  },
  {
    key: "mihoyo_kuki_shinobu_who", keywords: ["此人是谁", "是谁", "是谁？", "是谁？"],
    count: 1, tags: genshin, animatedInput: true,
    layers: [{ image: 0, box: [932, 310, 210, 300], angle: -11 }],
    captions: [{
      text: input => `\n久岐忍:此人是谁?\n\n旅行者:此人是${targetName(input)},擅长跳、唱、rap、打篮球\n\n旅行者:是稻妻国两年半不可多得的尤物~\n`,
      box: [1, 1023, 2048, 1324], sizes: [15, 120], leftLines: true, ...pixelCaption,
    }],
  },
  {
    key: "mihoyo_liuwei_dinner", keywords: ["刘伟晚餐", "共进晚餐", "大伟哥晚餐"], count: 1, tags: genshin, animatedInput: true,
    layers: [{ image: 0, box: [240, 11, 275, 275], circle: "stretch-first", angle: -15 }],
    captions: [{
      text(input) {
        const name = targetName(input);
        return `${name}:大伟哥\n刘伟:${name}\n${name}:今天很开心和你共进晚餐\n刘伟:我也很开心和${name}一起享用麦当劳双人套餐`;
      },
      box: [1, 960, 1088, 1276], sizes: [15, 60], leftLines: true, ...pixelCaption,
    }],
  },
  {
    key: "new_goodnews", keywords: ["新喜报"], count: 1, animatedInput: true,
    layers: [{ image: 0, box: [319, 408, 445, 445] }],
    minTexts: 0, maxTexts: 2, defaultTexts: ["天命之人", defaultNewsBody],
    legacy: {
      use: input => namedNewsTitle(input) === undefined,
      artwork: "legacy-0.png",
      jpegOutput: true,
      layers: [{ image: 0, box: [210, 270, 300, 300], circle: true }],
      captions: [
        {
          text: input => input.texts[0] ?? "她",
          box: [235, 615, 478, 659], sizes: [10, 100], color: "#ffdf00", ...pixelCaption,
        },
        {
          text: input => input.texts[1],
          box: [199, 708, 512, 923], sizes: [10, 60], color: "#ffd700", wrap: true, ...pixelCaption,
        },
      ],
    },
    argsType: {
      args_model: { properties: { name: { type: "string", default: "", description: nameHelp } } },
      parser_options: [{ names: ["-n", "--name"], args: [{ name: "name", value: "str" }], help_text: nameHelp }],
    },
    captions: [
      {
        text: input => namedNewsTitle(input),
        box: [363, 910, 719, 985], sizes: [10, 100], color: "#1c1c1c", font: "child", lineHeight: 1.14,
      },
      {
        text: input => input.texts[0] ?? defaultNewsBody,
        box: [297, 1055, 775, 1379], sizes: [10, 60], color: "#f9faa1", wrap: true, ...pixelCaption,
      },
    ],
  },
];
