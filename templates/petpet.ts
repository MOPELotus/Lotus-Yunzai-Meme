import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("meme", messageCatalog.messages);
import { Canvas, loadImage } from "skia-canvas";
import { renderRgba } from "@lotus-yunzai/skia";
import type { MemeTemplate, MemeTemplateContext } from "../builtin-template.ts";
import { alignMemeLoop, readMemeImageSequence, type MemeImageSequence } from "./animated-input.ts";
import { encodeMemeGif } from "./gif.ts";

const size = 112;
const delayMs = 60;
const animatedFrameLimit = 200;
const poses = [
  [14, 20, 98, 98],
  [12, 33, 101, 85],
  [8, 40, 110, 76],
  [10, 33, 102, 84],
  [12, 20, 98, 98],
] as const;

async function animate(source: MemeImageSequence, circle: boolean, context: MemeTemplateContext) {
  const hands = await Promise.all(poses.map(async (_, index) => {
    const image = await loadImage(await context.imageAsset(`petpet/${index}.png`));
    if (image.width !== size || image.height !== size) throw new Error($t("templates.petpet.text_9eb863b5eb"));
    return image;
  }));
  const frames = [];
  for (const { overlay, image } of alignMemeLoop(source, poses.length, delayMs, animatedFrameLimit)) {
    context.signal.throwIfAborted();
    const [left, top, width, height] = poses[overlay]!;
    const square = Math.min(image.width, image.height);
    const cropX = Math.round((image.width - square) / 2);
    const cropY = Math.round((image.height - square) / 2);
    const { rgba } = await renderRgba(size, size, draw => {
      draw.save();
      if (circle) {
        draw.beginPath();
        draw.ellipse(left + width / 2, top + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
        draw.clip();
      }
      draw.drawImage(image, cropX, cropY, square, square, left, top, width, height);
      draw.restore();
      draw.drawImage(hands[overlay]!, 0, 0);
    });
    frames.push({ rgba, delayMs });
  }
  return encodeMemeGif(size, size, frames, context.signal);
}

export const petpet: MemeTemplate = {
  info: {
    key: "petpet",
    keywords: ["摸", "摸摸", "摸头", "rua"],
    params_type: {
      min_images: 1,
      max_images: 1,
      min_texts: 0,
      max_texts: 0,
      args_type: {
        args_model: { properties: { circle: { type: "boolean", default: false, description: $t("templates.petpet.text_bd6b1d72aa") } } },
        parser_options: [{ names: ["-c", "--circle", $t("templates.petpet.text_82d06faea1"), $t("templates.petpet.text_fd8ae5af87")], dest: "circle", args: [], action: { type: 0, value: true } }],
      },
    },
  },
  async render({ images, args }, context) {
    if (images.length !== 1) throw new Error($t("templates.petpet.text_6e1e87beb6"));
    return animate(await readMemeImageSequence(images[0]!, context.signal, "skia"), args.circle === true, context);
  },
  async preview(context) {
    context.signal.throwIfAborted();
    const canvas = new Canvas(500, 500);
    const draw = canvas.getContext("2d");
    draw.fillStyle = "#ffffff";
    draw.fillRect(0, 0, 500, 500);
    draw.fillStyle = "#cccccc";
    for (let y = 0; y < 20; y++) {
      for (let x = y % 2; x < 20; x += 2) draw.fillRect(x * 25, y * 25, 25, 25);
    }
    return animate({ frames: [await loadImage(await canvas.png)], averageDelayMs: 0 }, false, context);
  },
};
