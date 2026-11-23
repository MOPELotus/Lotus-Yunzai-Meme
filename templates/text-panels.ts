// Original layouts from MemeCrafters/meme-generator v0.1.14.
// https://github.com/MemeCrafters/meme-generator/tree/619fa10518fc2eca4fa1053af37f0a00a839f062/meme_generator/memes
import { loadImage } from "skia-canvas";
import type { MemeTemplate, MemeTemplateContext } from "../builtin-template.ts";
import { drawFittedText, jpg, registerFont } from "./template-layout.ts";

type Caption = {
  readonly text: string;
  readonly box: readonly [number, number, number, number];
};

const definitions = [
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
] as const satisfies readonly {
  readonly key: string;
  readonly keywords: readonly string[];
  readonly asset: string;
  readonly minFont: number;
  readonly maxFont: number;
  readonly captions: readonly Caption[];
}[];

export const textPanelMemeTemplates: readonly MemeTemplate[] = definitions.map((item): MemeTemplate => {
  const defaults = item.captions.map(({ text }) => text);
  async function render(texts: readonly string[], context: MemeTemplateContext) {
    const [art, font] = await Promise.all([context.imageAsset(item.asset).then(loadImage), registerFont(context)]);
    return jpg(art.width, art.height, draw => {
      draw.drawImage(art, 0, 0);
      for (const [index, caption] of item.captions.entries()) {
        drawFittedText(draw, caption.box, texts[index] ?? caption.text, font, item.minFont, item.maxFont);
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
});
