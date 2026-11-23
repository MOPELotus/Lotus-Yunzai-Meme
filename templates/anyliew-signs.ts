// Original AnyLiew layouts and documented variants. Backdrops are verified against the fixed source revision.
import { randomInt } from "node:crypto";
import { loadImage, type CanvasRenderingContext2D } from "skia-canvas";
import { renderPng } from "../../../packages/skia/index.ts";
import { MemeTemplateFeedback, type MemeTemplate, type MemeTemplateContext } from "../builtin-template.ts";
import { jpg, paper, registerFont, registerMemeTypeface } from "./template-layout.ts";

type Box = readonly [number, number, number, number];
const fonts = {
  child: ["FZSEJW.ttf", "LotusMemeChild"],
  diary: ["FZSJ-QINGCRJ.ttf", "LotusMemeDiary"],
  boldBrush: ["PangMenZhengDao-Cu.ttf", "LotusMemePangMen"],
} as const;

interface SignFrame {
  readonly asset: string;
  readonly box: Box;
  readonly sizes: readonly [min: number, max: number];
  readonly leftLines?: boolean;
}

interface Sign {
  readonly key: string;
  readonly keywords: readonly string[];
  readonly tags?: readonly string[];
  readonly text: string;
  readonly color?: string;
  readonly font?: keyof typeof fonts;
  readonly png?: boolean;
  readonly frames: readonly SignFrame[];
}

const mihoyo = ["米哈游"];
const yuzu = ["柚子社"];
const signs: readonly Sign[] = [
  {
    key: "acacia_anan_holdsign", keywords: ["安安举牌", "夏目安安举牌"], tags: ["魔法少女的魔女审判", "夏目安安"],
    // Keep the upstream short default that fits all four backdrops.
    text: "快说吾辈可爱",
    frames: [
      { asset: "0.png", box: [147, 810, 736, 1105], sizes: [30, 120] },
      { asset: "1.png", box: [179, 344, 464, 413], sizes: [30, 120] },
      { asset: "2.jpg", box: [150, 470, 400, 600], sizes: [5, 120], leftLines: true },
      { asset: "3.jpg", box: [310, 740, 790, 990], sizes: [5, 120], leftLines: true },
    ],
  },
  {
    key: "atri_holdsign", keywords: ["亚托莉举牌"], tags: ["ATRI", "亚托莉"],
    text: "请不要忘记我哦……\n请一直,一直记住我哦\n明天,请把我带到伊甸\n我想看见大家的笑容\n我想看到大家开心的表情\n我想学习喜悦",
    frames: [{ asset: "0.jpg", box: [247, 935, 639, 1333], sizes: [20, 120], leftLines: true }],
  },
  {
    key: "mi_leijun_holdsign", keywords: ["雷军举牌"], text: "Are you OK ?",
    frames: [{ asset: "0.jpg", box: [448, 943, 1598, 1572], sizes: [30, 220] }],
  },
  {
    key: "mihoyo_funina_holdsign", keywords: ["芙宁娜举牌", "芙芙举牌", "芙芙酱举牌"], tags: mihoyo,
    text: "当那古老的预言终结、一切落幕之后，我曾经陷入很长时间的消沉。站在舞台上的人受到观众的追捧，同时也承受着更多的注视与期待。但我很清楚，他们期待的并不是我，而是我扮演的那位「神明」...在这个过程中，我真正得到的只有孤独。所以我一度庆恶任何跟表演有关的事，把自己关在房间里，直到再次站上舞台、再次面对观众的时候，我才发现不知不觉我内心的不安已经消失了。现在的我可以坦然承受他们的目光,也许是因为…我终于开始「扮演」我自己了。",
    color: "#746f70", frames: [{ asset: "0.png", box: [616, 731, 925, 950], sizes: [10, 200], leftLines: true }],
  },
  {
    key: "mihoyo_hutao_holdsign", keywords: ["胡桃举牌"], tags: mihoyo,
    text: "嗯哼，太阳出来我晒太阳，月亮出来我晒月亮嘞",
    frames: [{ asset: "0.jpg", box: [196, 736, 739, 943], sizes: [30, 120] }],
  },
  {
    key: "mihoyo_liuwei_holdsign", keywords: ["刘伟举牌", "大伟举牌", "大伟哥举牌"], tags: mihoyo,
    text: "你的声音太尖锐了", font: "diary",
    frames: [{ asset: "0.jpg", box: [204, 596, 763, 918], sizes: [30, 120] }],
  },
  {
    key: "mihoyo_lynette_holdsign", keywords: ["琳妮特举牌"], tags: mihoyo, text: "林尼大笨蛋", png: true,
    frames: [{ asset: "0.png", box: [564, 1488, 1330, 1909], sizes: [30, 120] }],
  },
  {
    key: "moria_ruruka_holdsign", keywords: ["露露卡举牌", "森亚露露卡举牌"], text: "变身", font: "diary",
    frames: [{ asset: "0.png", box: [210, 714, 656, 985], sizes: [10, 120] }],
  },
  {
    key: "naruro_uzumaki_naruto_holdsign", keywords: ["鸣人举牌", "漩涡鸣人举牌"],
    text: "我才不要在这种时候放弃,即使当不成中忍,我也会通过其他的途径成为火影的,这就是我的忍道 ",
    color: "#482c29", frames: [{ asset: "0.jpg", box: [281, 591, 858, 1001], sizes: [30, 120], leftLines: true }],
  },
  {
    key: "yuzu_soft_holdsign", keywords: ["柚子厨举牌"], tags: yuzu, text: "不要再涩涩了", font: "boldBrush",
    frames: [{ asset: "0.jpg", box: [1150, 896, 3024, 1240], sizes: [30, 300], leftLines: true }],
  },
  {
    key: "yuzu_soft_mako_hitachi_holdsign", keywords: ["常陸茉子举牌", "茉子举牌", "常陆茉子举牌"], tags: yuzu,
    text: "Ciallo～", font: "diary", frames: [{ asset: "0.png", box: [50, 309, 474, 598], sizes: [25, 120] }],
  },
];

