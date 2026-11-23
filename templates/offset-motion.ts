import { renderRgba } from "@lotus-yunzai/skia";
import type { MemeTemplate } from "../builtin-template.ts";
import type { Image } from "skia-canvas";
import { alignMemeLoop, readMemeImageSequence, type MemeImageSequence } from "./animated-input.ts";
import { assertMemeGifDimensions, encodeMemeGif } from "./gif.ts";
import { previewImage, type Draw } from "./template-layout.ts";

const singleImage = { min_images: 1, max_images: 1, min_texts: 0, max_texts: 0 };
const delayMs = 50;
const directionHelp = "循环方向，包含 left、right、top、bottom";
const directions = { left: "左", right: "右", top: "上", bottom: "下" } as const;

async function offsetAnimation(source: MemeImageSequence, width: number, height: number, poseCount: number,
  drawPose: (pose: number, image: Image) => Draw, signal: AbortSignal) {
  const poses = alignMemeLoop(source, poseCount, delayMs);
  assertMemeGifDimensions(width, height, poses.length);
  const frames = [];
  for (const { overlay, image } of poses) {
    signal.throwIfAborted();
    const { rgba } = await renderRgba(width, height, drawPose(overlay, image));
    frames.push({ rgba, delayMs });
  }
  return encodeMemeGif(width, height, frames, signal);
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
