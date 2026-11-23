import { randomInt } from "node:crypto";
import { loadImage, type CanvasRenderingContext2D } from "skia-canvas";
import { MemeTemplateFeedback, type MemeTemplate, type MemeTemplateContext } from "../builtin-template.ts";
import { jpg, paper, registerFont, registerMemeTypeface } from "./template-layout.ts";

type Box = readonly [left: number, top: number, right: number, bottom: number];
type Frame = { readonly asset: string; readonly box: Box };
const fonts = {
  child: ["FZSEJW.ttf", "LotusMemeChild"],
  diary: ["FZSJ-QINGCRJ.ttf", "LotusMemeDiary"],
} as const;

interface Dialogue {
  readonly key: string;
  readonly keywords: readonly string[];
  readonly text: string;
  readonly frames: readonly Frame[];
  readonly sizes: readonly [minimum: number, maximum: number];
  readonly tags?: readonly string[];
  readonly font?: keyof typeof fonts;
  readonly color?: string;
  readonly leftLines?: boolean;
}

const dialogue: readonly Dialogue[] = [
  {
    key: "mihoyo_funina_card", keywords: ["芙芙卡片", "芙宁娜卡片", "芙芙酱卡片"], tags: ["米哈游", "原神"],
    text: "曾经我是戴上假面的演员，只想要掩饰真相…", font: "child", sizes: [30, 120],
    frames: [{ asset: "0.png", box: [361, 274, 1392, 940] }],
  },
  {
    key: "mihoyo_liuwei_say", keywords: ["刘伟说", "大伟说", "大伟哥说"], tags: ["米哈游"],
    text: "你的声音太尖锐了", font: "diary", sizes: [30, 120],
    frames: [{ asset: "0.jpg", box: [426, 44, 1219, 284] }],
  },
  {
    key: "mihoyo_neuvillette_say", keywords: ["那维莱特说", "水龙王说"], tags: ["米哈游"],
    text: "潮水啊，我已归来", sizes: [20, 120],
    frames: [{ asset: "0.png", box: [104, 53, 307, 460] }],
  },
  {
    key: "mihoyo_paimon_say", keywords: ["派蒙说"], tags: ["米哈游"],
    text: "前面的区域\n以后再来探索吧？", color: "#5e5e5e", sizes: [20, 120],
    frames: [{ asset: "0.png", box: [145, 148, 619, 1117] }],
  },
  {
    key: "miku_say", keywords: ["初音说", "初音未来说"],
    text: "みく！", font: "child", color: "#12193f", sizes: [30, 1000],
    frames: [{ asset: "0.png", box: [845, 230, 2645, 1133] }],
  },
  {
    key: "moria_ruruka_say", keywords: ["露露卡说", "森亚露露卡说"],
    text: "变身", font: "child", sizes: [10, 120],
    frames: [{ asset: "0.png", box: [34, 57, 255, 170] }],
  },
  {
    key: "mygo_chihaya_anon_say", keywords: ["千早爱音说"],
    text: "诶？！！！等……等等等，是一辈子喔？", font: "child", sizes: [10, 1150], leftLines: true,
    frames: [{ asset: "0.png", box: [205, 166, 912, 557] }],
  },
  {
    key: "mygo_togawa_sakiko_say", keywords: ["丰川祥子说", "祥子说"],
    text: "我从没觉得玩乐队开心过……", font: "child", sizes: [10, 180],
    frames: [
      { asset: "1.png", box: [1483, 172, 2318, 438] },
      { asset: "2.png", box: [1145, 101, 1893, 420] },
      { asset: "3.png", box: [1403, 99, 2374, 1009] },
    ],
  },
  {
    key: "mygo_wakaba_mutsumi_say", keywords: ["若叶睦说", "睦子米说"],
    text: "我从没觉得玩乐队开心过……", font: "child", sizes: [10, 180],
    frames: [
      { asset: "1.png", box: [31, 89, 166, 175] },
      { asset: "2.png", box: [40, 48, 192, 139] },
      { asset: "3.png", box: [24, 33, 180, 140] },
      { asset: "4.png", box: [27, 47, 172, 141] },
    ],
  },
];

