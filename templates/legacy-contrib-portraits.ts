import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("meme", messageCatalog.messages);
// Layouts from MemeCrafters/meme-generator-contrib (8547f2e5).
import { loadImage, type Image } from "skia-canvas";
import type { MemeTemplate } from "../builtin-template.ts";
import { readMemeFirstImage } from "./animated-input.ts";
import { jpg, paper, previewImage, type Draw } from "./template-layout.ts";

function drawCircularAvatar(draw: Parameters<Draw>[0], image: Image, x: number, y: number, size: number) {
  const square = Math.min(image.width, image.height);
  const left = Math.floor((image.width - square) / 2);
  const top = Math.floor((image.height - square) / 2);
  draw.save();
  draw.beginPath();
  draw.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  draw.clip();
  draw.drawImage(image, left, top, square, square, x, y, size, size);
  draw.restore();
}

const canCanNeed: MemeTemplate = {
  info: {
    key: "can_can_need",
    keywords: ["看看你的"],
    params_type: { min_images: 2, max_images: 2, min_texts: 0, max_texts: 0, default_texts: [], args_type: null },
  },
  async render({ images }, context) {
    const [frame, first, second] = await Promise.all([
      loadImage(await context.imageAsset("can_can_need/0.jpg")),
      readMemeFirstImage(images[0]!, context.signal),
      readMemeFirstImage(images[1]!, context.signal),
    ]);
    return jpg(frame.width, frame.height, draw => {
      paper(draw, frame.width, frame.height);
      draw.drawImage(frame, 0, 0);
      drawCircularAvatar(draw, second, 120, 21, 340);
      drawCircularAvatar(draw, first, 611, 718, 300);
    }, context.signal);
  },
  async preview(context) {
    const avatar = await previewImage(context.signal);
    return canCanNeed.render({ images: [avatar, avatar], texts: [], args: {} }, context);
  },
};

const stretch: MemeTemplate = {
  info: {
    key: "stretch",
    keywords: ["双手", "伸展"],
    params_type: { min_images: 1, max_images: 1, min_texts: 0, max_texts: 0, default_texts: [], args_type: null },
  },
  async render({ images }, context) {
    const [frame, avatar] = await Promise.all([
      loadImage(await context.imageAsset("stretch/0.png")),
      readMemeFirstImage(images[0]!, context.signal),
    ]);
    const scale = Math.max(500 / avatar.width, 500 / avatar.height);
    const width = Math.floor(avatar.width * scale), height = Math.floor(avatar.height * scale);
    const left = Math.trunc((500 - width) / 2), top = Math.trunc((500 - height) / 2);
    return jpg(frame.width, frame.height, draw => {
      paper(draw, frame.width, frame.height);
      draw.drawImage(avatar, left, top, width, height);
      draw.drawImage(frame, 0, 0);
    }, context.signal);
  },
  async preview(context) {
    const avatar = await previewImage(context.signal);
    return stretch.render({ images: [avatar], texts: [], args: {} }, context);
  },
};

export const legacyContribPortraitTemplates = [canCanNeed, stretch] as const;
