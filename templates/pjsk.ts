import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("meme", messageCatalog.messages);
import { randomInt } from "node:crypto";
import { loadImage } from "skia-canvas";
import { renderExactPng } from "../../../packages/skia/index.ts";
import { MemeTemplateFeedback, type MemeTemplate, type MemeTemplateContext } from "../builtin-template.ts";
import { legacyCaptionShortcuts } from "../legacy-caption-shortcuts.ts";
import { pjskCharacters } from "../pjsk-characters.ts";
import { drawFittedText, registerFont, registerMemeTypeface, rotateExpanded } from "./template-layout.ts";

const characterHelp = $t("templates.pjsk.text_cb3e26741b") + pjskCharacters.map(([name], index) => `${index + 1}、${name}`).join("，");
const numberHelp = $t("templates.pjsk.text_cf578fb3cc");

function selectIndex(value: unknown, count: number, error: string) {
  if (value === undefined || value === 0) return randomInt(count);
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > count) {
    throw new MemeTemplateFeedback(error);
  }
  return value - 1;
}

async function render(text: string, args: Readonly<Record<string, unknown>>, context: MemeTemplateContext) {
  const character = selectIndex(args.character, pjskCharacters.length, $t("templates.pjsk.text_4cdc46966a"));
  const [name, directory, color, count] = pjskCharacters[character]!;
  const index = selectIndex(args.number, count, $t("templates.pjsk.text_d03a6c367a", { "name": name, "count": count }));
  const path = `python/meme_generator/memes/pjsk/images/${directory}/${String(index).padStart(2, "0")}.png`;
  const [image, rounded, fallback] = await Promise.all([
    context.imageAsset(path).then(loadImage),
    registerMemeTypeface(context, "ZCOOLKuaiLe-Regular.ttf", "LotusMemeKuaiLe"),
    registerFont(context),
  ]);
  const captionWidth = image.width - 20;
  const captionHeight = 50;
  const angle = 40 * (0.5 - Math.random());
  const { png: layer } = await renderExactPng(captionWidth, captionHeight, draw => {
    // Align the open substitute's ink width and weight with the reference typeface.
    draw.translate(captionWidth * 0.025 - 2, captionHeight * 0.02);
    draw.scale(0.95, 0.96);
    const box = [0, 0, captionWidth, captionHeight] as const;
    const font = `${rounded}, ${fallback}`;
    const layout = { wrap: false, paragraphMetrics: true, blockAlignment: "center" } as const;
    drawFittedText(draw, box, text, font, 20, 50, "left", color, { ...layout, stroke: ["white", 0.12] });
    drawFittedText(draw, box, text, font, 20, 50, "left", color, { ...layout, stroke: [color, 0.022] });
  });
  context.signal.throwIfAborted();
  const caption = await loadImage(layer);
  const { png } = await renderExactPng(image.width, image.height, draw => {
    draw.drawImage(image, 0, 0);
    draw.translate(0, 10);
    rotateExpanded(draw, captionWidth, captionHeight, angle);
    draw.imageSmoothingQuality = "high";
    draw.drawImage(caption, 0, 0);
  });
  context.signal.throwIfAborted();
  return png;
}

export const pjskTemplate: MemeTemplate = {
  info: {
    key: "pjsk", keywords: ["pjsk", "世界计划"], tags: ["世界计划"], shortcuts: legacyCaptionShortcuts("pjsk"),
    params_type: {
      min_images: 0, max_images: 0, min_texts: 1, max_texts: 1, default_texts: [],
      args_type: {
        args_model: { properties: {
          character: { type: "integer", default: 0, description: characterHelp },
          number: { type: "integer", default: 0, description: numberHelp },
        } },
        args_examples: pjskCharacters.map((_, index) => ({ character: index + 1, number: 0 })),
        parser_options: [
          { names: ["-c", "--character", $t("templates.pjsk.text_88521a2e5a")], args: [{ name: "character", value: "int" }], help_text: characterHelp },
          { names: ["-n", "--number", $t("templates.pjsk.text_cf578fb3cc")], args: [{ name: "number", value: "int" }], help_text: numberHelp },
        ],
      },
    },
  },
  render({ texts, args }, context) {
    if (texts.length !== 1) throw new MemeTemplateFeedback($t("templates.pjsk.text_36a8dabb68"));
    return render(texts[0]!, args, context);
  },
  preview: context => render($t("templates.pjsk.text_dfca3fbfc4"), { character: 1, number: 1 }, context),
};
