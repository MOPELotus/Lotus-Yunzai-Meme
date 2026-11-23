// Layouts from MemeCrafters/meme-generator (619fa105).
import { loadImage, type Image } from "skia-canvas";
import { renderExactPng } from "../../../packages/skia/index.ts";
import { MemeTemplateFeedback, type MemeTemplate } from "../builtin-template.ts";
import { readMemeFirstImage } from "./animated-input.ts";
import { layoutMemeText } from "./bbcode-text.ts";
import { drawFittedText, jpg, paper, previewImage, registerFont, registerMemeTypeface } from "./template-layout.ts";
import { readTransformSource, renderTransformSequence, transformPreviewInput } from "./transforms.ts";

const keepAwayCaption = "如何提高社交质量 : \n远离以下头像的人";

async function opaqueSquare(avatar: Image, signal: AbortSignal) {
  signal.throwIfAborted();
  const size = Math.min(avatar.width, avatar.height);
  const x = Math.floor((avatar.width - size) / 2);
  const y = Math.floor((avatar.height - size) / 2);
  const { png } = await renderExactPng(100, 100, draw => {
    draw.imageSmoothingQuality = "high";
    draw.drawImage(avatar, x, y, size, size, 0, 0, 100, 100);
    const pixels = draw.getImageData(0, 0, 100, 100);
    // The original pastes onto an RGB canvas with no transparency mask.
    for (let offset = 3; offset < pixels.data.length; offset += 4) pixels.data[offset] = 255;
    draw.putImageData(pixels, 0, 0);
  });
  signal.throwIfAborted();
  return loadImage(png);
}

const keepAway: MemeTemplate = {
  info: {
    key: "keep_away",
    keywords: ["远离"],
    params_type: { min_images: 1, max_images: 8, min_texts: 0, max_texts: 1, default_texts: [keepAwayCaption], args_type: null },
  },
  async render({ images, texts }, context) {
    const avatars = await Promise.all(images.map(async image =>
      opaqueSquare(await readMemeFirstImage(image, context.signal), context.signal)));
    const perAvatar = Math.floor(8 / avatars.length);
    const font = await registerFont(context);
    const caption = texts[0] ?? keepAwayCaption;
    return jpg(400, 290, draw => {
      paper(draw, 400, 290);
      drawFittedText(draw, [10, 10, 390, 80], caption, font, 12, 40, "left", "#000", { wrap: false, paragraphMetrics: true });
      for (let slot = 0; slot < 8; slot++) {
        const owner = Math.min(avatars.length - 1, Math.floor(slot / perAvatar));
        const pose = slot - owner * perAvatar;
        draw.save();
        draw.translate((slot % 4) * 100 + 50, 140 + Math.floor(slot / 4) * 100);
        draw.rotate(-(pose % 4) * Math.PI / 2);
        if (pose >= 4) draw.scale(-1, 1);
        draw.drawImage(avatars[owner]!, -50, -50);
        draw.restore();
      }
    }, context.signal);
  },
  async preview(context) {
    return keepAway.render({ images: [await previewImage(context.signal)], texts: [], args: {} }, context);
  },
};

const littleAngel: MemeTemplate = {
  info: {
    key: "little_angel",
    keywords: ["小天使"],
    params_type: { min_images: 1, max_images: 1, min_texts: 0, max_texts: 1, default_texts: [], args_type: null },
  },
  async render(input, context) {
    const sequence = await readTransformSource(input, context.signal);
    const image = sequence.frames[0];
    const imageHeight = Math.max(1, Math.floor(image.height * 500 / image.width));
    const font = await registerFont(context, true);
    const user: unknown = Array.isArray(input.args.user_infos) ? input.args.user_infos[0] : undefined;
    const info = user && typeof user === "object" ? user as { name?: unknown; gender?: unknown } : undefined;
    const pronoun = !input.texts.length && info?.gender === "male" ? "他" : "她";
    const name = input.texts[0] ?? (typeof info?.name === "string" && info.name ? info.name : pronoun);
    return renderTransformSequence(sequence, 600, imageHeight + 230, (draw, frame) => {
      paper(draw, 600, imageHeight + 230);
      const textLayout = { wrap: false, paragraphMetrics: true };
      drawFittedText(draw, [20, 0, 580, 110], `请问你们看到${name}了吗?`, font, 25, 70, "center", "#000", textLayout);
      draw.drawImage(frame, 50, 110, 500, imageHeight);
      drawFittedText(draw, [10, imageHeight + 120, 590, imageHeight + 185], "非常可爱！简直就是小天使",
        font, 12, 48, "center", "#000", textLayout);
      drawFittedText(draw, [20, imageHeight + 180, 580, imageHeight + 215], `${pronoun}没失踪也没怎么样  我只是觉得你们都该看一下`,
        font, 12, 26, "center", "#000", textLayout);
    }, context.signal);
  },
  async preview(context) {
    return littleAngel.render(await transformPreviewInput(context), context);
  },
};

const follow: MemeTemplate = {
  info: {
    key: "follow",
    keywords: ["关注"],
    params_type: { min_images: 1, max_images: 1, min_texts: 0, max_texts: 1, default_texts: [], args_type: null },
  },
  async render({ images, texts, args }, context) {
    const [avatar, regular, cjk] = await Promise.all([
      readMemeFirstImage(images[0]!, context.signal),
      registerMemeTypeface(context, "LiberationSans-Regular.ttf", "LotusMemeLiberationSans"),
      registerFont(context),
    ]);
    const user: unknown = Array.isArray(args.user_infos) ? args.user_infos[0] : undefined;
    const info = user && typeof user === "object" ? user as { name?: unknown; gender?: unknown } : undefined;
    const fallbackName = info?.gender === "female" ? "女同" : "男同";
    const name = texts[0] ?? (typeof info?.name === "string" && info.name ? info.name : fallbackName);
    const families = { regular, cjk };
    const caption = (text: string, color: string) => layoutMemeText(text.split(/\r\n|\r|\n/u).map(line => ({
      alignment: "left",
      spans: [{ text: line, size: 60, color }],
    })), undefined, families);
    const nameBlock = caption(name, "black");
    const label = caption("关注了你", "#808080");
    const textWidth = Math.max(nameBlock.width, label.width);
    if (textWidth >= 1000) throw new MemeTemplateFeedback("文字过长，无法放进表情模板。");
    const width = 350 + textWidth;
    const size = Math.min(avatar.width, avatar.height);
    const x = Math.floor((avatar.width - size) / 2);
    const y = Math.floor((avatar.height - size) / 2);
    return jpg(width, 300, draw => {
      paper(draw, width, 300);
      draw.save();
      draw.beginPath();
      draw.arc(150, 150, 100, 0, 2 * Math.PI);
      draw.clip();
      draw.drawImage(avatar, x, y, size, size, 50, 50, 200, 200);
      draw.restore();
      nameBlock.draw(draw, 300, 135 - nameBlock.height);
      label.draw(draw, 300, 145);
    }, context.signal);
  },
  async preview(context) {
    return follow.render({ images: [await previewImage(context.signal)], texts: [], args: {} }, context);
  },
};

export const avatarCaptionMemeTemplates = [keepAway, littleAngel, follow] as const;
