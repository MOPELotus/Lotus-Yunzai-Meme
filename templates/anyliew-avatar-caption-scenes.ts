import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("meme", messageCatalog.messages);
import type { MemeTemplateInput } from "../builtin-template.ts";
import type { AnyLiewAvatarScene } from "./anyliew-static-avatar.ts";

const genshin = ["米哈游", "原神"] as const;
const nameHelp = $t("templates.anyliew-avatar-caption-scenes.text_54bbcc674e");
const defaultNewsBody = $t("templates.anyliew-avatar-caption-scenes.text_b259f5e7da");

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
  return user?.name || (user && user.gender !== "male" ? $t("templates.anyliew-avatar-caption-scenes.text_2ab425e0c6") : $t("templates.anyliew-avatar-caption-scenes.text_8b7b91e000"));
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
      text: input => $t("templates.anyliew-avatar-caption-scenes.text_9e9a196944", { "value1": targetName(input) }), box: [211, 0, 1060, 132],
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
      text: input => $t("templates.anyliew-avatar-caption-scenes.text_612d5e9674", { "value1": targetName(input) }),
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
      text: input => $t("templates.anyliew-avatar-caption-scenes.text_d0010b60ae", { "value1": targetName(input) }),
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
      text: input => $t("templates.anyliew-avatar-caption-scenes.text_b73d523576", { "value1": targetName(input) }),
      box: [1, 1023, 2048, 1324], sizes: [15, 120], leftLines: true, ...pixelCaption,
    }],
  },
  {
    key: "mihoyo_liuwei_dinner", keywords: ["刘伟晚餐", "共进晚餐", "大伟哥晚餐"], count: 1, tags: genshin, animatedInput: true,
    layers: [{ image: 0, box: [240, 11, 275, 275], circle: "stretch-first", angle: -15 }],
    captions: [{
      text(input) {
        const name = targetName(input);
        return $t("templates.anyliew-avatar-caption-scenes.text_f4f3e6eaa4", { "name": name, "value2": name, "value3": name, "value4": name });
      },
      box: [1, 960, 1088, 1276], sizes: [15, 60], leftLines: true, ...pixelCaption,
    }],
  },
  {
    key: "new_goodnews", keywords: ["新喜报"], count: 1, animatedInput: true,
    layers: [{ image: 0, box: [319, 408, 445, 445] }],
    minTexts: 0, maxTexts: 2, defaultTexts: [$t("templates.anyliew-avatar-caption-scenes.text_34f3dab6f4"), defaultNewsBody],
    legacy: {
      use: input => namedNewsTitle(input) === undefined,
      artwork: "legacy-0.png",
      jpegOutput: true,
      layers: [{ image: 0, box: [210, 270, 300, 300], circle: true }],
      captions: [
        {
          text: input => input.texts[0] ?? $t("templates.anyliew-avatar-caption-scenes.text_2ab425e0c6"),
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
