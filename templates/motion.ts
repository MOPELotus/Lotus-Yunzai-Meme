import { renderPng, renderRgba } from "@lotus-yunzai/skia";
import type { MemeTemplate, MemeTemplateContext } from "../builtin-template.ts";
import { alignMemeLoop, readMemeFirstImage, readMemeImageSequence } from "./animated-input.ts";
import { assertMemeGifDimensions, encodeMemeGif } from "./gif.ts";

const singleImage = { min_images: 1, max_images: 1, min_texts: 0, max_texts: 0 };
const directionHelp = "跑动方向，包含 left_right、right_left";
const directions = [["left_right", "左右"], ["right_left", "右左"]] as const;

async function previewImage(context: MemeTemplateContext) {
  context.signal.throwIfAborted();
  const { png } = await renderPng(100, 100, draw => {
    draw.fillStyle = "#f4f4f4";
    draw.fillRect(0, 0, 100, 100);
    draw.fillStyle = "#f0bc72";
    draw.fillRect(8, 14, 44, 68);
    draw.fillStyle = "#75ad8c";
    draw.fillRect(52, 60, 40, 22);
  });
  return new File([Buffer.from(png)], "meme-preview.png", { type: "image/png" });
}

const turn: MemeTemplate = {
  info: { key: "turn", keywords: ["转"], params_type: { ...singleImage, args_type: null } },
  async render({ images }, { signal }) {
    const image = await readMemeFirstImage(images[0]!, signal);
    const size = 250;
    const crop = Math.min(image.width, image.height);
    const left = Math.floor((image.width - crop) / 2);
    const top = Math.floor((image.height - crop) / 2);
    const frames = [];
    for (let index = 0; index < 36; index++) {
      signal.throwIfAborted();
      const { rgba } = await renderRgba(size, size, draw => {
        draw.translate(size / 2, size / 2);
        draw.rotate(-index * Math.PI / 18);
        draw.beginPath();
        draw.arc(0, 0, size / 2, 0, Math.PI * 2);
        draw.clip();
        draw.drawImage(image, left, top, crop, crop, -size / 2, -size / 2, size, size);
      });
      frames.push({ rgba, delayMs: 50 });
    }
    if (Math.random() < 0.5) frames.reverse();
    return encodeMemeGif(size, size, frames, signal);
  },
  async preview(context) {
    return turn.render({ images: [await previewImage(context)], texts: [], args: {} }, context);
  },
};

const leftRightJump: MemeTemplate = {
  info: {
    key: "left_right_jump",
    keywords: ["左右横跳"],
    params_type: {
      ...singleImage,
      args_type: {
        args_model: {
          properties: { direction: { type: "string", default: "left_right", enum: directions.map(([value]) => value), description: directionHelp } },
        },
        args_examples: directions.map(([direction]) => ({ direction })),
        parser_options: [
          { names: ["-d", "--direction"], args: [{ name: "direction", value: "str" }], help_text: directionHelp },
          ...directions.map(([value, alias]) => ({ names: [`--${value}`, alias], dest: "direction", action: { type: 0, value } })),
        ],
      },
    },
  },
  async render({ images, args }, { signal }) {
    if (args.direction !== undefined && args.direction !== "left_right" && args.direction !== "right_left") {
      throw new Error(directionHelp);
    }
    const source = await readMemeImageSequence(images[0]!, signal);
    const frameWidth = 300;
    const imageWidth = 100;
    const imageHeight = Math.max(1, Math.floor(source.frames[0].height * imageWidth / source.frames[0].width));
    const frameHeight = imageHeight + 30;
    const frames = [];
    const distance = frameWidth - imageWidth;
    const timeline = alignMemeLoop(source, 30, 40);
    assertMemeGifDimensions(frameWidth, frameHeight, timeline.length);
    for (const { overlay, image } of timeline) {
      signal.throwIfAborted();
      const returning = overlay >= 15;
      const step = returning ? 29 - overlay : overlay;
      const progress = distance * step / 14;
      const x = args.direction === "right_left" ? progress : distance - progress;
      const arcCenter = x < distance / 2 ? distance / 4 : distance * 3 / 4;
      const jump = 15 * (1 - ((x - arcCenter) / (distance / 4)) ** 2);
      const { rgba } = await renderRgba(frameWidth, frameHeight, draw => {
        draw.translate(Math.round(x) + (returning ? imageWidth : 0), Math.round(30 - jump));
        if (returning) draw.scale(-1, 1);
        draw.drawImage(image, 0, 0, imageWidth, imageHeight);
      });
      frames.push({ rgba, delayMs: 40 });
    }
    return encodeMemeGif(frameWidth, frameHeight, frames, signal);
  },
  async preview(context) {
    return leftRightJump.render({ images: [await previewImage(context)], texts: [], args: {} }, context);
  },
};

export const motionMemeTemplates = [turn, leftRightJump] as const;
