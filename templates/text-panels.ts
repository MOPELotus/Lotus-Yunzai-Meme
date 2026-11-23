// Original layouts from MemeCrafters/meme-generator v0.1.14.
// https://github.com/MemeCrafters/meme-generator/tree/619fa10518fc2eca4fa1053af37f0a00a839f062/meme_generator/memes
import { Canvas, loadImage, type CanvasRenderingContext2D } from "skia-canvas";
import { MemeTemplateFeedback, type MemeTemplate, type MemeTemplateContext } from "../builtin-template.ts";
import { drawFittedText, jpg, registerFont } from "./template-layout.ts";

type Caption = {
  readonly text: string;
  readonly box: readonly [number, number, number, number];
  readonly color?: string;
  decorate?(text: string): string;
};

interface Definition {
  readonly key: string;
  readonly keywords: readonly string[];
  readonly asset: string;
  readonly minFont: number;
  readonly maxFont: number;
  readonly captions: readonly Caption[];
}

const definitions: readonly Definition[] = [
  {
    key: "fanatic", keywords: ["狂爱", "狂粉"], asset: "fanatic/0.jpg", minFont: 30, maxFont: 70,
    captions: [{ text: "洛天依", box: [145, 40, 343, 160] }],
  },
  {
    key: "dont_press", keywords: ["不要按"], asset: "dont_press/0.png", minFont: 20, maxFont: 50,
    captions: [{ text: "世界毁灭", box: [60, 170, 200, 225] }],
  },
  {
    key: "find_chips", keywords: ["整点薯条"], asset: "find_chips/0.jpg", minFont: 12, maxFont: 30,
    captions: [
      { text: "我们要飞向何方", box: [405, 54, 530, 130] },
      { text: "我打算待会去码头整点薯条", box: [570, 62, 667, 160] },
      { text: "我说的是归根结底，活着是为了什么", box: [65, 400, 325, 463] },
      { text: "为了待会去码头整点薯条", box: [430, 400, 630, 470] },
    ],
  },
  {
    key: "ascension", keywords: ["升天"], asset: "ascension/0.png", minFont: 20, maxFont: 50,
    captions: [{
      text: "学的是机械", box: [40, 30, 482, 135],
      decorate: text => `你原本应该要去地狱的，但因为你生前${text}，我们就当作你已经服完刑期了`,
    }],
  },
  {
    key: "meteor", keywords: ["流星"], asset: "meteor/0.png", minFont: 20, maxFont: 80,
    captions: [{ text: "我要对象", box: [220, 230, 920, 315], color: "#fff" }],
  },
];

const grudgeDefault = "群友不发涩图";

function grudgeText(text: string, day = new Date()) {
  const month = String(day.getMonth() + 1).padStart(2, "0");
  const date = String(day.getDate()).padStart(2, "0");
  return `${day.getFullYear()}年${month}月${date}日 晴\n${text}\n这个仇我先记下了`;
}

async function holdGrudge(text: string, context: MemeTemplateContext) {
  const [art, font] = await Promise.all([context.imageAsset("hold_grudge/0.png").then(loadImage), registerFont(context)]);
  const caption = grudgeText(text);
  const applyFont = (draw: CanvasRenderingContext2D) => {
    draw.font = `45px ${font}`;
    draw.textBaseline = "alphabetic";
    draw.textAlign = "left";
    draw.textWrap = true;
  };
  const measure = new Canvas(1, 1).getContext("2d");
  applyFont(measure);
  const { lines } = measure.measureText(caption, 440);
  const first = lines[0]!;
  const last = lines.at(-1)!;
  const height = Math.ceil(last.y + last.height - first.y);
  if (height > 500) throw new MemeTemplateFeedback("文字过长，无法放进表情模板。");
  return jpg(art.width, art.height + height + 20, draw => {
    draw.fillStyle = "#fff";
    draw.fillRect(0, 0, art.width, art.height + height + 20);
    draw.drawImage(art, 0, 0);
    applyFont(draw);
    draw.fillStyle = "#000";
    draw.fillText(caption, 30, art.height + 5 - first.y, 440);
  }, context.signal);
}

const grudge: MemeTemplate = {
  info: {
    key: "hold_grudge", keywords: ["记仇"],
    params_type: { min_images: 0, max_images: 0, min_texts: 1, max_texts: 1, default_texts: [grudgeDefault] },
  },
  render: (input, context) => holdGrudge(input.texts[0] ?? grudgeDefault, context),
  preview: context => holdGrudge(grudgeDefault, context),
};

export const textPanelMemeTemplates: readonly MemeTemplate[] = definitions.map((item): MemeTemplate => {
  const defaults = item.captions.map(({ text }) => text);
  async function render(texts: readonly string[], context: MemeTemplateContext) {
    const [art, font] = await Promise.all([context.imageAsset(item.asset).then(loadImage), registerFont(context)]);
    return jpg(art.width, art.height, draw => {
      draw.drawImage(art, 0, 0);
      for (const [index, caption] of item.captions.entries()) {
        const text = texts[index] ?? caption.text;
        drawFittedText(draw, caption.box, caption.decorate?.(text) ?? text, font, item.minFont, item.maxFont, "center", caption.color);
      }
    }, context.signal);
  }
  return {
    info: {
      key: item.key, keywords: item.keywords,
      params_type: {
        min_images: 0, max_images: 0, min_texts: defaults.length, max_texts: defaults.length, default_texts: defaults,
      },
    },
    render: (input, context) => render(input.texts, context),
    preview: context => render(defaults, context),
  };
}).concat(grudge);
