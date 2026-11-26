import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("meme", messageCatalog.messages);
// Original layouts from MemeCrafters/meme-generator v0.1.14.
// https://github.com/MemeCrafters/meme-generator/tree/619fa10518fc2eca4fa1053af37f0a00a839f062/meme_generator/memes
import { randomInt } from "node:crypto";
import { Canvas, loadImage, type CanvasRenderingContext2D } from "skia-canvas";
import { renderPngWithoutFooter as renderPng } from "@lotus-yunzai/skia";
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
    captions: [{ text: $t("templates.text-panels.text_f943f78aa7"), box: [145, 40, 343, 160] }],
  },
  {
    key: "dont_press", keywords: ["不要按"], asset: "dont_press/0.png", minFont: 20, maxFont: 50,
    captions: [{ text: $t("templates.text-panels.text_3b0e95fd2a"), box: [60, 170, 200, 225] }],
  },
  {
    key: "find_chips", keywords: ["整点薯条"], asset: "find_chips/0.jpg", minFont: 12, maxFont: 30,
    captions: [
      { text: $t("templates.text-panels.text_cc49f0dfd7"), box: [405, 54, 530, 130] },
      { text: $t("templates.text-panels.text_95461f4616"), box: [570, 62, 667, 160] },
      { text: $t("templates.text-panels.text_88ee030f4f"), box: [65, 400, 325, 463] },
      { text: $t("templates.text-panels.text_9f696160ab"), box: [430, 400, 630, 470] },
    ],
  },
  {
    key: "slogan", keywords: ["口号"], asset: "slogan/0.jpg", minFont: 15, maxFont: 40,
    captions: [
      { text: $t("templates.text-panels.text_c67923af49"), box: [10, 0, 294, 50] },
      { text: $t("templates.text-panels.text_296406c8d9"), box: [316, 0, 602, 50] },
      { text: $t("templates.text-panels.text_8423506b4f"), box: [10, 230, 294, 280] },
      { text: $t("templates.text-panels.text_463bd7c369"), box: [316, 230, 602, 280] },
      { text: $t("templates.text-panels.text_b5c3de9cf5"), box: [10, 455, 294, 505] },
      { text: $t("templates.text-panels.text_c9143068cb"), box: [316, 455, 602, 505] },
    ],
  },
  {
    key: "ascension", keywords: ["升天"], asset: "ascension/0.png", minFont: 20, maxFont: 50,
    captions: [{
      text: $t("templates.text-panels.text_58774d1535"), box: [40, 30, 482, 135],
      decorate: text => $t("templates.text-panels.text_c09cf4d952", { "text": text }),
    }],
  },
  {
    key: "meteor", keywords: ["流星"], asset: "meteor/0.png", minFont: 20, maxFont: 80,
    captions: [{ text: $t("templates.text-panels.text_04c2416f9a"), box: [220, 230, 920, 315], color: "#fff" }],
  },
  {
    key: "wish_fail", keywords: ["许愿失败"], asset: "wish_fail/0.png", minFont: 20, maxFont: 80,
    captions: [{ text: $t("templates.text-panels.text_04c2416f9a"), box: [70, 305, 320, 380] }],
  },
  {
    key: "top_notch", keywords: ["顶尖"], asset: "python/meme_generator/memes/top_notch/images/0.png", png: true,
    minFont: 20, maxFont: 40,
    captions: [{ text: $t("templates.text-panels.text_1433b0e669"), box: [10, 240, 420, 300], decorate: text => $t("templates.text-panels.text_13a0a4f470", { "text": text }) }],
  },
  {
    key: "my_opinion", keywords: ["我的意见如下", "我的意见是"], asset: "my_opinion/0.png", png: true, bold: true, wrap: false,
    tags: ["东方Project"], minFont: 20, maxFont: 500,
    captions: [{ box: [37, 660, 487, 1070] }],
  },
  {
    key: "not_call_me", keywords: ["不喊我"], asset: "python/meme_generator/memes/not_call_me/images/0.png", png: true,
    minFont: 20, maxFont: 80,
    captions: [{ text: $t("templates.text-panels.text_affc4d5221"), box: [228, 11, 340, 164] }],
  },
];

const legacyPreviewTexts = [$t("templates.text-panels.text_5989f6f405"), $t("templates.text-panels.text_c80834bf8e"), $t("templates.text-panels.text_1d841bc0ee"), $t("templates.text-panels.text_808b4f6221"), $t("templates.text-panels.text_c68e010446"), $t("templates.text-panels.text_e6bb13166f"), $t("templates.text-panels.text_34e2bef711"), $t("templates.text-panels.text_7df288465c"), $t("templates.text-panels.text_1487d35303"), $t("templates.text-panels.text_7292b7eda2")] as const;
const grudgeDefault = $t("templates.text-panels.text_3c674bc731");

function grudgeText(text: string, day = new Date()) {
  const month = String(day.getMonth() + 1).padStart(2, "0");
  const date = String(day.getDate()).padStart(2, "0");
  return $t("templates.text-panels.text_2b3e79221f", { "value1": day.getFullYear(), "month": month, "date": date, "text": text });
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
  if (height > 500) throw new MemeTemplateFeedback($t("templates.text-panels.text_002fc2fab2"));
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
        if (text === undefined) throw new MemeTemplateFeedback($t("templates.text-panels.text_63939c76de"));
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
