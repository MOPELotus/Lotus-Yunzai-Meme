import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("meme", messageCatalog.messages);
// Original AnyLiew layouts. Image names and their hashes are in backend-circle-dialogue-assets.ts.
import { randomInt } from "node:crypto";
import { MemeTemplateFeedback, type MemeTemplate } from "../builtin-template.ts";
import { anyLiewDialogueTemplate, renderAnyLiewDialogue, type AnyLiewDialogue } from "./anyliew-dialogue.ts";
import { transformPreviewInput } from "./transforms.ts";

const jpegAvatar = { circle: "square-first", jpeg: true, avatarOnTop: true } as const;
const pngAvatar = { circle: "square-first" } as const;
const genshin = ["米哈游", "原神"];
const yuzu = ["柚子社"];

const fixed: readonly AnyLiewDialogue[] = [
  {
    ...jpegAvatar, key: "atri_finger", keywords: ["亚托莉指"], tags: ["ATRI", "亚托莉", "萝卜子"], asset: "0.jpg",
    avatar: [600, 140, 300, 300], box: [0, 588, 1171, 720], sizes: [15, 150], leftLines: true, font: "child", wrap: true,
    caption: name => $t("templates.anyliew-circle-dialogue.text_c4a8f5307b", { "name": name }),
  },
  {
    ...jpegAvatar, key: "azur_lane_cheshire_thumbs_up", keywords: ["柴郡点赞", "柴郡猫点赞"], asset: "0.jpg",
    avatar: [30, 120, 230, 230], box: [207, 1, 739, 150], sizes: [20, 100], leftLines: true, color: "#fff", font: "slender", emoji: true,
    caption: name => $t("templates.anyliew-circle-dialogue.text_d9d9e37238", { "name": name }),
  },
  {
    ...jpegAvatar, key: "contract", keywords: ["⭐️💢契约", "橙喵契约", "卖身契", "奴隶契约"], circle: "stretch-first",
    avatar: [1770, 1096, 135, 135], box: [1416, 515, 1905, 597], sizes: [20, 60], font: "cartoon",
    caption: name => $t("templates.anyliew-circle-dialogue.text_c82d3d074a", { "name": name }),
  },
  {
    ...jpegAvatar, key: "deer_plan", keywords: ["鹿管计划"],
    avatar: [35, 18, 100, 100], box: [160, 18, 1041, 118], sizes: [15, 120], leftLines: true, font: "slender",
    caption: name => $t("templates.anyliew-circle-dialogue.text_2614ddd947", { "name": name }),
  },
  {
    ...jpegAvatar, key: "doro_thumbs_up", keywords: ["doro点赞", "Doro点赞", "DORO点赞", "桃乐丝点赞"], asset: "0.jpg",
    avatar: [730, 150, 230, 230], box: [1, 797, 1072, 980], sizes: [20, 100], leftLines: true, font: "slender", emoji: true,
    caption: name => $t("templates.anyliew-circle-dialogue.text_779da2a39a", { "name": name }),
  },
  {
    ...jpegAvatar, key: "hitachi_mako_together", keywords: ["和她在一起"],
    avatar: [665, 180, 180, 180], box: [170, 20, 900, 100], sizes: [20, 70], leftLines: true, bottom: true, defaultName: $t("templates.anyliew-circle-dialogue.text_2ab425e0c6"),
    caption: name => $t("templates.anyliew-circle-dialogue.text_9b6b699450", { "name": name }),
  },
  {
    ...jpegAvatar, key: "laughing", keywords: ["笑指"], asset: "0.jpg",
    avatar: [1097, 550, 400, 400], box: [1, 1, 1495, 407], sizes: [20, 100], leftLines: true, color: "#fff", font: "slender", emoji: true,
    caption: name => $t("templates.anyliew-circle-dialogue.text_d320573c3c", { "name": name }),
  },
  {
    ...jpegAvatar, key: "mihoyo_liuwei_noise", keywords: ["声音", "尖锐的声音"], tags: genshin, circle: "stretch-first",
    avatar: [31, 252, 145, 145], box: [333, 320, 547, 347], sizes: [15, 30], leftLines: true, font: "slender",
    caption: name => $t("templates.anyliew-circle-dialogue.text_9ebea056cd", { "name": name }),
  },
  {
    ...jpegAvatar, key: "yuzu_soft_murasame_clothes", keywords: ["丛雨衣服", "丛雨衣物"], tags: yuzu, asset: "0.jpg",
    avatar: [700, 80, 140, 140], box: [0, 0, 130, 339], sizes: [25, 100], font: "cartoon", wrap: true,
    defaultName: $t("templates.anyliew-circle-dialogue.text_bca87be1d4"), maleName: $t("templates.anyliew-circle-dialogue.text_bca87be1d4"), caption: name => $t("templates.anyliew-circle-dialogue.text_bb60cfb3f9", { "name": name }),
  },
  {
    ...jpegAvatar, key: "yuzu_soft_murasame_finger", keywords: ["柚子厨", "丛雨指"], tags: yuzu,
    avatar: [980, 420, 430, 430], box: [805, 94, 1728, 274], sizes: [20, 100], leftLines: true, bottom: true, font: "slender",
    defaultName: $t("templates.anyliew-circle-dialogue.text_2ab425e0c6"), caption: name => $t("templates.anyliew-circle-dialogue.text_c988250eec", { "name": name }),
  },
  {
    ...pngAvatar, key: "family_know", keywords: ["家人们谁懂啊"],
    avatar: [199, 937, 205, 205], box: [401, 938, 1009, 1138], sizes: [20, 100], font: "child",
    caption: name => name,
  },
  {
    ...pngAvatar, key: "mihoyo_sigewinne_fingered", keywords: ["没救了", "希格雯指"], tags: genshin, circle: "stretch-first",
    avatar: [12, 47, 144, 144], box: [1, 345, 351, 435], sizes: [15, 60], leftLines: true, font: "slender",
    caption: name => $t("templates.anyliew-circle-dialogue.text_8cd91cdf93", { "name": name }),
  },
  {
    ...pngAvatar, key: "qixi_festival", keywords: ["七夕和谁过", "七夕和谁过?", "七夕和谁过？"],
    avatar: [618, 284, 370, 370], box: [58, 1085, 1330, 1234], sizes: [20, 100], font: "child",
    caption: name => $t("templates.anyliew-circle-dialogue.text_7a073e179f", { "name": name }),
  },
  {
    ...pngAvatar, key: "spend_christmas", keywords: ["一起圣诞"],
    avatar: [120, 535, 255, 255], box: [173, 193, 728, 374], sizes: [20, 100], leftLines: true, bottom: true, emoji: true,
    caption: name => $t("templates.anyliew-circle-dialogue.text_49d4c5b34e", { "name": name }),
  },
  {
    ...pngAvatar, key: "vme50", keywords: ["V我50", "v我50"],
    avatar: [229, 191, 440, 440], box: [1, 1108, 818, 1263], sizes: [20, 100], font: "child",
    caption: name => $t("templates.anyliew-circle-dialogue.text_b16c501a90", { "name": name }),
  },
  {
    ...pngAvatar, key: "yuzu_soft_shocked", keywords: ["震惊柚子厨"], tags: yuzu, avatarOnTop: true,
    avatar: [0, 423, 144, 144], box: [144, 423, 1080, 567], sizes: [20, 180], leftLines: true,
    defaultName: $t("templates.anyliew-circle-dialogue.text_2ab425e0c6"), caption: name => $t("templates.anyliew-circle-dialogue.text_f75004abd1", { "name": name }),
  },
];

