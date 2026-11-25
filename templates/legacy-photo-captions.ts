import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("meme", messageCatalog.messages);
// Original layouts from MemeCrafters/meme-generator at 619fa10518fc2eca4fa1053af37f0a00a839f062.
import { Canvas, loadImage, type Image } from "skia-canvas";
import { MemeTemplateFeedback, type MemeTemplate, type MemeTemplateInput } from "../builtin-template.ts";
import { readMemeFirstImage } from "./animated-input.ts";
import { renderMaskedRaster } from "./masked-layout.ts";
import { jpg, previewImage, registerFont, type Draw } from "./template-layout.ts";
import { readTransformSource, renderTransformSequence, transformPreviewInput } from "./transforms.ts";

const speechless: MemeTemplate = {
  info: {
    key: "speechless", keywords: ["无语"],
    shortcuts: [{ key: "(?P<text>典型的\\S+思维)", args: ["{text}"], humanized: $t("templates.legacy-photo-captions.text_675d8c7ce2") }],
    params_type: { min_images: 1, max_images: 1, min_texts: 0, max_texts: 1, default_texts: [], args_type: null },
  },
  async render(input, context) {
    const { signal } = context;
    const [source, font, sweat] = await Promise.all([
      readTransformSource(input, signal), registerFont(context),
      context.imageAsset("speechless/sweat.png").then(loadImage),
    ]);
    const line = $t("templates.legacy-photo-captions.text_fc01aed9da");
    const text = input.texts.length ? `${line}\n${input.texts[0]}` : line;
    const width = 500;
    const wrapWidth = 480;
    const photo = source.frames[0];
    const photoHeight = Math.max(1, Math.floor(photo.height * width / photo.width));
    const measure = new Canvas(1, 1).getContext("2d");
    const textFont = `45px ${font}`;
    measure.font = textFont;
    measure.textWrap = true;
    const { lines } = measure.measureText(text, wrapWidth);
    const first = lines[0]!, last = lines.at(-1)!;
    const textHeight = Math.round(last.descent - first.ascent);
    const height = photoHeight + textHeight + 10;
    if (height > 8192) throw new MemeTemplateFeedback($t("templates.legacy-photo-captions.text_f6882f59b7"));
    return renderTransformSequence(source, width, height, (canvas, avatar) => {
      canvas.fillStyle = "white";
      canvas.fillRect(0, 0, width, height);
      canvas.imageSmoothingQuality = "high";
      canvas.drawImage(avatar, 0, 0, width, photoHeight);
      canvas.font = textFont;
      canvas.textAlign = "center";
      canvas.textBaseline = "alphabetic";
      canvas.textWrap = true;
      canvas.fillStyle = "black";
      canvas.fillText(text, width / 2, photoHeight - first.ascent, wrapWidth);
      canvas.drawImage(sweat, 300, 120, 80, 80);
    }, signal);
  },
  async preview(context) {
    return speechless.render(await transformPreviewInput(context), context);
  },
};

function tombPortrait(avatar: Image, left: number, top: number, angle: number): Draw {
  const radius = 72.5;
  const side = Math.min(avatar.width, avatar.height);
  const x = Math.floor((avatar.width - side) / 2), y = Math.floor((avatar.height - side) / 2);
  return canvas => {
    canvas.imageSmoothingQuality = "high";
    canvas.translate(left + radius, top + radius);
    canvas.rotate(angle);
    canvas.beginPath();
    canvas.arc(0, 0, radius, 0, Math.PI * 2);
    canvas.clip();
    canvas.drawImage(avatar, x, y, side, side, -radius, -radius, radius * 2, radius * 2);
  };
}

const tombYeah: MemeTemplate = {
  info: {
    key: "tomb_yeah", keywords: ["上坟", "坟前比耶"],
    params_type: { min_images: 1, max_images: 2, min_texts: 0, max_texts: 0, default_texts: [], args_type: null },
  },
  async render({ images }: MemeTemplateInput, context) {
    const { signal } = context;
    const [art, first, second] = await Promise.all([
      context.imageAsset("tomb_yeah/0.jpg").then(loadImage),
      images[0] && readMemeFirstImage(images[0], signal),
      images[1] && readMemeFirstImage(images[1], signal),
    ]);
    if (!first) throw new MemeTemplateFeedback($t("templates.legacy-photo-captions.text_1d4fb806b2"));
    const layers = [tombPortrait(first, 138, 265, 0)];
    if (second) layers.push(tombPortrait(second, 371, 312, -Math.PI / 6));
    const bytes = await renderMaskedRaster(art.width, art.height, canvas => canvas.drawImage(art, 0, 0), layers, signal);
    const rendered = await loadImage(bytes);
    return jpg(art.width, art.height, canvas => canvas.drawImage(rendered, 0, 0), signal);
  },
  async preview(context) {
    return tombYeah.render({ images: [await previewImage(context.signal)], texts: [], args: {} }, context);
  },
};

export const legacyPhotoCaptionTemplates = [speechless, tombYeah] as const;