function drawDialogue(draw: CanvasRenderingContext2D, definition: Dialogue, box: Box, text: string, font: string) {
  const [left, top, right, bottom] = box;
  const width = right - left, height = bottom - top;
  const [minimum, maximum] = definition.sizes;
  draw.textAlign = definition.leftLines ? "left" : "center";
  draw.textBaseline = "alphabetic";
  draw.textWrap = true;
  draw.fillStyle = definition.color ?? "#000";
  for (let size = maximum; size >= minimum; size--) {
    draw.font = `${size}px ${font}`;
    const unwrapped = draw.measureText(text);
    const wrap = unwrapped.width > width ? width : undefined;
    const { lines } = wrap ? draw.measureText(text, wrap) : unwrapped;
    const first = lines[0], last = lines.at(-1);
    if (!first || !last) return;
    const longest = Math.max(...lines.map(line => line.width));
    const ascent = first.ascent, paragraph = Math.round(last.descent - ascent);
    if (longest > width || paragraph > height) continue;
    // The old left-aligned lines are centered together as a block.
    const x = (left + right - (definition.leftLines ? longest : 0)) / 2;
    draw.fillText(text, x, top + (height - paragraph) / 2 - ascent, wrap);
    return;
  }
  throw new MemeTemplateFeedback("文字过长，无法放进表情模板。");
}

function createDialogue(definition: Dialogue): MemeTemplate {
  const count = definition.frames.length;
  const help = `图片编号，0 随机，1～${count} 指定底图`;
  const argsType = count > 1 ? {
    args_model: { properties: { number: { type: "integer", default: 0, description: help } } },
    parser_options: [{ names: ["-n", "--number"], args: [{ name: "number", value: "int" }], help_text: help }],
  } : null;

  async function render(text: string, number: unknown, context: MemeTemplateContext) {
    let index = 0;
    if (argsType) {
      if (number === undefined || number === 0) index = randomInt(count);
      else if (typeof number === "number" && Number.isSafeInteger(number) && number >= 1 && number <= count) index = number - 1;
      else throw new MemeTemplateFeedback(`图片编号错误，请选择 1～${count} 或 0（随机）`);
    }
    const frame = definition.frames[index]!;
    const typeface = definition.font && fonts[definition.font];
    const [image, primary, fallback] = await Promise.all([
      context.imageAsset(`anyliew/emoji/${definition.key}/images/${frame.asset}`).then(loadImage),
      typeface ? registerMemeTypeface(context, typeface[0], typeface[1]) : undefined,
      registerFont(context),
    ]);
    const family = [primary, fallback, "sans-serif"].filter(Boolean).join(", ");
    // The digest-verified original is slightly larger than the generic static cap.
    const maxPixels = definition.key === "miku_say" && image.width === 3019 && image.height === 4118 ? 3019 * 4118 : undefined;
    return jpg(image.width, image.height, draw => {
      paper(draw, image.width, image.height);
      draw.drawImage(image, 0, 0);
      drawDialogue(draw, definition, frame.box, text, family);
    }, context.signal, maxPixels);
  }

  return {
    info: { key: definition.key, keywords: definition.keywords, tags: definition.tags,
      params_type: {
        min_images: 0, max_images: 0, min_texts: 1, max_texts: 1, default_texts: [definition.text], args_type: argsType,
      } },
    render: (input, context) => render(input.texts[0] ?? definition.text, input.args.number, context),
    preview: context => render(definition.text, undefined, context),
  };
}

// The numbered MyGO template keeps its own key beside the old multiline mutsumi_say.
export const anyliewTextDialogueTemplates: readonly MemeTemplate[] = dialogue.map(createDialogue);
