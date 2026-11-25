import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("meme", messageCatalog.messages);
// Layout from MemeCrafters/meme-generator v0.1.14 (619fa105), dianzhongdian.
import { loadImage } from "skia-canvas";
import { renderExactPng } from "../../../packages/skia/index.ts";
import { MemeTemplateFeedback, type MemeTemplate } from "../builtin-template.ts";
import { readMemeFirstImage } from "./animated-input.ts";
import { grayImage } from "./grayscale.ts";
import { drawFittedText, jpg, previewImage, registerFont } from "./template-layout.ts";

const width = 500;
const defaultText = $t("templates.dianzhongdian.text_3612b9b959");

async function caption(text: string, font: string, height: number, minimum: number, maximum: number) {
  const { png } = await renderExactPng(width, height, draw => {
    drawFittedText(draw, [20, 0, 480, height], text, font, minimum, maximum, "center", "white", {
      wrap: false, paragraphMetrics: true,
    });
  });
  return loadImage(png);
}

export const dianzhongdian: MemeTemplate = {
  info: { key: "dianzhongdian", keywords: ["入典", "典中典", "黑白草图"], params_type: {
    min_images: 1, max_images: 1, min_texts: 1, max_texts: 2, default_texts: [defaultText], args_type: null,
  } },
  async render({ images, texts }, context) {
    if (images.length !== 1 || texts.length < 1 || texts.length > 2) throw new Error($t("templates.dianzhongdian.text_fefdf96e50"));
    const { signal } = context;
    signal.throwIfAborted();
    const text = texts[0]!;
    const japanese = texts[1];
    if (!japanese?.trim()) throw new MemeTemplateFeedback($t("templates.dianzhongdian.text_8bc8f08143"));
    const [image, font] = await Promise.all([readMemeFirstImage(images[0]!, signal), registerFont(context)]);
    const imageHeight = Math.max(1, Math.trunc(image.height * width / image.width));
    const first = await caption(text, font, 60, 25, 50);
    const [gray, second] = await Promise.all([grayImage(image, signal), caption(japanese, font, 35, 10, 25)]);
    return jpg(width, imageHeight + 100, draw => {
      draw.fillStyle = "black";
      draw.fillRect(0, 0, width, imageHeight + 100);
      draw.imageSmoothingQuality = "high";
      draw.drawImage(gray, 0, 0, width, imageHeight);
      draw.drawImage(first, 0, imageHeight);
      draw.drawImage(second, 0, imageHeight + 60);
    }, signal);
  },
  async preview(context) {
    return dianzhongdian.render({ images: [await previewImage(context.signal)], texts: [defaultText, $t("templates.dianzhongdian.text_ab90d08864")], args: {} }, context);
  },
};
