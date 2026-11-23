// Original layouts from MemeCrafters/meme-generator (619fa105).
import type { MemeTemplate } from "../builtin-template.ts";
import { readMemeFirstImage } from "./animated-input.ts";
import { drawFittedText, jpg, paper, previewImage, registerFont } from "./template-layout.ts";

const call110: MemeTemplate = {
  info: {
    key: "call_110",
    keywords: ["遇到困难请拨打"],
    params_type: { min_images: 2, max_images: 2, min_texts: 0, max_texts: 0, default_texts: [], args_type: null },
  },
  async render({ images }, context) {
    const [one, zero] = await Promise.all([
      readMemeFirstImage(images[0]!, context.signal),
      readMemeFirstImage(images[1]!, context.signal),
    ]);
    const font = await registerFont(context);
    return jpg(900, 500, draw => {
      paper(draw, 900, 500);
      drawFittedText(draw, [0, 0, 900, 200], "遇到困难请拨打", font, 12, 100, "center", "#000", { wrap: false, paragraphMetrics: true });
      [one, one, zero].forEach((image, index) => {
        const square = Math.min(image.width, image.height);
        const x = Math.floor((image.width - square) / 2);
        const y = Math.floor((image.height - square) / 2);
        draw.drawImage(image, x, y, square, square, 50 + index * 275, 200, 250, 250);
      });
    }, context.signal);
  },
  async preview(context) {
    const avatar = await previewImage(context.signal);
    return call110.render({ images: [avatar, avatar], texts: [], args: {} }, context);
  },
};

const trance: MemeTemplate = {
  info: {
    key: "trance",
    keywords: ["恍惚"],
    params_type: { min_images: 1, max_images: 1, min_texts: 0, max_texts: 0, default_texts: [], args_type: null },
  },
  async render({ images }, context) {
    const avatar = await readMemeFirstImage(images[0]!, context.signal);
    const { width, height } = avatar;
    const shift = Math.floor(height * 0.1);
    const lowerEnd = Math.floor(height * 0.2) - shift;
    const croppedHeight = Math.floor(height * 1.1) - shift;
    return jpg(width, croppedHeight, draw => {
      paper(draw, width, croppedHeight);
      draw.drawImage(avatar, 0, 0);
      draw.globalAlpha = 3 / 255;
      for (let offset = 0; offset > -shift; offset--) draw.drawImage(avatar, 0, offset);
      for (let offset = 0; offset < lowerEnd; offset++) draw.drawImage(avatar, 0, offset);
      draw.globalAlpha = 1;
    }, context.signal);
  },
  async preview(context) {
    return trance.render({ images: [await previewImage(context.signal)], texts: [], args: {} }, context);
  },
};

export const photoCompositeMemeTemplates = [call110, trance] as const;
