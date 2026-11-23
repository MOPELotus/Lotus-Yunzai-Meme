// Original layouts from MemeCrafters/meme-generator v0.1.14.
// https://github.com/MemeCrafters/meme-generator/tree/619fa10518fc2eca4fa1053af37f0a00a839f062/meme_generator/memes
import { randomInt } from "node:crypto";
import { Canvas, loadImage, type CanvasRenderingContext2D } from "skia-canvas";
import { renderPng } from "@lotus-yunzai/skia";
import { MemeTemplateFeedback, type MemeTemplate, type MemeTemplateContext } from "../builtin-template.ts";
import { drawFittedText, jpg, registerFont } from "./template-layout.ts";

type Caption = {
  readonly text?: string;
  readonly box: readonly [number, number, number, number];
  readonly color?: string;
  decorate?(text: string): string;
};

interface Definition {
  readonly key: string;
  readonly keywords: readonly string[];
  readonly asset: string;
  readonly png?: boolean;
  readonly bold?: boolean;
  readonly wrap?: boolean;
  readonly tags?: readonly string[];
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
    key: "slogan", keywords: ["口号"], asset: "slogan/0.jpg", minFont: 15, maxFont: 40,
    captions: [
      { text: "我们是谁？", box: [10, 0, 294, 50] },
      { text: "浙大人！", box: [316, 0, 602, 50] },
      { text: "到浙大来做什么？", box: [10, 230, 294, 280] },
      { text: "混！", box: [316, 230, 602, 280] },
      { text: "将来毕业后要做什么样的人？", box: [10, 455, 294, 505] },
      { text: "混混！", box: [316, 455, 602, 505] },
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
  {
    key: "wish_fail", keywords: ["许愿失败"], asset: "wish_fail/0.png", minFont: 20, maxFont: 80,
    captions: [{ text: "我要对象", box: [70, 305, 320, 380] }],
  },
  {
    key: "top_notch", keywords: ["顶尖"], asset: "python/meme_generator/memes/top_notch/images/0.png", png: true,
    minFont: 20, maxFont: 40,
    captions: [{ text: "运营", box: [10, 240, 420, 300], decorate: text => `好，不愧是顶尖${text}` }],
  },
  {
    key: "my_opinion", keywords: ["我的意见如下", "我的意见是"], asset: "my_opinion/0.png", png: true, bold: true, wrap: false,
    tags: ["东方Project"], minFont: 20, maxFont: 500,
    captions: [{ box: [37, 660, 487, 1070] }],
  },
  {
    key: "not_call_me", keywords: ["不喊我"], asset: "python/meme_generator/memes/not_call_me/images/0.png", png: true,
    minFont: 20, maxFont: 80,
    captions: [{ text: "开银趴不喊我是吧", box: [228, 11, 340, 164] }],
  },
];

const legacyPreviewTexts = ["刘一", "陈二", "张三", "李四", "王五", "赵六", "孙七", "周八", "吴九", "郑十"] as const;
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
  const defaults = item.captions.flatMap(({ text }) => text === undefined ? [] : [text]);
  async function render(texts: readonly string[], context: MemeTemplateContext) {
    const [art, font] = await Promise.all([context.imageAsset(item.asset).then(loadImage), registerFont(context, item.bold)]);
    const paint = (draw: CanvasRenderingContext2D) => {
      draw.drawImage(art, 0, 0);
      for (const [index, caption] of item.captions.entries()) {
        const text = texts[index] ?? caption.text;
        if (text === undefined) throw new MemeTemplateFeedback("该表情需要提供文字。");
        drawFittedText(draw, caption.box, caption.decorate?.(text) ?? text, font, item.minFont, item.maxFont,
          "center", caption.color, { wrap: item.wrap });
      }
    };
    if (!item.png) return jpg(art.width, art.height, paint, context.signal);
    context.signal.throwIfAborted();
    const result = await renderPng(art.width, art.height, paint);
    context.signal.throwIfAborted();
    return result.png;
  }
  return {
    info: {
      key: item.key, keywords: item.keywords, tags: item.tags,
      params_type: {
        min_images: 0, max_images: 0, min_texts: item.captions.length, max_texts: item.captions.length, default_texts: defaults,
      },
    },
    render: (input, context) => render(input.texts, context),
    preview: context => render(item.captions.map(({ text }) => text ?? legacyPreviewTexts[randomInt(legacyPreviewTexts.length)]!), context),
  };
}).concat(grudge);