const holiday = [
  { avatar: [152, 28, 210, 210], box: [412, 28, 1175, 238] },
  { avatar: [18, 12, 125, 125], box: [152, 12, 694, 137] },
  { avatar: [54, 25, 220, 220], box: [300, 25, 1000, 240] },
  { avatar: [38, 16, 118, 118], box: [168, 16, 697, 133] },
] as const;
const numberHelp = "图片编号，范围为 0～4，0 为随机";
const nationalDay: MemeTemplate = {
  info: {
    key: "national_day_plan", keywords: ["国庆计划", "国庆节计划"],
    params_type: {
      min_images: 1, max_images: 1, min_texts: 0, max_texts: 1, default_texts: [],
      args_type: {
        args_model: { properties: { number: { type: "integer", default: 0, description: numberHelp } } },
        parser_options: [{ names: ["-n", "--number"], args: [{ name: "number", value: "int" }], help_text: numberHelp }],
      },
    },
  },
  render(input, context) {
    const number = input.args.number ?? 0;
    if (typeof number !== "number" || !Number.isInteger(number) || number < 0 || number > holiday.length) {
      throw new MemeTemplateFeedback($t("templates.anyliew-circle-dialogue.text_d38569d508", { "length": holiday.length }));
    }
    const index = number ? number - 1 : randomInt(holiday.length);
    return renderAnyLiewDialogue(input, context, {
      ...jpegAvatar, ...holiday[index]!, key: "national_day_plan", keywords: nationalDay.info.keywords,
      asset: `${index}.png`, sizes: [15, 120], leftLines: true, font: "slender", caption: name => $t("templates.anyliew-circle-dialogue.text_9671f0f1f7", { "name": name }),
    });
  },
  async preview(context) {
    return nationalDay.render(await transformPreviewInput(context), context);
  },
};

export const anyliewCircleDialogueTemplates: readonly MemeTemplate[] = [
  ...fixed.map(anyLiewDialogueTemplate),
  nationalDay,
];
