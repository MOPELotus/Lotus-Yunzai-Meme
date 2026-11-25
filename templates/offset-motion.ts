import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("meme", messageCatalog.messages);
import type { MemeTemplate } from "../builtin-template.ts";
import type { Image } from "skia-canvas";
import { alignMemeLoop, readMemeImageSequence, type MemeImageSequence } from "./animated-input.ts";
import { renderPythonCanvasGif } from "./python-gif.ts";
import { previewImage, type Draw } from "./template-layout.ts";

const singleImage = { min_images: 1, max_images: 1, min_texts: 0, max_texts: 0 };
const delayMs = 50;
const directionHelp = $t("templates.offset-motion.text_83102bc065");
const directions = { left: $t("templates.offset-motion.text_e2e0c454e5"), right: $t("templates.offset-motion.text_14ab1f2bce"), top: $t("templates.offset-motion.text_db5ba671d2"), bottom: $t("templates.offset-motion.text_13c12b064b") } as const;

async function offsetAnimation(source: MemeImageSequence, width: number, height: number, poseCount: number,
  drawPose: (pose: number, image: Image) => Draw, signal: AbortSignal) {
  const poses = alignMemeLoop(source, poseCount, delayMs);
  return renderPythonCanvasGif({
    width, height, signal,
    frames: poses.map(value => ({ value, delayMs })),
    drawFrame: ({ overlay, image }, draw) => drawPose(overlay, image)(draw),
  });
}

const vibrate: MemeTemplate = {
  info: { key: "vibrate", keywords: ["震动"], params_type: { ...singleImage, args_type: null } },
  async render({ images }, { signal }) {
    const source = await readMemeImageSequence(images[0]!, signal);
    const { width, height } = source.frames[0];
    const offsetX = Math.floor(width / 25);
    const offsetY = Math.floor(height / 25);
    const frameWidth = width + offsetX;
    const frameHeight = height + offsetY;
    const positions = [[0, 0], [offsetX, offsetY], [Math.floor(width / 50), Math.floor(height / 50)],
      [0, offsetY], [offsetX, 0]] as const;
    return offsetAnimation(source, frameWidth, frameHeight, positions.length, (pose, image) => draw => {
      const [x, y] = positions[pose]!;
      draw.fillStyle = "#fff";
      draw.fillRect(0, 0, frameWidth, frameHeight);
      draw.drawImage(image, x, y);
    }, signal);
  },
  async preview(context) {
    return vibrate.render({ images: [await previewImage(context.signal)], texts: [], args: {} }, context);
  },
};

function roundCrop(value: number) {
  const integer = Math.floor(value);
  // The original crop uses round-to-even for exactly half a pixel.
  return value - integer === 0.5 ? integer + integer % 2 : Math.round(value);
}

const loop: MemeTemplate = {
  info: {
    key: "loop", keywords: ["循环"], params_type: {
      ...singleImage, args_type: {
        args_model: { properties: { direction: {
          type: "string", default: "top", enum: Object.keys(directions), description: directionHelp,
        } } },
        args_examples: Object.keys(directions).map(direction => ({ direction })),
        parser_options: [
          { names: ["-d", "--direction"], args: [{ name: "direction", value: "str" }], help_text: directionHelp },
          ...Object.entries(directions).map(([direction, alias]) => ({
            names: [`--${direction}`, alias], dest: "direction", action: { type: 0, value: direction },
          })),
        ],
      },
    },
  },
  async render({ images, args }, { signal }) {
    const { direction = "top" } = args;
    if (typeof direction !== "string" || !Object.hasOwn(directions, direction)) throw new Error(directionHelp);
    const source = await readMemeImageSequence(images[0]!, signal);
    const { width, height } = source.frames[0];
    const horizontal = direction === "left" || direction === "right";
    const forward = direction === "right" || direction === "bottom";
    const distance = horizontal ? width : height;
    const poseCount = 30;
    return offsetAnimation(source, width, height, poseCount, (pose, image) => draw => {
      const offset = roundCrop(distance / poseCount * pose);
      const position = forward ? offset : -offset;
      const wrapped = forward ? position - distance : position + distance;
      if (horizontal) {
        draw.drawImage(image, position, 0);
        draw.drawImage(image, wrapped, 0);
      } else {
        draw.drawImage(image, 0, position);
        draw.drawImage(image, 0, wrapped);
      }
    }, signal);
  },
  async preview(context) {
    return loop.render({ images: [await previewImage(context.signal)], texts: [], args: {} }, context);
  },
};

export const offsetMotionMemeTemplates = [vibrate, loop] as const;
