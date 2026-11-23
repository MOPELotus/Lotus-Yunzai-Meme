// Visual layout and parameters follow MemeCrafters/meme-generator v0.1.14.
// https://github.com/MemeCrafters/meme-generator/tree/f5ee44f6a3e134b9ac54032f97eab788d6454e3c/meme_generator/memes
import type { CanvasRenderingContext2D, Image } from "skia-canvas";
import type { MemeTemplate, MemeTemplateContext, MemeTemplateInput } from "../builtin-template.ts";
import { readMemeImageSequence, type MemeImageSequence } from "./animated-input.ts";
import { encodeMemeGif } from "./gif.ts";
import { drawFittedText, jpg, previewImage, registerFont, rgbaFrame } from "./template-layout.ts";

const flatWidth = 500;
const captionHeight = 80;
const defaultCaption = "可恶...被人看扁了";
const flatRatioHelp = "图片“压扁”比例，默认为 2";
const directionHelp = "对称方向，包含 left、right、top、bottom";
const directions = [["left", "左"], ["right", "右"], ["top", "上"], ["bottom", "下"]] as const;

type Direction = typeof directions[number][0];
type DrawFrame = (canvas: CanvasRenderingContext2D, image: Image) => void;

export function readTransformSource(input: MemeTemplateInput, signal: AbortSignal) {
  if (input.images.length !== 1) throw new Error("该表情需要一张图片。");
  return readMemeImageSequence(input.images[0]!, signal);
}

export async function renderTransformSequence(sequence: MemeImageSequence, width: number, height: number, draw: DrawFrame, signal: AbortSignal) {
  if (sequence.frames.length === 1) return jpg(width, height, canvas => {
    canvas.fillStyle = "white";
    canvas.fillRect(0, 0, width, height);
    draw(canvas, sequence.frames[0]);
  }, signal);

  if (width < 1 || height < 1 || width > 4096 || height > 4096 || sequence.frames.length > 200 ||
      width * height * sequence.frames.length > 24_000_000) throw new RangeError("表情动图的尺寸或帧数超限。");
  const frames = [];
  // The old single-image animation draws each input frame once and uses the mean duration.
  const delayMs = Math.floor(sequence.averageDelayMs / 10) * 10;
  let frameWidth = 0, frameHeight = 0;
  for (const frame of sequence.frames) {
    signal.throwIfAborted();
    const rendered = await rgbaFrame(width, height, target => draw(target, frame), signal);
    frameWidth = rendered.width;
    frameHeight = rendered.height;
    frames.push({ rgba: rendered.rgba, delayMs });
  }
  return encodeMemeGif(frameWidth, frameHeight, frames, signal);
}

function drawHalf(ctx: CanvasRenderingContext2D, image: Image, horizontal: boolean, half: number, position: number, mirrored: boolean) {
  ctx.save();
  ctx.beginPath();
  if (horizontal) ctx.rect(position, 0, half, image.height);
  else ctx.rect(0, position, image.width, half);
  ctx.clip();
  if (mirrored) {
    // Flip the full image before cropping. The unpaired pixel still affects the flipped half.
    ctx.translate(horizontal ? image.width : 0, horizontal ? 0 : image.height);
    ctx.scale(horizontal ? -1 : 1, horizontal ? 1 : -1);
  }
  ctx.drawImage(image, 0, 0);
  ctx.restore();
}

async function renderSymmetric(input: MemeTemplateInput, context: MemeTemplateContext) {
  const direction = input.args.direction ?? "left";
  if (!directions.some(([known]) => known === direction)) throw new Error("请选择 left、right、top、bottom 之一作为对称方向。");
  const sequence = await readTransformSource(input, context.signal);
  const { width, height } = sequence.frames[0];
  const horizontal = direction === "left" || direction === "right";
  const half = Math.floor((horizontal ? width : height) / 2);
  if (!half) throw new Error("图片太窄，无法按这个方向对称。");
  const original = direction === "right" || direction === "bottom" ? half : 0;
  return renderTransformSequence(sequence, horizontal ? half * 2 : width, horizontal ? height : half * 2, (canvas, image) => {
    canvas.imageSmoothingEnabled = false;
    drawHalf(canvas, image, horizontal, half, original, false);
    drawHalf(canvas, image, horizontal, half, half - original, true);
  }, context.signal);
}

async function renderLookFlat(input: MemeTemplateInput, context: MemeTemplateContext) {
  const sequence = await readTransformSource(input, context.signal);
  const { width, height } = sequence.frames[0];
  const ratio = input.args.ratio ?? 2;
  if (typeof ratio !== "number" || !Number.isSafeInteger(ratio) || ratio < 1 || ratio >= height) {
    throw new Error("请输入合适的“压扁”比例。");
  }
  const imageHeight = Math.floor(Math.floor(height * flatWidth / width) / ratio);
  if (!imageHeight) throw new Error("请输入合适的“压扁”比例。");
  const canvasHeight = imageHeight + captionHeight;
  const font = await registerFont(context, true);
  const text = input.texts[0] ?? defaultCaption;
  return renderTransformSequence(sequence, flatWidth, canvasHeight, (canvas, image) => {
    canvas.fillStyle = "white";
    canvas.fillRect(0, 0, flatWidth, canvasHeight);
    canvas.imageSmoothingQuality = "high";
    canvas.drawImage(image, 0, 0, flatWidth, imageHeight);
    drawFittedText(canvas, [10, imageHeight, flatWidth - 10, canvasHeight], text, font, 30, 55);
  }, context.signal);
}

export async function transformPreviewInput(context: MemeTemplateContext): Promise<MemeTemplateInput> {
  return { images: [await previewImage(context.signal)], texts: [], args: {} };
}

const singleInput = { min_images: 1, max_images: 1, min_texts: 0 } as const;

export const transformMemeTemplates: readonly MemeTemplate[] = [
  {
    info: {
      key: "symmetric", keywords: ["对称"],
      params_type: { ...singleInput, max_texts: 0, default_texts: [], args_type: {
        args_model: { properties: { direction: { type: "string", default: "left", enum: directions.map(([value]) => value), description: directionHelp } } },
        args_examples: directions.map(([direction]) => ({ direction })),
        parser_options: [
          { names: ["-d", "--direction"], args: [{ name: "direction", value: "str" }], help_text: directionHelp },
          ...directions.map(([value, alias]) => ({ names: [`--${value}`, alias], dest: "direction", action: { type: 0, value } })),
        ],
      } },
    },
    render: renderSymmetric,
    preview: async context => renderSymmetric(await transformPreviewInput(context), context),
  },
  {
    info: {
      key: "look_flat", keywords: ["看扁"],
      params_type: { ...singleInput, max_texts: 1, default_texts: [defaultCaption], args_type: {
        args_model: { properties: { ratio: { type: "integer", default: 2, description: flatRatioHelp } } },
        parser_options: [{ names: ["-r", "--ratio"], args: [{ name: "ratio", value: "int" }], help_text: flatRatioHelp }],
      } },
    },
    render: renderLookFlat,
    preview: async context => renderLookFlat(await transformPreviewInput(context), context),
  },
];