function drawSignText(draw: CanvasRenderingContext2D, frame: SignFrame, text: string, font: string, color: string) {
  const [left, top, right, bottom] = frame.box;
  const width = right - left;
  const height = bottom - top;
  const [min, max] = frame.sizes;
  draw.fillStyle = color;
  draw.textWrap = true;
  draw.textBaseline = "alphabetic";
  draw.textAlign = frame.leftLines ? "left" : "center";
  for (let size = max; size >= min; size--) {
    draw.font = `${size}px ${font}`;
    const unwrapped = draw.measureText(text);
    const measure = unwrapped.width > width ? width : undefined;
    const { lines } = measure ? draw.measureText(text, measure) : unwrapped;
    const first = lines[0], last = lines.at(-1);
    if (!first || !last) return;
    const measuredWidth = Math.max(...lines.map(line => line.width));
    const ascent = first.ascent;
    const textHeight = Math.round(last.descent - ascent);
    if (measuredWidth > width || textHeight > height) continue;
    // The legacy calls center the paragraph inside the sign even when its lines are left-aligned.
    const x = (left + right - (frame.leftLines ? measure ?? measuredWidth : 0)) / 2;
    draw.fillText(text, x, top + (height - textHeight) / 2 - ascent, measure);
    return;
  }
  throw new MemeTemplateFeedback("文字过长，无法放进表情模板。");
}

function createSign(sign: Sign): MemeTemplate {
  const help = `图片编号，0 随机，1～${sign.frames.length} 指定底图`;
  const argsType = sign.frames.length > 1 ? {
    args_model: { properties: { number: { type: "integer", default: 0, description: help } } },
    parser_options: [{ names: ["-n", "--number"], args: [{ name: "number", value: "int" }], help_text: help }],
  } : null;

  async function render(text: string, number: unknown, context: MemeTemplateContext) {
    let index = 0;
    if (argsType) {
      if (number === undefined || number === 0) index = randomInt(sign.frames.length);
      else if (typeof number === "number" && Number.isSafeInteger(number) && number >= 1 && number <= sign.frames.length) index = number - 1;
      else throw new MemeTemplateFeedback(`图片编号错误，请选择 1～${sign.frames.length} 或 0（随机）`);
    }
    const frame = sign.frames[index]!;
    const typeface = fonts[sign.font ?? "child"];
    const [image, primary, fallback] = await Promise.all([
      context.imageAsset(`anyliew/emoji/${sign.key}/images/${frame.asset}`).then(loadImage),
      registerMemeTypeface(context, typeface[0], typeface[1]),
      registerFont(context),
    ]);
    const { signal } = context;
    signal.throwIfAborted();
    const draw = (canvas: CanvasRenderingContext2D) => {
      if (!sign.png) paper(canvas, image.width, image.height);
      canvas.drawImage(image, 0, 0);
      drawSignText(canvas, frame, text, `${primary}, ${fallback}, sans-serif`, sign.color ?? "#000");
    };
    if (!sign.png) return jpg(image.width, image.height, draw, signal);
    const { png } = await renderPng(image.width, image.height, draw);
    signal.throwIfAborted();
    return png;
  }

  return {
    info: { key: sign.key, keywords: sign.keywords, tags: sign.tags,
      params_type: { min_images: 0, max_images: 0, min_texts: 1, max_texts: 1, default_texts: [sign.text], args_type: argsType } },
    render: (input, context) => render(input.texts[0] ?? sign.text, input.args.number, context),
    preview: context => render(sign.text, undefined, context),
  };
}

export const anyliewSignTemplates: readonly MemeTemplate[] = signs.map(createSign);
