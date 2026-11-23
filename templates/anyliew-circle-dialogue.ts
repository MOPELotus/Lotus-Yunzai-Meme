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
    caption: name => `${name},你和夏先生一样笨得可爱`,
  },
  {
    ...jpegAvatar, key: "azur_lane_cheshire_thumbs_up", keywords: ["柴郡点赞", "柴郡猫点赞"], asset: "0.jpg",
    avatar: [30, 120, 230, 230], box: [207, 1, 739, 150], sizes: [20, 100], leftLines: true, color: "#fff", font: "slender", emoji: true,
    caption: name => `${name},你真是一个大聪明\n柴郡为你点个赞👍🏻`,
  },
  {
    ...jpegAvatar, key: "contract", keywords: ["⭐️💢契约", "橙喵契约", "卖身契", "奴隶契约"], circle: "stretch-first",
    avatar: [1770, 1096, 135, 135], box: [1416, 515, 1905, 597], sizes: [20, 60], font: "cartoon",
    caption: name => `${name}の奴隶契约`,
  },
  {
    ...jpegAvatar, key: "deer_plan", keywords: ["鹿管计划"],
    avatar: [35, 18, 100, 100], box: [160, 18, 1041, 118], sizes: [15, 120], leftLines: true, font: "slender",
    caption: name => `${name}の鹿管计划`,
  },
  {
    ...jpegAvatar, key: "doro_thumbs_up", keywords: ["doro点赞", "Doro点赞", "DORO点赞", "桃乐丝点赞"], asset: "0.jpg",
    avatar: [730, 150, 230, 230], box: [1, 797, 1072, 980], sizes: [20, 100], leftLines: true, font: "slender", emoji: true,
    caption: name => `${name},你真是一个大聪明 \n 桃乐丝要为你点个赞👍🏻`,
  },
  {
    ...jpegAvatar, key: "hitachi_mako_together", keywords: ["和她在一起"],
    avatar: [665, 180, 180, 180], box: [170, 20, 900, 100], sizes: [20, 70], leftLines: true, bottom: true, defaultName: "她",
    caption: name => `${name}：我要和四季夏目永远在一起`,
  },
  {
    ...jpegAvatar, key: "laughing", keywords: ["笑指"], asset: "0.jpg",
    avatar: [1097, 550, 400, 400], box: [1, 1, 1495, 407], sizes: [20, 100], leftLines: true, color: "#fff", font: "slender", emoji: true,
    caption: name => `${name},你真是好搞笑呀🤣😂~`,
  },
  {
    ...jpegAvatar, key: "mihoyo_liuwei_noise", keywords: ["声音", "尖锐的声音"], tags: genshin, circle: "stretch-first",
    avatar: [31, 252, 145, 145], box: [333, 320, 547, 347], sizes: [15, 30], leftLines: true, font: "slender",
    caption: name => `正常人${name}`,
  },
  {
    ...jpegAvatar, key: "yuzu_soft_murasame_clothes", keywords: ["丛雨衣服", "丛雨衣物"], tags: yuzu, asset: "0.jpg",
    avatar: [700, 80, 140, 140], box: [0, 0, 130, 339], sizes: [25, 100], font: "cartoon", wrap: true,
    defaultName: "蔡徐坤", maleName: "蔡徐坤", caption: name => `${name},你好变态,穿我的衣物`,
  },
  {
    ...jpegAvatar, key: "yuzu_soft_murasame_finger", keywords: ["柚子厨", "丛雨指"], tags: yuzu,
    avatar: [980, 420, 430, 430], box: [805, 94, 1728, 274], sizes: [20, 100], leftLines: true, bottom: true, font: "slender",
    defaultName: "她", caption: name => `原来${name}是柚子厨`,
  },
  {
    ...pngAvatar, key: "family_know", keywords: ["家人们谁懂啊"],
    avatar: [199, 937, 205, 205], box: [401, 938, 1009, 1138], sizes: [20, 100], font: "child",
    caption: name => name,
  },
  {
    ...pngAvatar, key: "mihoyo_sigewinne_fingered", keywords: ["没救了", "希格雯指"], tags: genshin, circle: "stretch-first",
    avatar: [12, 47, 144, 144], box: [1, 345, 351, 435], sizes: [15, 60], leftLines: true, font: "slender",
    caption: name => `希格雯:这${name}没救了\n希格雯:快拉去璃月往生堂\n希格雯:让胡堂主埋了吧`,
  },
  {
    ...pngAvatar, key: "qixi_festival", keywords: ["七夕和谁过", "七夕和谁过?", "七夕和谁过？"],
    avatar: [618, 284, 370, 370], box: [58, 1085, 1330, 1234], sizes: [20, 100], font: "child",
    caption: name => `农历七月初七 新历8月29日 20:00 \n${name}和派蒙在原神官方直播间过七夕`,
  },
  {
    ...pngAvatar, key: "spend_christmas", keywords: ["一起圣诞"],
    avatar: [120, 535, 255, 255], box: [173, 193, 728, 374], sizes: [20, 100], leftLines: true, bottom: true, emoji: true,
    caption: name => `${name}❤️,我们一起过圣诞`,
  },
  {
    ...pngAvatar, key: "vme50", keywords: ["V我50", "v我50"],
    avatar: [229, 191, 440, 440], box: [1, 1108, 818, 1263], sizes: [20, 100], font: "child",
    caption: name => `${name}:V你50块钱\n与我共度疯狂星期四美好时光`,
  },
  {
    ...pngAvatar, key: "yuzu_soft_shocked", keywords: ["震惊柚子厨"], tags: yuzu, avatarOnTop: true,
    avatar: [0, 423, 144, 144], box: [144, 423, 1080, 567], sizes: [20, 180], leftLines: true,
    defaultName: "她", caption: name => `${name},你是柚...柚子厨?!`,
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
      throw new MemeTemplateFeedback(`图片编号错误，请选择 0～${holiday.length}`);
    }
    const index = number ? number - 1 : randomInt(holiday.length);
    return renderAnyLiewDialogue(input, context, {
      ...jpegAvatar, ...holiday[index]!, key: "national_day_plan", keywords: nationalDay.info.keywords,
      asset: `${index}.png`, sizes: [15, 120], leftLines: true, font: "slender", caption: name => `${name}の国庆计划`,
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
