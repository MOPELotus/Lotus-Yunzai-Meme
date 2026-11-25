import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("meme", messageCatalog.messages);
// Original layouts from MemeCrafters/meme-generator (619fa105).
import type { MemeTemplate } from "../builtin-template.ts";
import { readMemeFirstImage } from "./animated-input.ts";
import { drawFittedText, jpg, paper, previewImage, registerFont } from "./template-layout.ts";
import { readTransformSource, renderTransformSequence, transformPreviewInput } from "./transforms.ts";

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
      drawFittedText(draw, [0, 0, 900, 200], $t("templates.photo-composites.text_5eb7b9a45f"), font, 12, 100, "center", "#000", { wrap: false, paragraphMetrics: true });
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

const circleHelp = $t("templates.photo-composites.text_bd6b1d72aa");

function rotatedDimension(source: number, extent: number) {
  return Math.ceil((source + extent) / 2) - Math.floor((source - extent) / 2);
}

const kaleidoscope: MemeTemplate = {
  info: {
    key: "kaleidoscope",
    keywords: ["万花筒", "万花镜"],
    params_type: {
      min_images: 1, max_images: 1, min_texts: 0, max_texts: 0, default_texts: [],
      args_type: {
        args_model: { properties: { circle: { default: false, type: "boolean", description: circleHelp } } },
        args_examples: [{ circle: false }, { circle: true }],
        parser_options: [{ names: ["--circle", $t("templates.photo-composites.text_82d06faea1")], dest: "circle", args: [], action: { type: 0, value: true }, help_text: circleHelp }],
      },
    },
  },
  async render(input, context) {
    const source = await readTransformSource(input, context.signal);
    const circle = input.args.circle === true;
    const center = 600;
    return renderTransformSequence(source, center * 2, center * 2, (draw, avatar) => {
      paper(draw, center * 2, center * 2);
      for (let ring = 0; ring < 10; ring++) {
        const radius = ring * 50 + 100;
        const resizedWidth = ring * 35 + 100;
        const resizedHeight = Math.max(1, Math.floor(avatar.height * resizedWidth / avatar.width));
        const square = Math.min(resizedWidth, resizedHeight);
        const width = circle ? square : resizedWidth;
        const height = circle ? square : resizedHeight;
        for (let slot = 0; slot < 4; slot++) {
          const turns = (ring + slot * 2) % 8;
          const angle = turns * Math.PI / 4;
          const extent = (width + height) * Math.SQRT1_2;
          const quarterTurn = turns % 4 === 0;
          const rotatedWidth = turns % 2 !== 0 ? rotatedDimension(width, extent) : quarterTurn ? height : width;
          const rotatedHeight = turns % 2 !== 0 ? rotatedDimension(height, extent) : quarterTurn ? width : height;
          const x = Math.round(center + radius * Math.cos(angle) - rotatedWidth / 2) + rotatedWidth / 2;
          const y = Math.round(center - radius * Math.sin(angle) - rotatedHeight / 2) + rotatedHeight / 2;
          draw.save();
          draw.translate(x, y);
          draw.rotate(Math.PI / 2 - angle);
          if (circle) {
            draw.beginPath();
            draw.arc(0, 0, square / 2, 0, 2 * Math.PI);
            draw.clip();
          }
          const left = -width / 2 - Math.floor((resizedWidth - width) / 2);
          const top = -height / 2 - Math.floor((resizedHeight - height) / 2);
          draw.drawImage(avatar, left, top, resizedWidth, resizedHeight);
          draw.restore();
        }
      }
    }, context.signal);
  },
  async preview(context) {
    return kaleidoscope.render(await transformPreviewInput(context), context);
  },
};

export const photoCompositeMemeTemplates = [call110, trance, kaleidoscope] as const;
