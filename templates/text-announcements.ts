import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("meme", messageCatalog.messages);
// Original layouts from MemeCrafters/meme-generator v0.1.14.
// https://github.com/MemeCrafters/meme-generator/tree/619fa10518fc2eca4fa1053af37f0a00a839f062/meme_generator/memes
import { loadImage } from "skia-canvas";
import { renderExactPng, renderPng } from "@lotus-yunzai/skia";
import type { MemeTemplate, MemeTemplateContext } from "../builtin-template.ts";
import { screenProjection } from "./projective-transform.ts";
import { drawFittedText, jpg, registerFont } from "./template-layout.ts";

const base = { min_images: 0, max_images: 0, min_texts: 1, max_texts: 1 };

function newsTemplate(
  key: string, keyword: string, defaultText: string, asset: string, fill: string, outline: string,
): MemeTemplate {
  async function render(text: string, context: MemeTemplateContext) {
    const [art, font] = await Promise.all([context.imageAsset(asset).then(loadImage), registerFont(context)]);
    const { png } = await renderPng(art.width, art.height, draw => {
      draw.drawImage(art, 0, 0);
      drawFittedText(draw, [50, 100, art.width - 50, art.height - 100], text, font, 30, 60,
        "center", fill, { stroke: [outline, 1 / 15] });
    });
    context.signal.throwIfAborted();
    return png;
  }
  return {
    info: { key, keywords: [keyword], params_type: { ...base, default_texts: [defaultText] } },
    render: (input, context) => render(input.texts[0] ?? defaultText, context),
    preview: context => render(defaultText, context),
  };
}

const luoText = $t("templates.text-announcements.text_4f3035edb0");
const luoProjection = screenProjection(365, 120, [[52, 10], [391, 0], [364, 110], [0, 120]]);
async function luoYonghao(text: string, context: MemeTemplateContext) {
  const { signal } = context;
  const [art, font] = await Promise.all([context.imageAsset("luoyonghao_say/0.jpg").then(loadImage), registerFont(context)]);
  const { png } = await renderExactPng(365, 120, draw => {
    drawFittedText(draw, [40, 10, 325, 110], text, font, 10, 50, "center", "#000", { vertical: "top" });
  });
  signal.throwIfAborted();
  const label = await loadImage(png);
  const warped = await loadImage((await renderExactPng(391, 120, draw => {
    draw.transform(luoProjection);
    draw.imageSmoothingQuality = "high";
    draw.drawImage(label, 0, 0);
  })).png);
  return jpg(art.width, art.height, draw => {
    draw.drawImage(art, 0, 0);
    draw.save();
    draw.beginPath();
    draw.rect(48, 246, 391, 120);
    draw.clip();
    draw.filter = "blur(0.8px)";
    draw.drawImage(warped, 48, 246);
    draw.restore();
  }, signal);
}

export const textAnnouncementMemeTemplates: readonly MemeTemplate[] = [
  newsTemplate("bad_news", "悲报", $t("templates.text-announcements.text_6c2619a8f8"), "bad_news/0.png", "#000", "#fff"),
  newsTemplate("good_news", "喜报", $t("templates.text-announcements.text_9e94346a88"), "good_news/0.jpg", "#e00", "#ffff99"),
  {
    info: { key: "luoyonghao_say", keywords: ["罗永浩说"], params_type: { ...base, default_texts: [luoText] } },
    render: (input, context) => luoYonghao(input.texts[0] ?? luoText, context),
    preview: context => luoYonghao(luoText, context),
  },
];
